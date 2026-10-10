"""Critical delivery/trust/artifact guards, without AWS calls."""
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cd_release as delivery
import setup_github_oidc as setup
from verify_deployment import Audit


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.sha = 'a' * 40

    def tearDown(self):
        self.temp.cleanup()

    def package(self, extra=None):
        frontend = self.folder / 'frontend'
        frontend.mkdir(exist_ok=True)
        (frontend / 'index.html').write_text('<html>controlled test build</html>')
        files = {n: b'controlled runtime fixture' for n in ('backend/package.json', 'backend/package-lock.json',
                  'backend/dist/server.js', 'backend/dist/worker.js', 'infra/bootstrap.sh', 'infra/verify-native.sh', 'infra/signal-ready.sh')}
        files['.aws-build/release-manifest.json'] = json.dumps({'revision': self.sha}).encode()
        if extra: files.update(extra)
        with tarfile.open(self.folder / 'release.tar.gz', 'w:gz') as archive:
            for name, content in files.items():
                info = tarfile.TarInfo(name); info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
        manifest = {'revision': self.sha, 'archiveSha256': hashlib.sha256((self.folder/'release.tar.gz').read_bytes()).hexdigest(),
                    'frontendSha256': {'index.html': hashlib.sha256((frontend/'index.html').read_bytes()).hexdigest()}}
        (self.folder / 'manifest.json').write_text(json.dumps(manifest))
        return manifest

    def test_exact_revision_and_all_artifact_hashes_are_required(self):
        self.package()
        delivery.validate_package(self.folder, self.sha)
        with self.assertRaises(AssertionError): delivery.validate_package(self.folder, 'b'*40)
        (self.folder/'frontend/index.html').write_text('tampered')
        with self.assertRaises(AssertionError): delivery.validate_package(self.folder, self.sha)

    def test_archive_rejects_private_files_and_path_traversal(self):
        for name in ('backend/.env', 'backend/dist/.env', '../outside', '/outside', 'docs/private-handbook/secret.md'):
            with self.subTest(name=name):
                self.package({name:b'fixture-only sensitive marker'})
                with self.assertRaises(AssertionError): delivery.validate_package(self.folder, self.sha)

    def test_archive_tampering_is_detected(self):
        self.package()
        with (self.folder/'release.tar.gz').open('ab') as f: f.write(b'changed')
        with self.assertRaises(AssertionError): delivery.validate_package(self.folder, self.sha)

    def test_extra_frontend_file_cannot_be_silently_published(self):
        self.package()
        (self.folder/'frontend/unlisted.js').write_text('extra')
        with self.assertRaises(AssertionError): delivery.validate_package(self.folder, self.sha)

    def test_only_two_artifact_parameters_change(self):
        previous = [{'ParameterKey':k,'ParameterValue':'old'} for k in ('ArtifactKey','ArtifactDigest','VpcId','MaxInstances','JwtParameter')]
        result = delivery.previous_parameters(previous, 'c'*64)
        values = {p['ParameterKey']:p for p in result}
        self.assertEqual(values['ArtifactKey']['ParameterValue'], 'c'*64+'.tar.gz')
        self.assertEqual(values['ArtifactDigest']['ParameterValue'], 'c'*64)
        self.assertTrue(all(values[k].get('UsePreviousValue') for k in ('VpcId','MaxInstances','JwtParameter')))

    def change(self):
        params = [{'ParameterKey':'MaxInstances','ParameterValue':'2'},
                  {'ParameterKey':'UbuntuImage','ParameterValue':'/aws/service/example','ResolvedValue':'ami-old'}]
        change = {'Parameters':deepcopy(params),'Changes':[{'ResourceChange':{'LogicalResourceId':'ApiLaunch',
                  'ResourceType':'AWS::EC2::LaunchTemplate','Action':'Modify','Replacement':'False'}}]}
        return change, params

    def test_only_expected_nonreplacement_resource_changes_are_allowed(self):
        change, params = self.change()
        delivery.validate_change_set(change, params)
        for field, value in [('LogicalResourceId','Data'),('Action','Add'),('Action','Remove'),('Replacement','True'),('Replacement','Conditional')]:
            bad = deepcopy(change);bad['Changes'][0]['ResourceChange'][field] = value
            with self.assertRaises(AssertionError):delivery.validate_change_set(bad,params)
        with self.assertRaises(AssertionError):delivery.validate_change_set({'Changes':[]},params)

    def test_public_ami_alias_change_is_refused(self):
        change, params = self.change()
        change['Parameters'][1]['ResolvedValue'] = 'ami-new'
        with self.assertRaises(AssertionError):delivery.validate_change_set(change,params)

    def test_rejected_change_identifies_resource_and_summary_excludes_sensitive_properties(self):
        change, params = self.change()
        resource = change['Changes'][0]['ResourceChange']
        resource.update(LogicalResourceId='ApiProfile',ResourceType='AWS::IAM::InstanceProfile',BeforeContext='fixture-private-token')
        resource['Details'] = [{'Target':{'Attribute':'Properties','Name':'Roles','RequiresRecreation':'Never'},
                               'Evaluation':'Dynamic','ChangeSource':'ResourceReference','CausingEntity':'ApiRole',
                               'BeforeValue':'fixture-private-token','AfterValue':'fixture-private-token'}]
        with self.assertRaisesRegex(AssertionError, r'ApiProfile.*AWS::IAM::InstanceProfile.*action=Modify.*replacement=False'):
            delivery.validate_change_set(change,params)
        summary = delivery.proposed_change_summary(change,self.sha,'fixture-change-set')
        self.assertNotIn('fixture-private-token',json.dumps(summary))
        self.assertEqual(summary['changes'][0]['details'][0]['CausingEntity'],'ApiRole')
        self.assertIn('execution not asserted',summary['scope'])

    def test_fleet_parameter_change_is_refused(self):
        change, params = self.change()
        change['Parameters'][0]['ParameterValue'] = '4'
        with self.assertRaises(AssertionError):delivery.validate_change_set(change,params)

    def test_oidc_trust_uses_exact_immutable_repository_and_branch(self):
        policy = setup.trust_policy('683146427271')['Statement'][0]
        values = policy['Condition']['StringEquals']
        self.assertEqual(values['token.actions.githubusercontent.com:aud'],'sts.amazonaws.com')
        self.assertEqual(values['token.actions.githubusercontent.com:sub'],
                         'repo:gayas-sheik@144677471/Prashn@1409380811:ref:refs/heads/aws-migration-preparation')
        self.assertNotIn('*',json.dumps(policy))

    def test_boundary_preserves_agent_and_approved_runtime_but_not_expansion(self):
        resource = 'arn:aws:s3:::owned-documents/*'
        inline = {'Statement':[{'Effect':'Allow','Action':['s3:GetObject'],'Resource':'arn:aws:s3:::owned-artifacts/'+'f'*64+'.tar.gz'},
                               {'Effect':'Allow','Action':['s3:PutObject'],'Resource':resource}]}
        core = {'Statement':[{'Effect':'Allow','Action':['ssmmessages:OpenDataChannel'],'Resource':'*'}]}
        boundary = setup.permission_boundary(inline,core,'owned-artifacts',{resource})
        self.assertEqual(boundary['Statement'][0]['Resource'],'arn:aws:s3:::owned-artifacts/*')
        self.assertEqual(boundary['Statement'][-1],core['Statement'][0])
        bad = deepcopy(inline);bad['Statement'][0]['Action']=['iam:CreateUser']
        with self.assertRaises(AssertionError):setup.permission_boundary(bad,core,'owned-artifacts',{resource})
        bad = deepcopy(inline);bad['Statement'][1]['Resource']='arn:aws:s3:::another-account-data/*'
        with self.assertRaises(AssertionError):setup.permission_boundary(bad,core,'owned-artifacts',{resource})

    def test_private_signing_secret_is_not_granted_to_deployment_role(self):
        bindings = dict(account='683146427271',region='us-east-1',DocumentBucket='docs',FrontendBucket='front',ArtifactBucket='artifacts',
                        DataTable='table',stackArn='stack',launchArns=['lt'],groupArns=['asg'],roleArns=['role'],profileArns=['profile'],
                        boundaryArns=['boundary'],queueArns=['queue'],logArn='logs',distributionArn='distribution',amiParameter='/aws/service/canonical/ubuntu/ami-id')
        policy = setup.deployment_policy(bindings)
        grants = [s for s in policy['Statement'] if s['Effect']=='Allow']
        actions = {a for s in grants for a in s['Action']}
        self.assertNotIn('ssm:GetParameter',actions)
        self.assertNotIn('iam:CreateRole',actions)
        self.assertNotIn('cloudformation:CreateStack',actions)
        ssm = next(s for s in grants if 'ssm:GetParameters' in s['Action'])
        self.assertIn('/aws/service/canonical/ubuntu/',ssm['Resource'])
        deny = next(s for s in policy['Statement'] if 'iam:DeleteRolePermissionsBoundary' in s['Action'])
        self.assertEqual(deny['Effect'],'Deny')

    def test_live_acceptance_rejects_old_deployed_commit(self):
        audit = Audit(SimpleNamespace(account='683146427271',stack='prashn-cloud-v2',region='us-east-1',expected_release='a'*40))
        audit.directory = self.folder
        audit.api = lambda *_a,**_k: dict(status='ok',environment='production',processingMode='sqs',storageMode='s3',databaseMode='dynamodb',qaMode='extractive',release='b'*40)
        with self.assertRaises(AssertionError):audit.health()

    def test_real_packager_excludes_private_data_and_rejects_dirty_or_stale_build(self):
        root = self.folder / 'checkout'
        root.mkdir()
        files = {'backend/dist/server.js':'server', 'backend/dist/worker.js':'worker',
                 'backend/package.json':'{}', 'backend/package-lock.json':'{}',
                 'dist/index.html':'<html>fixture build</html>', 'dist/assets/client.js':'fixture bundle',
                 'infra/bootstrap.sh':'bootstrap', 'infra/verify-native.sh':'verify', 'infra/signal-ready.sh':'signal',
                 'docs/private-handbook/private.md':'must remain private', 'backend/.env':'fixture secret',
                 'backend/storage/private.pdf':'fixture private document',
                 '.gitignore':'.aws-build/\ndist/\nbackend/dist/\ndocs/private-handbook/\nbackend/.env\nbackend/storage/\n'}
        for name, value in files.items():
            path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(value)
        shutil.copyfile(Path(delivery.__file__).parent/'package-ci-release.sh', root/'infra/package-ci-release.sh')
        for command in (['git','init','-q'], ['git','add','.'],
                        ['git','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture']):
            subprocess.run(command, cwd=root, check=True, capture_output=True)
        revision = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
        bash = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'
        python = shlex.quote(sys.executable.replace('\\','/'))
        command = [bash, '-c', 'python3(){ '+python+' "$@"; }; export -f python3; bash infra/package-ci-release.sh']
        result = subprocess.run(command,cwd=root,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        release = root/'.aws-build/ci-release'
        manifest = delivery.validate_package(release,revision)
        self.assertEqual(set(manifest['frontendSha256']),{'index.html','assets/client.js'})
        with tarfile.open(release/'release.tar.gz') as archive:
            self.assertFalse(any('private' in p or '.env' in p for p in archive.getnames()))
        self.assertNotEqual(subprocess.run(command,cwd=root,capture_output=True).returncode,0)
        (root/'backend/package.json').write_text('changed tracked source')
        self.assertNotEqual(subprocess.run(command,cwd=root,capture_output=True).returncode,0)

    def test_asynchronous_release_wait_rejects_previous_terminal_observation(self):
        audit = delivery.Delivery(SimpleNamespace(account='683146427271',stack='prashn-cloud-v2',region='us-east-1',command='deploy'))
        audit.directory = self.folder
        old = {'StackStatus':'UPDATE_COMPLETE','Parameters':[{'ParameterKey':'ArtifactDigest','ParameterValue':'old'}]}
        new = {'StackStatus':'UPDATE_COMPLETE','Parameters':[{'ParameterKey':'ArtifactDigest','ParameterValue':'new'}]}
        with patch.object(audit,'stack',side_effect=[old,{'StackStatus':'UPDATE_IN_PROGRESS'},new]) as states, patch.object(delivery.time,'sleep'):
            self.assertEqual(audit.wait_stack(60,expected_digest='new'),new)
        self.assertEqual(states.call_count,3)

    def test_cleanup_waits_for_terminal_stack_before_any_pause(self):
        audit = delivery.Delivery(SimpleNamespace(account='683146427271',stack='prashn-cloud-v2',region='us-east-1',command='pause'))
        audit.directory = self.folder
        with patch.object(audit,'wait_stack',side_effect=delivery.Blocked('Still updating')), patch.object(audit,'pause') as pause:
            with self.assertRaises(delivery.Blocked):audit.safe_pause()
            pause.assert_not_called()


if __name__ == '__main__': unittest.main()
