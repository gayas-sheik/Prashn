"""Bounded live acceptance for an owned Prashn stack, with honest partial verdicts.

Requires Python stdlib and an existing AWS CLI session. Only generated test
documents are deleted. Accounts/tombstones/activity remain under app policy.
Never provisions a stack, runs a load test or reads JWT secrets. Explicit
--resume-for-test starts the existing stack fleets; --pause-after stops them.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import ssl
import subprocess
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler


class Blocked(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def verdict(checks):
    if any(c['status'] == 'FAILED' for c in checks):
        return 'FAIL'
    if any(c['required'] and c['status'] != 'VERIFIED' for c in checks):
        return 'BLOCKED'
    if any(c['status'] != 'VERIFIED' for c in checks):
        return 'PASS WITH LIMITATIONS'
    return 'PASS'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None  # Never forward an Authorization header to S3/another host.


def s3_url(url, bucket):
    p = urlsplit(url)
    require(p.scheme == 'https' and not p.username and not p.password and not p.fragment
            and p.port in (None, 443), 'Invalid signed S3 destination')
    host = p.hostname or ''
    virtual = host.startswith(bucket + '.s3.') and host.endswith('.amazonaws.com')
    path_style = (host.startswith('s3.') and host.endswith('.amazonaws.com')
                  and p.path.startswith('/' + bucket + '/'))
    require(virtual or path_style, 'Signed destination is not the stack document bucket')


def pdf(pages):
    """Small real PDFs with independently specified source text and correct xref."""
    objects = [None, b'', b'', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    ids = []
    for rows in pages:
        commands = []
        for i, row in enumerate(rows):
            for col, value in enumerate(row if isinstance(row, list) else [row]):
                escaped = value.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
                commands.append(f'BT /F1 12 Tf 1 0 0 1 {40 + col * 250} {750 - i * 24} Tm ({escaped}) Tj ET')
        data = '\n'.join(commands).encode('ascii')
        content_id = len(objects)
        objects.append(f'<< /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream')
        ids.append(len(objects))
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>'.encode())
    objects[1] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objects[2] = f'<< /Type /Pages /Count {len(ids)} /Kids [{" ".join(f"{i} 0 R" for i in ids)}] >>'.encode()
    result = b'%PDF-1.4\n'
    offsets = [0]
    for i, value in enumerate(objects[1:], 1):
        offsets.append(len(result))
        result += f'{i} 0 obj\n'.encode() + value + b'\nendobj\n'
    xref = len(result)
    result += f'xref\n0 {len(objects)}\n0000000000 65535 f \n'.encode()
    result += ''.join(f'{offset:010d} 00000 n \n' for offset in offsets[1:]).encode()
    return result + f'trailer\n<< /Size {len(objects)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()


def fixtures():
    native = [
        dict(name='invoice-a.pdf', type='Invoice', vendor='Audit Northwind Supplies', total='USD 110.00',
             pages=[['INVOICE', 'Vendor: Audit Northwind Supplies', 'Invoice Number: AUD-A',
                     'Subtotal: USD 100.00'], ['Tax: USD 10.00', 'Grand Total: USD 110.00',
                     'Warranty covers manufacturing defects for twelve months.']],
             text='Warranty covers manufacturing defects for twelve months.'),
        dict(name='invoice-b.pdf', type='Invoice', vendor='Audit Contoso Services', total='USD 275.50',
             pages=[['INVOICE', ['Vendor:', 'Audit Contoso Services'], 'Invoice Number: AUD-B',
                     ['Grand Total:', 'USD 275.50']]], text='Audit Contoso Services'),
        dict(name='receipt.pdf', type='Receipt', total='USD 42.75',
             pages=[['RECEIPT', 'Store: Audit Corner Shop', 'Receipt Number: AUD-R',
             'Cash: USD 50.00', 'Total: USD 42.75', 'Change: USD 7.25']], text='Audit Corner Shop',
             fields={'Store': 'Audit Corner Shop', 'Cash': 'USD 50.00', 'Change': 'USD 7.25'}),
        dict(name='form.pdf', type='Form', pages=[['APPLICATION FORM', 'Name: Alex Example',
             'Date of Birth: 2000-01-02', 'Address: 12 Example Road', 'Signature: Alex Example']], text='Alex Example',
             fields={'Name': 'Alex Example', 'Date of Birth': '2000-01-02', 'Address': '12 Example Road', 'Signature': 'Alex Example'}),
        dict(name='unknown.pdf', type='Unknown', pages=[['RESEARCH NOTE',
             'Copper wire conducts electricity.', 'Sample code: CU-42']], text='Copper wire conducts electricity.'),
    ]
    for f in native:
        f['bytes'] = pdf(f['pages'])
        f['pageCount'] = len(f.pop('pages'))
        f['mime'] = 'application/pdf'
    images = json.loads(Path(__file__).with_name('fixtures').joinpath('audit-images.json').read_text())
    for f in images:
        f['bytes'] = base64.b64decode(f.pop('content'), validate=True)
        f['pageCount'] = 1
    return native + images


class Audit:
    def __init__(self, args):
        self.args = args
        self.started = datetime.now(timezone.utc)
        self.deadline = time.monotonic() + 900
        self.checks, self.documents = [], {}
        self.tokens, self.outputs, self.resources = {}, {}, {}
        self.http_count = self.aws_count = 0
        self.lock = threading.Lock()
        self.next_http = 0
        self.ready = False
        self.finished = False
        self.url = ''
        self.directory = Path('.aws-build') / ('audit-' + self.started.strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3))
        self.directory.mkdir(parents=True, mode=0o700)
        self.opener = build_opener(NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))

    def record(self, name, status, evidence, required=True):
        self.checks.append(dict(name=name, status=status, evidence=evidence, required=required))
        print(f'[{status}] {name}: {evidence}', flush=True)
        self.save()

    def check(self, name, action, required=True):
        try:
            evidence = action()
            self.record(name, 'VERIFIED', evidence or 'Expected result inspected', required)
            return True
        except AssertionError as error:
            self.record(name, 'FAILED', str(error), required)
        except (Blocked, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as error:
            # Exception messages from HTTP/SDK transports can contain signed URLs.
            detail = str(error) if isinstance(error, Blocked) else type(error).__name__ + ': verification could not finish'
            self.record(name, 'BLOCKED', detail, required)
        return False

    def save(self):
        result = dict(startedUtc=self.started.isoformat(), stack=self.args.stack, region=self.args.region,
                      account=self.args.account, website=self.url, verdict=verdict(self.checks) if self.finished else 'IN PROGRESS',
                      httpRequests=self.http_count, awsCalls=self.aws_count, checks=self.checks,
                      testDocumentIds=list(self.documents),
                      scope='Core cloud deployment acceptance; not complete production/security/browser certification')
        content = json.dumps(result, indent=2) + '\n'
        path = self.directory / 'report.json'
        path.write_text(content, encoding='utf-8')
        path.chmod(0o600)
        lines = ['# Prashn cloud deployment verification', '', f'Verdict: **{result["verdict"]}**',
                 '', result['scope'], '', f'Started (UTC): {result["startedUtc"]}',
                 f'Website: {self.url}', '', '| Check | Status | Evidence |', '| --- | --- | --- |']
        lines += [f'| {c["name"]} | {c["status"]} | {str(c["evidence"]).replace("|", "/").replace(chr(10), " ")} |' for c in self.checks]
        lines += ['', f'HTTP requests: {self.http_count}; AWS CLI calls: {self.aws_count}.',
                  'Credentials, tokens, password hashes and signed URLs are excluded.',
                  'Test accounts, deletion tombstones and activity remain under the current application policy.',
                  'Paused compute does not remove ALB, storage, log or original-server charges.']
        path = self.directory / 'report.md'
        path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        path.chmod(0o600)

    def aws(self, service, operation, *arguments, missing_ok=False):
        if time.monotonic() >= self.deadline or self.aws_count >= 240:
            raise Blocked('AWS call/time limit reached')
        self.aws_count += 1
        env = dict(os.environ, AWS_PAGER='', AWS_RETRY_MODE='standard', AWS_MAX_ATTEMPTS='1')
        cmd = ['aws', service, operation, *arguments, '--region', self.args.region,
               '--output', 'json', '--no-cli-pager', '--cli-connect-timeout', '5', '--cli-read-timeout', '15']
        try:
            process = subprocess.run(cmd, capture_output=True, text=True, timeout=22, env=env)
        except subprocess.TimeoutExpired as error:
            raise Blocked(f'{service} {operation}: command timed out') from error
        if process.returncode:
            code = re.search(r'\(([^()\n]+)\) when calling', process.stderr)
            code = code.group(1) if code else 'CLI error'
            if missing_ok and code in ('404', 'NoSuchKey', 'NotFound'):
                return None
            raise Blocked(f'{service} {operation}: {code}')
        return json.loads(process.stdout or '{}')

    def http(self, route, method='GET', token=None, body=None, data=None, headers=None, external=False):
        with self.lock:
            if time.monotonic() >= self.deadline or self.http_count >= 750:
                raise Blocked('HTTP call/time limit reached')
            delay = self.next_http - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self.next_http = time.monotonic() + 1  # At most one request/sec across upload threads.
            self.http_count += 1
        target = route if external else self.url + route
        h = dict(headers or {})
        if token:
            require(not external, 'Refusing to send application token to an external destination')
            h['Authorization'] = 'Bearer ' + token
        if body is not None:
            data = json.dumps(body).encode()
            h['Content-Type'] = 'application/json'
        try:
            response = self.opener.open(Request(target, data=data, headers=h, method=method), timeout=15)
        except HTTPError as error:
            response = error
        with response:
            payload = response.read(2 * 1024 * 1024 + 1)
            require(len(payload) <= 2 * 1024 * 1024, 'Audit response exceeded the two MiB limit')
            try:
                value = json.loads(payload)
            except (ValueError, UnicodeDecodeError):
                value = None
            return response.getcode(), value, payload, response.headers

    def api(self, route, expected=200, **kwargs):
        code, value, _, _ = self.http(route, **kwargs)
        require(code == expected, f'{kwargs.get("method", "GET")} {route}: expected HTTP {expected}, got {code}')
        return value

    def preflight(self):
        identity = self.aws('sts', 'get-caller-identity')
        require(identity['Account'] == self.args.account, 'Wrong AWS account; no workload operations authorized')
        require(not identity['Arn'].endswith(':root'), 'Use the prashn-admin IAM session, not root')
        stack = self.aws('cloudformation', 'describe-stacks', '--stack-name', self.args.stack)['Stacks'][0]
        require(stack['StackStatus'] in ('CREATE_COMPLETE', 'UPDATE_COMPLETE'), 'Stack is not complete')
        self.outputs = {o['OutputKey']: o['OutputValue'] for o in stack['Outputs']}
        self.url = self.outputs['WebsiteUrl'].rstrip('/')
        parsed = urlsplit(self.url)
        require(parsed.scheme == 'https' and (parsed.hostname or '').endswith('.cloudfront.net')
                and parsed.path == '' and not parsed.query and not parsed.fragment and not parsed.username,
                'Stack URL is not the expected HTTPS CloudFront root')
        rows = self.aws('cloudformation', 'describe-stack-resources', '--stack-name', self.args.stack)['StackResources']
        self.resources = {r['LogicalResourceId']: r['PhysicalResourceId'] for r in rows}
        for key in ('ApiGroup', 'WorkerGroup'):
            require(self.outputs[key] == self.resources[key], 'Stack group output/resource mismatch')
        self.ready = True
        return f'{self.args.account}, {stack["StackStatus"]}; stack resources resolved'

    def group_state(self):
        groups = self.aws('autoscaling', 'describe-auto-scaling-groups', '--auto-scaling-group-names',
                          self.outputs['ApiGroup'], self.outputs['WorkerGroup'])['AutoScalingGroups']
        require(len(groups) == 2 and {g['AutoScalingGroupName'] for g in groups} == {self.outputs['ApiGroup'], self.outputs['WorkerGroup']},
                'Expected both stack fleets; refusing to infer success from an empty/partial AWS result')
        return groups

    def active_groups(self):
        groups = self.group_state()
        require(len(groups) == 2, 'Both stack server groups must exist')
        for g in groups:
            if g['DesiredCapacity'] == 0 or g['MaxSize'] == 0:
                raise Blocked('Compute is paused; resume explicitly before running functional verification')
            require(g['MaxSize'] <= 2, 'Fleet maximum exceeds the agreed two-instance limit')
            require(any(i['LifecycleState'] == 'InService' and i['HealthStatus'] == 'Healthy' for i in g['Instances']),
                    'Server group has no healthy InService instance')
        return '; '.join(f'{g["AutoScalingGroupName"]}: desired {g["DesiredCapacity"]}, max {g["MaxSize"]}' for g in groups)

    def resume_for_test(self):
        groups = self.group_state()
        require({g['AutoScalingGroupName'] for g in groups} == {self.outputs['ApiGroup'], self.outputs['WorkerGroup']}, 'Unexpected fleet membership')
        require(all(g['MaxSize'] <= 2 and g['DesiredCapacity'] <= 2 for g in groups), 'Refusing to change a fleet larger than the agreed bounds')
        for key in ('WorkerGroup', 'ApiGroup'):
            g = next(g for g in groups if g['AutoScalingGroupName'] == self.outputs[key])
            if g['DesiredCapacity'] == 0 or g['MaxSize'] == 0:
                self.aws('autoscaling', 'update-auto-scaling-group', '--auto-scaling-group-name', self.outputs[key], '--min-size', '1', '--max-size', '2', '--desired-capacity', '1')
        end = min(self.deadline, time.monotonic() + 480)
        print('Waiting for resumed API/worker startup (up to eight minutes); no extra load is being generated.', flush=True)
        while time.monotonic() < end:
            groups = self.group_state()
            if all(any(i['LifecycleState'] == 'InService' and i['HealthStatus'] == 'Healthy' for i in g['Instances']) for g in groups):
                targets = self.aws('elbv2', 'describe-target-health', '--target-group-arn', self.resources['ApiTargets'])['TargetHealthDescriptions']
                if targets and all(t['TargetHealth']['State'] == 'healthy' for t in targets):
                    return 'Existing stack fleets resumed within bounds; API targets healthy; worker ASG InService/Healthy (processing checked next)'
            time.sleep(15)
        raise Blocked('Resumed fleet/application startup did not finish within eight minutes')

    def health(self):
        value = self.api('/api/health')
        expected = dict(status='ok', environment='production', processingMode='sqs', storageMode='s3', databaseMode='dynamodb', qaMode='extractive')
        require(all(value.get(k) == v for k, v in expected.items()), 'Health does not report the complete production/cloud mode tuple')
        require(re.fullmatch('[a-f0-9]{40}', value.get('release', '')) is not None, 'Missing release identity')
        self.release = value['release']
        return 'HTTP 200; production + S3/DynamoDB/SQS; release ' + self.release

    def frontend(self):
        code, _, html, _ = self.http('/')
        require(code == 200 and b'<html' in html.lower(), 'Frontend HTML was not served')
        assets = re.findall(rb'(?:src|href)="(/assets/[^"?]+\.(?:js|css))"', html)
        require(len(assets) >= 2, 'Expected frontend JS and CSS asset references')
        for asset in assets:
            code, _, content, _ = self.http(asset.decode())
            require(code == 200 and len(content) > 100, 'Frontend asset was not served')
        code, _, page, _ = self.http('/documents')
        require(code == 200 and b'<html' in page.lower(), 'Frontend route fallback failed')
        return 'HTML, referenced JS/CSS and SPA route served over verified HTTPS; rendered UI untested'

    def target_health(self):
        rows = self.aws('elbv2', 'describe-target-health', '--target-group-arn', self.resources['ApiTargets'])['TargetHealthDescriptions']
        require(bool(rows), 'No API targets registered')
        require(all(r['TargetHealth']['State'] == 'healthy' for r in rows), 'Some registered API targets are not healthy')
        return ', '.join(r['Target']['Id'] + ': healthy' for r in rows)

    def bucket_security(self):
        for key in ('DocumentBucket', 'FrontendBucket'):
            bucket = self.outputs[key]
            block = self.aws('s3api', 'get-public-access-block', '--bucket', bucket)['PublicAccessBlockConfiguration']
            require(all(block.get(k) is True for k in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')),
                    'A bucket public-access restriction is disabled')
            rules = self.aws('s3api', 'get-bucket-encryption', '--bucket', bucket)['ServerSideEncryptionConfiguration']['Rules']
            require(any(r['ApplyServerSideEncryptionByDefault']['SSEAlgorithm'] in ('AES256', 'aws:kms') for r in rules), 'Bucket encryption missing')
            policy = json.loads(self.aws('s3api', 'get-bucket-policy', '--bucket', bucket)['Policy'])
            require(any(s['Effect'] == 'Deny' and s.get('Condition', {}).get('Bool', {}).get('aws:SecureTransport') in (False, 'false') for s in policy['Statement']),
                    'Bucket policy is missing the insecure-transport deny')
        return 'Both buckets: four public-access blocks, encryption and TLS-only policy inspected'

    def database_queue(self):
        table = self.aws('dynamodb', 'describe-table', '--table-name', self.outputs['DataTable'])['Table']
        require(table['TableStatus'] == 'ACTIVE', 'DynamoDB table is not ACTIVE')
        require({'OwnerIndex', 'DispatchIndex'}.issubset({i['IndexName'] for i in table.get('GlobalSecondaryIndexes', [])}), 'Required database indexes missing')
        backup = self.aws('dynamodb', 'describe-continuous-backups', '--table-name', self.outputs['DataTable'])
        require(backup['ContinuousBackupsDescription']['PointInTimeRecoveryDescription']['PointInTimeRecoveryStatus'] == 'ENABLED', 'Point-in-time recovery disabled')
        attributes = self.aws('sqs', 'get-queue-attributes', '--queue-url', self.outputs['QueueUrl'], '--attribute-names', 'All')['Attributes']
        redrive = json.loads(attributes['RedrivePolicy'])
        require(redrive['deadLetterTargetArn'].endswith(':' + self.outputs['DeadLetterQueue'].rsplit('/', 1)[1]), 'Queue redrive does not reference the stack DLQ')
        require(attributes.get('SqsManagedSseEnabled') == 'true' and int(attributes['VisibilityTimeout']) >= 120, 'Queue encryption/visibility differs from expected')
        return 'ACTIVE table/indexes, PITR ENABLED, encrypted queue with matching DLQ and visibility >=120 sec'

    def credits(self):
        state = self.aws('freetier', 'get-account-plan-state')
        require(state['accountPlanStatus'] == 'ACTIVE', 'Account plan is not ACTIVE')
        amount = state['accountPlanRemainingCredits']['amount']
        require(float(amount) >= 10, 'Remaining credits are below the agreed ten-dollar testing allowance; review costs before resuming')
        return f'{state["accountPlanType"]} plan; reported remaining credits USD {amount}; estimate may lag. Testing allowance USD 10 is not a billing cap'

    def security_groups(self):
        ids = [self.resources[k] for k in ('ApiSecurity', 'WorkerSecurity')]
        groups = self.aws('ec2', 'describe-security-groups', '--group-ids', *ids)['SecurityGroups']
        for g in groups:
            require(all(not r.get('IpRanges') and not r.get('Ipv6Ranges') and not r.get('PrefixListIds') for r in g['IpPermissions']),
                    'Workload security group accepts CIDR/prefix-list ingress')
            if g['GroupId'] == self.resources['WorkerSecurity']:
                require(not g['IpPermissions'], 'Worker unexpectedly accepts inbound connections')
            else:
                require(len(g['IpPermissions']) == 1 and g['IpPermissions'][0]['FromPort'] == 5000
                        and g['IpPermissions'][0]['ToPort'] == 5000
                        and {p['GroupId'] for p in g['IpPermissions'][0]['UserIdGroupPairs']} == {self.resources['BalancerSecurity']},
                        'API ingress is not restricted to its ALB on port 5000')
        return 'No public workload ingress; API admits only its ALB, worker has no ingress'

    def scaling(self):
        policies = self.aws('autoscaling', 'describe-policies', '--auto-scaling-group-name', self.outputs['ApiGroup'])['ScalingPolicies']
        require(any(p.get('TargetTrackingConfiguration', {}).get('TargetValue') == 100
                    and p['TargetTrackingConfiguration'].get('PredefinedMetricSpecification', {}).get('PredefinedMetricType') == 'ALBRequestCountPerTarget' for p in policies),
                'Expected API request target-tracking policy missing')
        activities = self.aws('autoscaling', 'describe-scaling-activities', '--auto-scaling-group-name', self.outputs['ApiGroup'], '--max-records', '20', '--no-paginate')['Activities']
        matches = [a for a in activities if 'monitor alarm' in a.get('Cause', '')
                   and 'changing the desired capacity from 1 to 2' in a['Cause']
                   and 'Launching a new EC2 instance:' in a.get('Description', '')
                   and a['StatusCode'] in ('Successful', 'WaitingForInstanceWarmup')]
        if not matches:
            raise Blocked('No policy-triggered 1-to-2 API launch in the last 20 activities; no new load test run')
        a = matches[0]
        return f'{a["StartTime"]}: {a["Description"]}; activity {a["StatusCode"]}. Actual API scale-out observed; scale-in/worker scaling untested'

    def workload_configuration(self):
        for prefix in ('Api', 'Worker'):
            versions = self.aws('ec2', 'describe-launch-template-versions', '--launch-template-id', self.resources[prefix + 'Launch'], '--versions', '$Latest')['LaunchTemplateVersions']
            config = versions[0]['LaunchTemplateData']
            require(config['MetadataOptions']['HttpTokens'] == 'required', 'Workload launch configuration does not require IMDSv2')
            require(config['IamInstanceProfile']['Arn'].endswith('/' + self.resources[prefix + 'Profile']), 'Workload profile differs from stack')
            require(all(b['Ebs'].get('Encrypted') is True for b in config['BlockDeviceMappings'] if 'Ebs' in b), 'Launch configuration permits unencrypted storage')
            policy = self.aws('iam', 'get-role-policy', '--role-name', self.resources[prefix + 'Role'], '--policy-name', 'workload')['PolicyDocument']
            for statement in policy['Statement']:
                if statement['Effect'] != 'Allow':
                    continue
                actions = statement['Action'] if isinstance(statement['Action'], list) else [statement['Action']]
                resources = statement['Resource'] if isinstance(statement['Resource'], list) else [statement['Resource']]
                require(not any(a == '*' or a.endswith(':*') for a in actions), 'Workload inline policy has unrestricted service actions')
                if '*' in resources:
                    require(actions == ['cloudwatch:PutMetricData'] and statement.get('Condition', {}).get('StringEquals', {}).get('cloudwatch:namespace') == 'Prashn',
                            'Workload inline policy has unexpected unrestricted resource access')
        config = self.aws('cloudfront', 'get-distribution-config', '--id', self.outputs['DistributionId'])['DistributionConfig']
        behavior = next((b for b in config.get('CacheBehaviors', {}).get('Items', []) if b['PathPattern'] == '/api/*'), None)
        require(behavior is not None and behavior['CachePolicyId'] == '4135ea2d-6df8-44a3-9df3-4b5a84be39ad' and behavior['ViewerProtocolPolicy'] == 'https-only',
                'API behavior must disable CloudFront caching and require HTTPS')
        return 'Launch configurations: stack profiles, IMDSv2 and encrypted disks; scoped inline actions/resources; CloudFront API caching disabled/HTTPS only. Runtime IAM denial tests not performed'

    def register(self, name):
        email = 'prashn-audit-' + secrets.token_hex(10) + '@example.test'
        password = secrets.token_urlsafe(24)
        credentials = dict(email=email, password=password, fullName='Deployment Audit ' + name)
        self.api('/api/auth/register', expected=201, method='POST', body=credentials)
        self.api('/api/auth/register', expected=409, method='POST', body=credentials)
        self.api('/api/auth/login', expected=401, method='POST', body=dict(email=email, password=password + 'wrong'))
        value = self.api('/api/auth/login', method='POST', body=credentials)
        token = value['token']
        self.tokens[name] = token
        self.api('/api/auth/me', token=token)
        payload = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
        require(payload['exp'] > time.time() and payload['exp'] > payload['iat'], 'Issued token lacks a future expiry')
        return 'Registration 201; duplicate 409; wrong password 401; login/me 200; future JWT expiry inspected'

    def protection(self):
        for token in (None, 'invalid-audit-token'):
            self.api('/api/documents', expected=401, token=token)
        # Tamper with expiry/subject while keeping the old signature; must be rejected.
        parts = self.tokens['A'].split('.')
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + '==='))
        payload.update(exp=1, userId='other-user')
        parts[1] = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
        self.api('/api/documents', expected=401, token='.'.join(parts))
        return 'Missing, malformed and tampered tokens rejected with HTTP 401; valid-signature expiry not simulated'

    def invalid_uploads(self):
        token = self.tokens['A']
        for change in (dict(fileName='../bad.pdf'), dict(mimeType='text/plain'), dict(fileSize=10485761), dict(fileSize=0)):
            request = dict(fileName='test.pdf', mimeType='application/pdf', fileSize=25)
            request.update(change)
            self.api('/api/documents/upload-intent', expected=400, method='POST', token=token, body=request)
        return 'Unsupported MIME, traversal filename, oversized intent and zero-byte intent rejected (400)'

    def upload(self, f):
        token = self.tokens['A']
        intent = self.api('/api/documents/upload-intent', expected=201, method='POST', token=token,
                          body=dict(fileName=f['name'], mimeType=f['mime'], fileSize=len(f['bytes'])))
        id_ = intent['documentId']
        require(re.fullmatch('DOC-[a-f0-9-]{36}', id_) is not None, 'Unexpected generated document ID')
        with self.lock:
            self.documents[id_] = dict(fixture=f, storageKey=None)
        upload = intent['upload']
        s3_url(upload['url'], self.outputs['DocumentBucket'])
        require(upload['fields']['key'].startswith('staging/'), 'Signed upload is not staged')
        self.api(f'/api/documents/{id_}/finalize', expected=404, method='POST', token=self.tokens['B'])
        boundary = 'prashn-audit-' + secrets.token_hex(16)
        parts = []
        for key, value in upload['fields'].items():
            require(not any(c in key for c in '\r\n"'), 'Invalid multipart field name')
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{f["name"]}"\r\nContent-Type: {f["mime"]}\r\n\r\n'.encode() + f['bytes'] + b'\r\n')
        parts.append(f'--{boundary}--\r\n'.encode())
        code, _, _, _ = self.http(upload['url'], method='POST', data=b''.join(parts),
                                 headers={'Content-Type': 'multipart/form-data; boundary=' + boundary}, external=True)
        require(code == 204, f'Signed S3 POST expected 204, got {code}')
        doc = self.api(f'/api/documents/{id_}/finalize', expected=201, method='POST', token=token)['document']
        require(doc['id'] == id_ and doc['storageKey'].startswith('originals/'), 'Accepted immutable original missing')
        self.documents[id_]['storageKey'] = doc['storageKey']
        return id_

    def wait_documents(self, ids, expected='Completed'):
        pending, terminal = set(ids), {}
        end = min(self.deadline, time.monotonic() + 180)
        while pending and time.monotonic() < end:
            for id_ in list(pending):
                doc = self.api(f'/api/documents/{id_}', token=self.tokens['A'])['document']
                if doc['status'] in ('Completed', 'Failed'):
                    require(doc['status'] == expected, f'{id_}: expected {expected}, got {doc["status"]}')
                    terminal[id_] = doc
                    pending.remove(id_)
            if pending:
                time.sleep(3)
        if pending:
            raise Blocked(f'{len(pending)} documents did not reach {expected} within the bounded wait')
        return terminal

    def inspect_document(self, id_, doc):
        f = self.documents[id_]['fixture']
        require(doc['documentType'] == f['type'], f'{f["name"]}: wrong classification')
        require(doc['pagesCount'] == f['pageCount'], f'{f["name"]}: page count mismatch')
        if f['name'].startswith('scan.'):
            require(all(p.get('extractionMethod') == 'ocr' for p in doc['pages']), 'Scanned fixture did not use the OCR path')
        text = ' '.join(p['text'] for p in doc['pages'])
        require(f['text'].lower() in text.lower(), f'{f["name"]}: expected source passage missing')
        fields = {field['label']: field['value'] for field in doc.get('extractedFields', [])}
        for label, expected in f.get('fields', {}).items():
            require(fields.get(label) == expected, f'{f["name"]}: {label} expected {expected}, got {fields.get(label)}')
        for label, expected in [('Total', f.get('total')), ('Vendor / Seller', f.get('vendor'))]:
            if expected is not None:
                require(fields.get(label) == expected, f'{f["name"]}: {label} expected {expected}, got {fields.get(label)}')
        require(doc['sha256'] == hashlib.sha256(f['bytes']).hexdigest(), f'{f["name"]}: original SHA256 mismatch')
        require(doc['fileSize'] == len(f['bytes']), f'{f["name"]}: metadata byte count mismatch')
        item = self.aws('dynamodb', 'get-item', '--table-name', self.outputs['DataTable'], '--consistent-read',
                        '--key', json.dumps({'PK': {'S': 'DOC#' + id_}, 'SK': {'S': 'META'}}),
                        '--projection-expression', '#s,resultKey,storageKey,generation', '--expression-attribute-names', '{"#s":"status"}')['Item']
        require(item['status']['S'] == 'Completed' and item['storageKey']['S'] == doc['storageKey'], 'Database completion/original reference mismatch')
        key = item['resultKey']['S']
        require(key.startswith('results/' + id_ + '/'), 'Database result key points to another document')
        head = self.aws('s3api', 'head-object', '--bucket', self.outputs['DocumentBucket'], '--key', key)
        require(head['ContentLength'] > 0, 'Database result object is empty')
        code, _, _, headers = self.http(f'/api/documents/{id_}/file', token=self.tokens['A'])
        require(code == 307, 'Original download did not use the expected private signed redirect')
        location = headers['Location']
        s3_url(location, self.outputs['DocumentBucket'])
        code, _, content, _ = self.http(location, external=True)
        require(code == 200 and content == f['bytes'], 'Downloaded bytes differ from source')
        # Test the same object anonymously without its signature.
        unsigned = location.split('?', 1)[0]
        code, _, _, _ = self.http(unsigned, external=True)
        require(code in (401, 403), 'Original object is publicly readable')
        self.documents[id_]['resultKey'] = key
        return f'{f["name"]}: {f["type"]}; source text/fields/page count/SHA256, DynamoDB reference, S3 result and identical private download inspected'

    def concurrent_uploads(self, items):
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.upload, f) for f in items]
            ids = [future.result() for future in futures]
        require(len(set(ids)) == 2, 'Concurrent uploads reused a document ID')
        terminal = self.wait_documents(ids)
        for id_ in ids:
            self.inspect_document(id_, terminal[id_])
        self.primary = ids[0]
        self.secondary = ids[1]
        return 'Two simultaneous upload workflows: separate IDs/originals/results; distinct vendors/totals and private original bytes matched'

    def single_fixture(self, f):
        id_ = self.upload(f)
        return self.inspect_document(id_, self.wait_documents([id_])[id_])

    def isolation(self):
        id_ = self.primary
        for suffix, method, body in [('', 'GET', None), ('/file', 'GET', None), ('/questions', 'GET', None),
                                    ('/questions', 'POST', {'question': 'What is the total?'}),
                                    ('/questions', 'DELETE', None), ('/retry', 'POST', None), ('', 'DELETE', None)]:
            self.api('/api/documents/' + id_ + suffix, expected=404, method=method, body=body, token=self.tokens['B'])
        require(self.api('/api/documents', token=self.tokens['B'])['documents'] == [], 'Second user lists another user documents')
        require(self.api('/api/activity', token=self.tokens['B'])['events'] == [], 'Second user lists another user activity')
        self.api(f'/api/documents/{id_}', token=self.tokens['A'])
        return 'User B: 404 for details/download/Q&A/history clear/retry/delete; empty list/activity; owner document remains accessible'

    def questions(self):
        id_, token = self.primary, self.tokens['A']
        route = f'/api/documents/{id_}/questions'
        message = self.api(route, expected=201, method='POST', token=token, body={'question': 'What is the total?'})['message']
        require('110.00' in message['text'] and '275.50' not in message['text'], 'Answer mixed amounts from different documents')
        citations = message.get('citations', [])
        doc = self.api(f'/api/documents/{id_}', token=token)['document']
        for c in citations:
            page = next((p for p in doc['pages'] if p['page'] == c['page']), None)
            require(page is not None and c.get('snippet') and c['snippet'].lower() in page['text'].lower(), 'Citation is not in the cited source page')
        require(bool(citations), 'Known total answer has no citations')
        absent = self.api(route, expected=201, method='POST', token=token, body={'question': 'What is the passport number?'})['message']
        require(absent['text'] == "I couldn't find that information in this document." and not absent.get('citations'), 'Absent fact was not refused')
        first = self.api(route, token=token)['conversation']
        require(len(first) == 4, 'Expected two persisted question/answer pairs')
        require(self.api(route, token=token)['conversation'] == first, 'History changed across independent requests')
        key = {'PK': {'S': 'DOC#' + id_}}
        rows = self.aws('dynamodb', 'query', '--table-name', self.outputs['DataTable'], '--consistent-read',
                        '--key-condition-expression', 'PK = :pk AND begins_with(SK, :qa)',
                        '--expression-attribute-values', json.dumps({':pk': key['PK'], ':qa': {'S': 'QA#'}}),
                        '--projection-expression', 'SK', '--no-paginate')
        require(rows['Count'] == 4 and not rows.get('LastEvaluatedKey'), 'History pairs not persisted in DynamoDB')
        self.api(route, expected=400, method='POST', token=token, body={'question': ''})
        require(self.api(f'/api/documents/{self.secondary}/questions', token=token)['conversation'] == [], 'Question history mixed between documents')
        return 'Selected-document total/citations matched; passport absent/refused; four history messages unchanged and confirmed in DynamoDB; other document history empty'

    def retry(self):
        id_ = self.primary
        self.api(f'/api/documents/{id_}/retry', method='POST', token=self.tokens['A'])
        doc = self.wait_documents([id_])[id_]
        self.inspect_document(id_, doc)
        require(doc['generation'] >= 2, 'Retry did not create a new processing generation')
        return f'Owner retry 200; generation {doc["generation"]} completed with original expected text/fields/bytes'

    def corrupt(self):
        f = dict(name='corrupt.pdf', mime='application/pdf', bytes=b'%PDF-1.7\ncorrupt audit input\n')
        id_ = self.upload(f)
        doc = self.wait_documents([id_], 'Failed')[id_]
        require(bool(doc.get('failureReason')), 'Corrupt file failure lacks a reason')
        generation = doc['generation']
        self.api(f'/api/documents/{id_}/questions', expected=409, method='POST', token=self.tokens['A'], body={'question': 'What is the total?'})
        self.api(f'/api/documents/{id_}/retry', method='POST', token=self.tokens['A'])
        again = self.wait_documents([id_], 'Failed')[id_]
        require(again['generation'] == generation + 1 and bool(again.get('failureReason')), 'Corrupt retry did not record a new failed generation')
        return 'Corrupt PDF accepted then Failed with reason; Q&A 409; retry creates another recorded Failed generation'

    def listing_activity(self):
        expected = set(self.documents)
        end = min(self.deadline, time.monotonic() + 30)
        while True:
            docs = self.api('/api/documents', token=self.tokens['A'])['documents']
            if {d['id'] for d in docs} == expected:
                break
            if time.monotonic() >= end:
                raise Blocked('Document list index did not converge within 30 seconds')
            time.sleep(2)
        events = self.api('/api/activity', token=self.tokens['A'])['events']
        for id_ in expected:
            require(any(e.get('documentId') == id_ and e['event'] == 'Document Uploaded' for e in events), 'Upload lifecycle event missing')
        if hasattr(self, 'primary'):
            require(any(e.get('documentId') == self.primary and e['event'] == 'Retry Initiated' for e in events), 'Retry lifecycle event missing')
        metrics = self.api('/api/documents/metrics', token=self.tokens['A'])['metrics']
        require(metrics['total'] == len(expected) and metrics['failed'] == 1, 'Metrics do not match test documents')
        return f'List contains all {len(expected)} independent test records; upload/retry events and counts match'

    def logs(self):
        end = min(self.deadline, time.monotonic() + 90)
        pattern = '{ $.documentId = "' + self.primary + '" && $.event = "job_completed" }'
        while True:
            events = self.aws('logs', 'filter-log-events', '--log-group-name', self.outputs['ApplicationLogGroup'],
                              '--filter-pattern', pattern, '--start-time', str(int(self.started.timestamp() * 1000)), '--limit', '20', '--no-paginate')['events']
            generations = {json.loads(e['message'])['generation'] for e in events}
            if {1, 2}.issubset(generations):
                return 'CloudWatch delivered matching test-document job_completed events for original and retried generations'
            if time.monotonic() >= end:
                raise Blocked('Matching completion logs did not arrive within 90 seconds')
            time.sleep(10)

    def cleanup_document(self, id_, item):
        # Recover the original reference if finalize committed but its HTTP response was lost.
        if not item['storageKey']:
            row = self.aws('dynamodb', 'get-item', '--table-name', self.outputs['DataTable'], '--consistent-read',
                           '--key', json.dumps({'PK': {'S': 'DOC#' + id_}, 'SK': {'S': 'META'}}),
                           '--projection-expression', 'storageKey')['Item']
            item['storageKey'] = row.get('storageKey', {}).get('S')
        self.api(f'/api/documents/{id_}', method='DELETE', token=self.tokens['A'])
        self.api(f'/api/documents/{id_}', expected=404, token=self.tokens['A'])
        self.api(f'/api/documents/{id_}/questions', expected=404, token=self.tokens['A'])
        if item['storageKey']:
            require(self.aws('s3api', 'head-object', '--bucket', self.outputs['DocumentBucket'], '--key', item['storageKey'], missing_ok=True) is None,
                    'Deleted test original is still stored in S3')
        keys = self.aws('s3api', 'list-objects-v2', '--bucket', self.outputs['DocumentBucket'], '--prefix', 'results/' + id_ + '/', '--max-keys', '1')
        require(keys.get('KeyCount', 0) == 0, 'Deleted test results remain in S3')
        row = self.aws('dynamodb', 'get-item', '--table-name', self.outputs['DataTable'], '--consistent-read',
                       '--key', json.dumps({'PK': {'S': 'DOC#' + id_}, 'SK': {'S': 'META'}}),
                       '--projection-expression', 'deletedAt,resultKey,storageKey')['Item']
        require('deletedAt' in row and 'resultKey' not in row and 'storageKey' not in row, 'Expected minimal deletion tombstone missing')
        rows = self.aws('dynamodb', 'query', '--table-name', self.outputs['DataTable'], '--consistent-read',
                        '--key-condition-expression', 'PK = :pk AND begins_with(SK, :qa)',
                        '--expression-attribute-values', json.dumps({':pk': {'S': 'DOC#' + id_}, ':qa': {'S': 'QA#'}}), '--select', 'COUNT')
        require(rows['Count'] == 0, 'Deleted test question records remain')
        return id_ + ': API inaccessible; original/results/history removed; minimal tombstone retained'

    def cleanup(self):
        passed = []
        for id_, item in self.documents.items():
            passed.append(self.check('Cleanup ' + id_, lambda id_=id_, item=item: self.cleanup_document(id_, item)))
        if not all(passed):
            if any(c['name'].startswith('Cleanup DOC-') and c['status'] == 'FAILED' for c in self.checks):
                raise AssertionError('Test-document cleanup disagreed with expectations; inspect per-document results')
            raise Blocked('Test-document cleanup could not be verified for every document; inspect per-document results')
        events = self.api('/api/activity', token=self.tokens['A'])['events']
        require(all(any(e.get('documentId') == id_ and e['event'] == 'Document Deleted' for e in events) for id_ in self.documents), 'Deletion lifecycle event missing')
        return f'{len(self.documents)} test documents inaccessible; originals/results/history removed; minimal tombstones and deletion activity retained'

    def logout(self):
        token = self.tokens['A']
        self.api('/api/auth/logout', method='POST', token=token)
        self.api('/api/auth/me', expected=401)
        self.api('/api/auth/me', token=token)
        return 'Logout 200; discarded-token request 401; old JWT remains valid as documented (no server token revocation)'

    def queue_idle(self):
        names = ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed']
        a = self.aws('sqs', 'get-queue-attributes', '--queue-url', self.outputs['QueueUrl'], '--attribute-names', *names)['Attributes']
        return all(a.get(n) == '0' for n in names)

    def pause(self):
        # Skip rather than interrupt any real job. Zero queue counts are approximate;
        # the owner must hold off on uploads during this demo-only operation.
        if not self.queue_idle():
            raise Blocked('Queue is not idle; both fleets left running. Drain jobs before pausing')
        self.aws('autoscaling', 'update-auto-scaling-group', '--auto-scaling-group-name', self.outputs['ApiGroup'], '--min-size', '0', '--max-size', '0', '--desired-capacity', '0')
        # Closing API admission precedes worker removal. Allow existing uploads/jobs to settle.
        end = time.monotonic() + 180
        while time.monotonic() < end:
            api = next(g for g in self.group_state() if g['AutoScalingGroupName'] == self.outputs['ApiGroup'])
            if not api['Instances'] and self.queue_idle():
                time.sleep(5)
                if self.queue_idle():
                    break
            time.sleep(10)
        else:
            raise Blocked('API pause/drain not finished in 180 seconds; worker left running to preserve jobs')
        self.aws('autoscaling', 'update-auto-scaling-group', '--auto-scaling-group-name', self.outputs['WorkerGroup'], '--min-size', '0', '--max-size', '0', '--desired-capacity', '0')
        end = time.monotonic() + 180
        while time.monotonic() < end:
            groups = self.group_state()
            if all(g['MinSize'] == g['MaxSize'] == g['DesiredCapacity'] == 0 and not g['Instances'] for g in groups):
                return 'Both stack ASGs min/max/desired/current = 0; API deliberately unavailable. ALB/storage/log/original-server costs remain'
            time.sleep(10)
        raise Blocked('Zero capacity requested; instance termination not complete within 180 seconds')

    def run(self):
        self.record('Acceptance scope', 'NOT TESTED',
                    'Rendered browser/mobile/error states; worker scale-out; automatic scale-in; busy-worker interruption/DLQ redrive; real data import/backup restore; pause/resume persistence; valid-signature expired token; complete security/performance review', False)
        if not self.check('Account and completed stack', self.preflight):
            return
        for name, action in [('Private encrypted S3', self.bucket_security), ('DynamoDB and SQS configuration', self.database_queue),
                             ('Workload ingress isolation', self.security_groups), ('Workload IAM/launch/API cache configuration', self.workload_configuration),
                             ('Observed API automatic scale-out', self.scaling)]:
            self.check(name, action)
        if not self.check('Current credit/plan snapshot', self.credits):
            if self.args.pause_after:
                self.deadline = time.monotonic() + 390
                self.check('Demo-only compute pause after cost prerequisite failure', self.pause)
            self.record('Functional cloud acceptance', 'BLOCKED', 'Cost prerequisite failed; no resume or new test documents created')
            return
        if self.args.resume_for_test and not self.check('Explicit bounded resume for testing', self.resume_for_test):
            if self.args.pause_after:
                self.deadline = time.monotonic() + 390
                self.check('Demo-only compute pause after startup failure', self.pause)
            self.record('Functional cloud acceptance', 'BLOCKED', 'Resume/readiness prerequisites failed; no accounts/uploads created')
            return
        if not self.check('Active bounded fleets', self.active_groups):
            self.record('Functional cloud acceptance', 'BLOCKED', 'Compute unavailable; no accounts/uploads created')
            return
        if not self.check('Cloud API health and release', self.health):
            if self.args.pause_after:
                self.deadline = time.monotonic() + 390
                self.check('Demo-only compute pause after health failure', self.pause)
            self.record('Functional cloud acceptance', 'BLOCKED', 'Health preflight failed; no accounts/uploads created')
            return
        self.check('Frontend publication', self.frontend)
        self.check('ALB application targets', self.target_health)
        try:
            if not all([self.check('Fresh user A authentication', lambda: self.register('A')),
                        self.check('Fresh user B authentication', lambda: self.register('B'))]):
                raise Blocked('Two fresh account logins are required')
            self.check('Protected route token validation', self.protection)
            self.check('Upload validation', self.invalid_uploads)
            data = fixtures()
            if self.check('Concurrent distinct native-PDF uploads', lambda: self.concurrent_uploads(data[:2])):
                self.check('Two-user/document isolation', self.isolation)
                self.check('Grounded Q&A and persisted history', self.questions)
                self.check('Successful reprocessing retry', self.retry)
            else:
                self.record('Isolation/Q&A/reprocessing', 'BLOCKED', 'Native-PDF prerequisites did not pass')
            for f in data[2:]:
                self.check('Extraction/classification: ' + f['name'], lambda f=f: self.single_fixture(f))
            self.check('Corrupt PDF failure and retry', self.corrupt)
            self.check('Document list, metrics and activity', self.listing_activity)
            if hasattr(self, 'primary'):
                self.check('Actual worker CloudWatch completion logs', self.logs)
            self.check('Documented logout behavior', self.logout)
        except (Blocked, OSError, ValueError, KeyError, TypeError) as error:
            self.record('Functional prerequisites', 'BLOCKED', str(error) if isinstance(error, Blocked) else type(error).__name__)
        finally:
            self.deadline = time.monotonic() + 180  # Reserved cleanup budget, even after a functional timeout.
            if self.documents and 'A' in self.tokens:
                self.check('Test-document deletion/storage/history cleanup', self.cleanup)
            if self.args.pause_after:
                self.deadline = time.monotonic() + 390
                self.check('Demo-only compute pause', self.pause)
            else:
                self.record('Demo-only compute pause', 'NOT TESTED', 'Not requested; compute may still incur costs', False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account', required=True)
    parser.add_argument('--stack', default='prashn-cloud-v2')
    parser.add_argument('--region', default='us-east-1')
    parser.add_argument('--pause-after', action='store_true', help='After tests/cleanup, pause both stack fleets only once API admission closes and queue drains')
    parser.add_argument('--resume-for-test', action='store_true', help='Explicitly resume paused stack fleets with desired 1/max 2; requires --pause-after')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{12}', args.account) or not re.fullmatch(r'[a-z][a-z0-9-]{2,24}', args.stack) or not re.fullmatch(r'[a-z]{2}-[a-z]+-\d', args.region):
        parser.error('Use a 12-digit account, a 3-25-character lowercase stack name and a valid region')
    if args.resume_for_test and not args.pause_after:
        parser.error('--resume-for-test requires --pause-after under the demo-only cost policy')
    audit = Audit(args)
    print('Bounded verification: no stack provisioning or load test. Explicit resume can launch fleet instances. Hold off on other uploads when using --pause-after.', flush=True)
    try:
        audit.run()
    except KeyboardInterrupt:
        audit.record('Audit interrupted', 'BLOCKED', 'Interrupted; cleanup/pause may not have completed. Inspect test IDs and fleet capacity')
    except Exception as error:
        audit.record('Unexpected audit interruption', 'BLOCKED', type(error).__name__ + '; cleanup/pause may not have completed')
    audit.finished = True
    audit.save()
    status = verdict(audit.checks)
    print(f'FINAL VERDICT: {status}\nReports: {audit.directory}/report.md and report.json', flush=True)
    print('PASS WITH LIMITATIONS means the executed core deployment checks passed; listed acceptance gaps remain.', flush=True)
    if status in ('PASS', 'PASS WITH LIMITATIONS'):
        print('Core cloud deployment is verified for the executed checks. Broader production acceptance is incomplete.', flush=True)
    return 0 if status in ('PASS', 'PASS WITH LIMITATIONS') else 1


if __name__ == '__main__':
    raise SystemExit(main())
