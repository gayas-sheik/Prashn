"""Deliver a CI-tested artifact to an existing stack; never create a new stack.

Only ArtifactKey/ArtifactDigest may change. Infrastructure changes and an
unexpected resolved AMI are rejected before execution. Cleanup waits for any
CloudFormation update to finish, then closes admission/drains and pauses.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import time
from types import SimpleNamespace

from verify_deployment import Audit, Blocked, require


def validate_package(folder, revision):
    require(re.fullmatch('[a-f0-9]{40}', revision) is not None, 'Expected a full tested Git revision')
    manifest = json.loads((folder / 'manifest.json').read_text())
    require(manifest['revision'] == revision, 'Artifact was built from a different revision')
    archive = folder / 'release.tar.gz'
    require(hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['archiveSha256'], 'Archive checksum mismatch')
    exact = {'backend/package.json', 'backend/package-lock.json', 'infra/bootstrap.sh',
             'infra/verify-native.sh', 'infra/signal-ready.sh', '.aws-build/release-manifest.json'}
    with tarfile.open(archive) as source:
        seen = set()
        for member in source.getmembers():
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in member.name,
                    'Unsafe archive member path')
            require(not member.issym() and not member.islnk() and (member.isdir() or member.isfile()),
                    'Archive contains links or special files')
            require(member.name not in seen, 'Archive contains duplicate paths')
            seen.add(member.name)
            if member.isfile():
                require(member.name in exact or member.name.startswith('backend/dist/'), 'Unexpected archive file')
                require(not any(p == '.env' or p.startswith('.env.') for p in path.parts), 'Environment file must not be published')
        require(exact.issubset(seen) and 'backend/dist/server.js' in seen and 'backend/dist/worker.js' in seen,
                'Required runtime files missing')
        info = json.load(source.extractfile('.aws-build/release-manifest.json'))
        require(info['revision'] == revision, 'Backend manifest revision mismatch')
    frontend = folder / 'frontend'
    require(frontend.is_dir() and not frontend.is_symlink(), 'Frontend directory missing or linked')
    files = {}
    for path in frontend.rglob('*'):
        require(not path.is_symlink(), 'Frontend contains a symbolic link')
        if path.is_file():
            name = path.relative_to(frontend).as_posix()
            require(not any(p.startswith('.') for p in PurePosixPath(name).parts), 'Frontend includes hidden files')
            files[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    require(files == manifest['frontendSha256'] and 'index.html' in files, 'Frontend checksum/membership mismatch')
    return manifest


def previous_parameters(parameters, digest):
    result = []
    keys = {p['ParameterKey'] for p in parameters}
    require({'ArtifactKey', 'ArtifactDigest'}.issubset(keys), 'Stack lacks release artifact parameters')
    for p in parameters:
        key = p['ParameterKey']
        if key == 'ArtifactKey':
            result.append({'ParameterKey': key, 'ParameterValue': digest + '.tar.gz'})
        elif key == 'ArtifactDigest':
            result.append({'ParameterKey': key, 'ParameterValue': digest})
        else:
            result.append({'ParameterKey': key, 'UsePreviousValue': True})
    return result


def validate_change_set(change, previous):
    require(bool(change.get('Changes')), 'Change set contains no release changes')
    allowed = {'ApiLaunch': 'AWS::EC2::LaunchTemplate', 'WorkerLaunch': 'AWS::EC2::LaunchTemplate',
               'ApiGroup': 'AWS::AutoScaling::AutoScalingGroup', 'WorkerGroup': 'AWS::AutoScaling::AutoScalingGroup',
               'ApiRole': 'AWS::IAM::Role', 'WorkerRole': 'AWS::IAM::Role'}
    for entry in change.get('Changes', []):
        r = entry['ResourceChange']
        require(r['LogicalResourceId'] in allowed and r['ResourceType'] == allowed[r['LogicalResourceId']]
                and r['Action'] == 'Modify' and r.get('Replacement') == 'False',
                'Refused unreviewed change: '
                + str(r.get('LogicalResourceId')) + ' (' + str(r.get('ResourceType'))
                + ', action=' + str(r.get('Action')) + ', replacement=' + str(r.get('Replacement')) + ')')
    old = {p['ParameterKey']: p for p in previous}
    new = {p['ParameterKey']: p for p in change.get('Parameters', [])}
    for key, value in old.items():
        if key in ('ArtifactKey', 'ArtifactDigest'):
            continue
        require(key in new and new[key].get('ParameterValue') == value.get('ParameterValue'),
                'A non-release parameter changed')
        if value.get('ResolvedValue'):
            require(new[key].get('ResolvedValue') == value['ResolvedValue'],
                    'Public AMI/configuration alias resolved to a different value; review an infrastructure update separately')


def proposed_change_summary(change, revision, id_):
    """Preserve reviewable metadata before rejecting/deleting a change set.

    Never include before/after properties, userdata, parameter values or secrets.
    A proposed change summary is not evidence that anything was executed.
    """
    changes = []
    for entry in change.get('Changes', []):
        resource = entry['ResourceChange']
        row = {k: resource.get(k) for k in ('LogicalResourceId', 'ResourceType', 'Action', 'Replacement')}
        row['details'] = [{'target': {k: detail.get('Target', {}).get(k) for k in ('Attribute', 'Name', 'RequiresRecreation')},
                           **{k: detail.get(k) for k in ('Evaluation', 'ChangeSource', 'CausingEntity')}}
                          for detail in resource.get('Details', [])]
        changes.append(row)
    return {'revision': revision, 'changeSet': id_, 'scope': 'Proposed changes only; execution not asserted', 'changes': changes}


class Delivery(Audit):
    def __init__(self, args):
        super().__init__(SimpleNamespace(account=args.account, stack=args.stack, region=args.region,
                                         pause_after=False, resume_for_test=False))
        self.command = args.command
        self.scope = 'Code-release/pause controls only; application acceptance is a separate verification report'
        self.deadline = time.monotonic() + (1800 if args.command == 'pause' else 3900)

    def stack(self):
        return self.aws('cloudformation', 'describe-stacks', '--stack-name', self.args.stack)['Stacks'][0]

    def wait_stack(self, seconds, expected_digest=None):
        end = min(self.deadline, time.monotonic() + seconds)
        while time.monotonic() < end:
            stack = self.stack()
            if not stack['StackStatus'].endswith('_IN_PROGRESS'):
                parameters = {p['ParameterKey']: p['ParameterValue'] for p in stack.get('Parameters', [])}
                # ExecuteChangeSet is asynchronous. A stale UPDATE_COMPLETE
                # observation of the previous release is not completion.
                if expected_digest is None or stack['StackStatus'] != 'UPDATE_COMPLETE' or parameters.get('ArtifactDigest') == expected_digest:
                    if expected_digest is None or stack['StackStatus'] != 'CREATE_COMPLETE':
                        return stack
            print('CloudFormation:', stack['StackStatus'], flush=True)
            time.sleep(30)
        raise Blocked('Stack operation still in progress; do not pause or start a second release until it finishes')

    def deploy(self, folder, revision):
        manifest = validate_package(folder, revision)
        self.preflight()
        self.credits()
        stack = self.stack()
        require(not stack.get('RoleARN'), 'Existing stack uses a service role; review its deployment permissions before delivery')
        config = {p['ParameterKey']: p['ParameterValue'] for p in stack['Parameters']}
        require(config['MaxInstances'] == '2' and config['InstanceType'] == 't3.small', 'Unexpected stack fleet/cost configuration')
        for prefix in ('Api', 'Worker'):
            role = self.aws('iam', 'get-role', '--role-name', self.resources[prefix + 'Role'])['Role']
            expected = f'arn:aws:iam::{self.args.account}:policy/{self.args.stack}-{prefix.lower()}-boundary'
            require(role.get('PermissionsBoundary', {}).get('PermissionsBoundaryArn') == expected,
                    'Required workload permission boundary is missing; rerun reviewed IAM setup before delivery')
        original = self.aws('cloudformation', 'get-template', '--stack-name', self.args.stack, '--template-stage', 'Original')['TemplateBody']
        template = json.loads(original) if isinstance(original, str) else original
        require(template == json.loads(Path('infra/template.json').read_text()),
                'Repository infrastructure differs from existing stack; code-only CD cannot apply it')
        require(self.queue_idle(), 'Drain existing jobs before deploying the demo stack')
        digest = manifest['archiveSha256']
        self.aws('s3', 'cp', str(folder / 'release.tar.gz'), 's3://' + config['ArtifactBucket'] + '/' + digest + '.tar.gz',
                 '--sse', 'AES256', '--only-show-errors')
        name = 'prashn-release-' + revision[:12] + '-' + str(int(time.time()))
        created = self.aws('cloudformation', 'create-change-set', '--stack-name', self.args.stack,
                           '--change-set-name', name, '--change-set-type', 'UPDATE', '--use-previous-template',
                           '--capabilities', 'CAPABILITY_IAM', '--parameters', json.dumps(previous_parameters(stack['Parameters'], digest)))
        id_ = created['Id']
        end = time.monotonic() + 180
        while True:
            change = self.aws('cloudformation', 'describe-change-set', '--change-set-name', id_, '--stack-name', self.args.stack)
            if change['Status'] in ('CREATE_COMPLETE', 'FAILED'):
                break
            if time.monotonic() > end:
                raise Blocked('Change set not ready within three minutes; no execution requested')
            time.sleep(5)
        require(change['Status'] == 'CREATE_COMPLETE', 'Release change set was not created; inspect CloudFormation event history')
        folder_out = Path('.aws-build/cd')
        folder_out.mkdir(parents=True, exist_ok=True)
        (folder_out / 'change-summary.json').write_text(json.dumps(proposed_change_summary(change, revision, id_), indent=2))
        try:
            validate_change_set(change, stack['Parameters'])
        except AssertionError:
            self.aws('cloudformation', 'delete-change-set', '--change-set-name', id_, '--stack-name', self.args.stack)
            raise
        self.resume_for_test()
        self.aws('cloudformation', 'execute-change-set', '--change-set-name', id_, '--stack-name', self.args.stack)
        complete = self.wait_stack(2700, expected_digest=digest)
        require(complete['StackStatus'] == 'UPDATE_COMPLETE', 'Release did not reach UPDATE_COMPLETE; inspect stack events')
        bucket = self.outputs['FrontendBucket']
        self.aws('s3', 'sync', str(folder / 'frontend'), 's3://' + bucket + '/', '--exclude', 'index.html',
                 '--cache-control', 'public,max-age=31536000,immutable', '--only-show-errors')
        self.aws('s3', 'cp', str(folder / 'frontend/index.html'), 's3://' + bucket + '/index.html', '--cache-control', 'no-cache',
                 '--content-type', 'text/html', '--only-show-errors')
        invalidation = self.aws('cloudfront', 'create-invalidation', '--distribution-id', self.outputs['DistributionId'], '--paths', '/*')['Invalidation']['Id']
        end = time.monotonic() + 600
        while True:
            state = self.aws('cloudfront', 'get-invalidation', '--distribution-id', self.outputs['DistributionId'], '--id', invalidation)['Invalidation']['Status']
            if state == 'Completed':
                break
            if time.monotonic() > end:
                raise Blocked('Frontend invalidation not finished in ten minutes')
            time.sleep(15)
        self.target_health()
        self.health()
        require(self.release == revision, 'Public API still reports another source release')
        code, _, html, _ = self.http('/')
        require(code == 200 and hashlib.sha256(html).hexdigest() == manifest['frontendSha256']['index.html'], 'Public frontend does not match the tested build')
        self.record('Tested backend/frontend delivery', 'VERIFIED', 'UPDATE_COMPLETE; public backend revision and frontend HTML match ' + revision)

    def safe_pause(self):
        terminal = self.wait_stack(1200)
        require(terminal['StackStatus'] in ('CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'),
                'Unexpected stack terminal state; pause needs operator review')
        self.preflight_for_pause()
        return self.pause()

    def preflight_for_pause(self):
        # Rollback-complete can still have usable outputs and need cost control.
        status = self.stack()['StackStatus']
        if status == 'UPDATE_ROLLBACK_COMPLETE':
            identity = self.aws('sts', 'get-caller-identity')
            require(identity['Account'] == self.args.account and not identity['Arn'].endswith(':root'), 'Unexpected cleanup identity')
            stack = self.stack()
            self.outputs = {p['OutputKey']: p['OutputValue'] for p in stack['Outputs']}
            resources = self.aws('cloudformation', 'describe-stack-resources', '--stack-name', self.args.stack)['StackResources']
            self.resources = {r['LogicalResourceId']: r['PhysicalResourceId'] for r in resources}
            require(all(self.outputs[k] == self.resources[k] for k in ('ApiGroup', 'WorkerGroup')), 'Unexpected cleanup group binding')
        else:
            self.preflight()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=('deploy', 'pause'))
    p.add_argument('--account', required=True)
    p.add_argument('--stack', default='prashn-cloud-v2')
    p.add_argument('--region', default='us-east-1')
    p.add_argument('--package', type=Path, default=Path('.aws-build/ci-release'))
    p.add_argument('--revision')
    args = p.parse_args()
    if not re.fullmatch(r'\d{12}', args.account) or args.stack != 'prashn-cloud-v2' or args.region != 'us-east-1':
        p.error('Delivery is bound to the reviewed prashn-cloud-v2 stack in us-east-1')
    if args.command == 'deploy' and not args.revision:
        p.error('Deploy requires the exact tested --revision')
    audit = Delivery(args)
    ok = audit.check('Code-only delivery' if args.command == 'deploy' else 'Final demo-only cleanup',
                     lambda: audit.deploy(args.package, args.revision) if args.command == 'deploy' else audit.safe_pause())
    audit.finished = True
    audit.save()
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
