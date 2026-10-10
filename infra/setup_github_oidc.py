"""One-time reviewed IAM setup for GitHub delivery; default plan creates nothing.

Uses the existing administrator session. No access keys, application secrets,
EC2 instances or new application stack are created. Apply adds GitHub OIDC,
one temporary-session deployment role and two workload permission boundaries.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import re
from types import SimpleNamespace

from verify_deployment import Audit, Blocked, require

SUBJECT_PREFIX = 'repo:gayas-sheik@144677471/Prashn@1409380811'
TRUSTED_BRANCH = 'aws-migration-preparation'
CORE_POLICY = 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'


def trust_policy(account):
    return {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow',
        'Principal': {'Federated': f'arn:aws:iam::{account}:oidc-provider/token.actions.githubusercontent.com'},
        'Action': 'sts:AssumeRoleWithWebIdentity', 'Condition': {'StringEquals': {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': SUBJECT_PREFIX + ':ref:refs/heads/' + TRUSTED_BRANCH}}}]}


def permission_boundary(inline, core, artifact_bucket, allowed_resources):
    actions = {'s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket',
               'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem',
               'dynamodb:Query', 'dynamodb:ConditionCheckItem', 'sqs:SendMessage', 'sqs:ReceiveMessage',
               'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility', 'ssm:GetParameter',
               'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams',
               'cloudwatch:PutMetricData', 'cloudformation:SignalResource', 'cloudformation:DescribeStacks'}
    statements = deepcopy(inline['Statement'])
    for statement in statements:
        require(statement['Effect'] == 'Allow', 'Unexpected workload inline policy effect')
        a = statement['Action'] if isinstance(statement['Action'], list) else [statement['Action']]
        require(set(a).issubset(actions), 'Workload policy has actions outside the reviewed runtime contract')
        values = statement['Resource'] if isinstance(statement['Resource'], list) else [statement['Resource']]
        converted = []
        for resource in values:
            if resource.startswith('arn:aws:s3:::' + artifact_bucket + '/'):
                require(a == ['s3:GetObject'] and re.fullmatch('[a-f0-9]{64}\\.tar\\.gz', resource.rsplit('/', 1)[1]),
                        'Unexpected artifact permission')
                converted.append('arn:aws:s3:::' + artifact_bucket + '/*')
            elif resource == '*':
                require(a == ['cloudwatch:PutMetricData'] and statement.get('Condition', {}).get('StringEquals', {}).get('cloudwatch:namespace') == 'Prashn',
                        'Unexpected unrestricted workload permission')
                converted.append(resource)
            else:
                require(resource in allowed_resources, 'Workload permission refers outside the existing stack contract')
                converted.append(resource)
        statement['Resource'] = converted if isinstance(statement['Resource'], list) else converted[0]
    # Preserve the existing AWS-managed SSM agent permissions, not an expanded
    # operator-created policy. Boundaries are a maximum, never an extra grant.
    statements += deepcopy(core['Statement'])
    policy = {'Version': '2012-10-17', 'Statement': statements}
    require(len(json.dumps(policy, separators=(',', ':'))) <= 6144, 'Boundary exceeds IAM managed-policy size')
    return policy


def deployment_policy(b):
    account, region = b['account'], b['region']
    doc, front, artifact = [f'arn:aws:s3:::{b[k]}' for k in ('DocumentBucket', 'FrontendBucket', 'ArtifactBucket')]
    table = f'arn:aws:dynamodb:{region}:{account}:table/{b["DataTable"]}'
    cfn = f'arn:aws:cloudformation:{region}:{account}:changeSet/prashn-release-*/*'
    statements = []
    def add(actions, resources, condition=None, effect='Allow'):
        statement = {'Effect': effect, 'Action': actions, 'Resource': resources}
        if condition: statement['Condition'] = condition
        statements.append(statement)
    add(['sts:GetCallerIdentity', 'freetier:GetAccountPlanState'], '*')
    add(['cloudformation:DescribeStacks', 'cloudformation:DescribeStackResources', 'cloudformation:DescribeStackResource',
         'cloudformation:DescribeStackEvents', 'cloudformation:GetTemplate', 'cloudformation:CreateChangeSet',
         'cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DeleteChangeSet'], [b['stackArn'], cfn])
    add(['ec2:DescribeInstances', 'ec2:DescribeSecurityGroups', 'ec2:DescribeLaunchTemplates', 'ec2:DescribeLaunchTemplateVersions',
         'autoscaling:DescribeAutoScalingGroups', 'autoscaling:DescribePolicies', 'autoscaling:DescribeScalingActivities',
         'autoscaling:DescribeScalingProcessTypes'], '*', {'StringEquals': {'aws:RequestedRegion': region}})
    add(['ec2:CreateLaunchTemplateVersion', 'ec2:DeleteLaunchTemplateVersions', 'ec2:ModifyLaunchTemplate'], b['launchArns'])
    add(['autoscaling:UpdateAutoScalingGroup', 'autoscaling:SetDesiredCapacity', 'autoscaling:SuspendProcesses',
         'autoscaling:ResumeProcesses', 'autoscaling:TerminateInstanceInAutoScalingGroup',
         'autoscaling:PutScalingPolicy', 'autoscaling:DeletePolicy'], b['groupArns'])
    add(['cloudwatch:DescribeAlarms', 'cloudwatch:PutMetricAlarm', 'cloudwatch:DeleteAlarms',
         'cloudwatch:ListTagsForResource'], b['alarmArns'])
    add(['iam:GetRole', 'iam:GetRolePolicy', 'iam:ListRolePolicies', 'iam:ListAttachedRolePolicies', 'iam:PutRolePolicy', 'iam:DeleteRolePolicy'], b['roleArns'])
    add(['iam:GetInstanceProfile'], b['profileArns'])
    add(['iam:PassRole'], b['roleArns'], {'StringEquals': {'iam:PassedToService': ['ec2.amazonaws.com', 'autoscaling.amazonaws.com']}})
    add(['iam:DeleteRolePermissionsBoundary', 'iam:PutRolePermissionsBoundary'], b['roleArns'], effect='Deny')
    add(['iam:CreatePolicyVersion', 'iam:SetDefaultPolicyVersion', 'iam:DeletePolicyVersion', 'iam:DeletePolicy'], b['boundaryArns'], effect='Deny')
    add(['s3:GetBucketLocation', 's3:GetBucketPolicy', 's3:GetBucketPublicAccessBlock', 's3:GetEncryptionConfiguration'], [doc, front])
    add(['s3:ListBucket', 's3:GetBucketLocation'], [front, artifact])
    # HeadObject on a deleted key returns 404 only with ListBucket permission.
    # This is read-only key metadata; without it deletion checks receive 403.
    add(['s3:ListBucket'], doc)
    add(['s3:GetObject', 's3:PutObject'], [front + '/*', artifact + '/*'])
    add(['s3:GetObject'], [doc + '/originals/*', doc + '/results/*'])
    add(['dynamodb:DescribeTable', 'dynamodb:DescribeContinuousBackups'], table)
    add(['dynamodb:GetItem', 'dynamodb:Query'], table, {'ForAllValues:StringLike': {'dynamodb:LeadingKeys': ['DOC#*']}})
    add(['sqs:GetQueueAttributes'], b['queueArns'])
    add(['logs:FilterLogEvents'], [b['logArn'], b['logArn'] + ':*'])
    add(['elasticloadbalancing:DescribeTargetHealth'], '*', {'StringEquals': {'aws:RequestedRegion': region}})
    add(['cloudfront:GetDistributionConfig', 'cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'], b['distributionArn'])
    # CloudFormation resolves only this existing public AMI parameter. It gets
    # no permission to read the private JWT parameter.
    add(['ssm:GetParameters'], f'arn:aws:ssm:{region}:*:parameter' + b['amiParameter'])
    policy = {'Version': '2012-10-17', 'Statement': statements}
    require(len(json.dumps(policy, separators=(',', ':'))) <= 10240, 'Deployment inline policy exceeds IAM size')
    return policy


class Setup(Audit):
    def __init__(self, args):
        super().__init__(SimpleNamespace(account=args.account, stack=args.stack, region='us-east-1',
                                         pause_after=False, resume_for_test=False))
        self.folder = Path('.aws-build/ci-iam')
        self.folder.mkdir(parents=True, exist_ok=True)

    def plan(self):
        self.preflight()
        stack = self.aws('cloudformation', 'describe-stacks', '--stack-name', self.args.stack)['Stacks'][0]
        require(not stack.get('RoleARN'), 'Service-role stacks need separate reviewed setup')
        p = {v['ParameterKey']: v['ParameterValue'] for v in stack['Parameters']}
        require(p['MaxInstances'] == '2' and p['InstanceType'] == 't3.small', 'Unexpected cost/fleet settings')
        require(p['UbuntuImage'].startswith('/aws/service/canonical/ubuntu/'), 'Unexpected AMI parameter')
        account = self.args.account
        region = self.args.region
        b = {'account': account, 'region': region, 'stackArn': stack['StackId'], 'ArtifactBucket': p['ArtifactBucket'],
             'amiParameter': p['UbuntuImage'], **self.outputs}
        b['launchArns'] = [f'arn:aws:ec2:{region}:{account}:launch-template/{self.resources[k+"Launch"]}' for k in ('Api','Worker')]
        groups = self.group_state()
        b['groupArns'] = [g['AutoScalingGroupARN'] for g in groups]
        b['alarmArns'] = [f'arn:aws:cloudwatch:{region}:{account}:alarm:' + self.resources[k] for k in ('QueueBacklog', 'QueueIdle')]
        b['alarmArns'].append(f'arn:aws:cloudwatch:{region}:{account}:alarm:TargetTracking-' + self.outputs['ApiGroup'] + '-*')
        b['roleArns'] = [f'arn:aws:iam::{account}:role/{self.resources[k+"Role"]}' for k in ('Api','Worker')]
        b['profileArns'] = [f'arn:aws:iam::{account}:instance-profile/{self.resources[k+"Profile"]}' for k in ('Api','Worker')]
        b['boundaryArns'] = [f'arn:aws:iam::{account}:policy/{self.args.stack}-{k.lower()}-boundary' for k in ('Api','Worker')]
        b['queueArns'] = [f'arn:aws:sqs:{region}:{account}:' + self.outputs[k].rsplit('/',1)[1] for k in ('QueueUrl','DeadLetterQueue')]
        b['logArn'] = f'arn:aws:logs:{region}:{account}:log-group:' + self.outputs['ApplicationLogGroup']
        b['distributionArn'] = f'arn:aws:cloudfront::{account}:distribution/' + self.outputs['DistributionId']
        allowed = {stack['StackId'], f'arn:aws:ssm:{region}:{account}:parameter' + p['JwtParameter'], b['logArn'] + ':*',
                   f'arn:aws:dynamodb:{region}:{account}:table/' + self.outputs['DataTable'],
                   f'arn:aws:dynamodb:{region}:{account}:table/' + self.outputs['DataTable'] + '/index/*', b['queueArns'][0],
                   'arn:aws:s3:::' + self.outputs['DocumentBucket']}
        allowed |= {'arn:aws:s3:::' + self.outputs['DocumentBucket'] + suffix for suffix in ('/*','/results/*','/originals/*','/staging/*')}
        managed = self.aws('iam', 'get-policy', '--policy-arn', CORE_POLICY)['Policy']
        core = self.aws('iam', 'get-policy-version', '--policy-arn', CORE_POLICY, '--version-id', managed['DefaultVersionId'])['PolicyVersion']['Document']
        for index, prefix in enumerate(('Api','Worker')):
            name = self.resources[prefix + 'Role']
            role = self.aws('iam', 'get-role', '--role-name', name)['Role']
            boundary = role.get('PermissionsBoundary', {}).get('PermissionsBoundaryArn')
            require(boundary in (None, b['boundaryArns'][index]), 'An existing different workload boundary must not be overwritten')
            inline = self.aws('iam', 'get-role-policy', '--role-name', name, '--policy-name', 'workload')['PolicyDocument']
            self.write(prefix.lower() + '-boundary.json', permission_boundary(inline, core, p['ArtifactBucket'], allowed))
        self.write('trust.json', trust_policy(account))
        self.write('permissions.json', deployment_policy(b))
        self.write('bindings.json', b)
        print('Read-only IAM plan written to', self.folder, flush=True)
        print('Apply adds GitHub OIDC, one deployment role, and two boundaries on the existing app roles; no compute starts.', flush=True)
        print('Review trust.json, permissions.json and both *-boundary.json before applying.', flush=True)
        return b

    def write(self, name, value):
        (self.folder / name).write_text(json.dumps(value, indent=2) + '\n')

    def ensure_boundary(self, arn, document):
        result = self.aws('iam', 'list-policies', '--scope', 'Local', '--query', f"Policies[?Arn=='{arn}']")
        if not result:
            return self.aws('iam', 'create-policy', '--policy-name', arn.rsplit('/',1)[1], '--policy-document',
                            'file://' + str(document), '--tags', json.dumps([{'Key':'PrashnStack','Value':self.args.stack}]))['Policy']['Arn']
        version = self.aws('iam', 'get-policy-version', '--policy-arn', arn, '--version-id', result[0]['DefaultVersionId'])['PolicyVersion']['Document']
        require(version == json.loads(document.read_text()), 'Existing boundary differs; review its update separately')
        return arn

    def apply(self, b):
        require(input('Type the account ID ' + self.args.account + ' to approve the reviewed IAM setup: ').strip() == self.args.account,
                'IAM setup cancelled')
        provider = f'arn:aws:iam::{self.args.account}:oidc-provider/token.actions.githubusercontent.com'
        existing = self.aws('iam', 'list-open-id-connect-providers')['OpenIDConnectProviderList']
        if any(v['Arn'] == provider for v in existing):
            value = self.aws('iam', 'get-open-id-connect-provider', '--open-id-connect-provider-arn', provider)
            require('sts.amazonaws.com' in value['ClientIDList'], 'Existing provider has another audience; do not change it automatically')
        else:
            self.aws('iam', 'create-open-id-connect-provider', '--url', 'https://token.actions.githubusercontent.com', '--client-id-list', 'sts.amazonaws.com')
        for index, prefix in enumerate(('Api','Worker')):
            boundary = self.ensure_boundary(b['boundaryArns'][index], self.folder / (prefix.lower() + '-boundary.json'))
            self.aws('iam', 'put-role-permissions-boundary', '--role-name', self.resources[prefix + 'Role'], '--permissions-boundary', boundary)
        name = self.args.stack + '-github-release'
        existing = self.aws('iam', 'list-roles', '--query', f"Roles[?RoleName=='{name}']")
        if existing:
            role = self.aws('iam', 'get-role', '--role-name', name)['Role']
            tags = {v['Key']:v['Value'] for v in role.get('Tags', [])}
            require(tags.get('PrashnStack') == self.args.stack and tags.get('RepositoryId') == '1409380811', 'Existing role is not marked as this setup; refusing overwrite')
            self.aws('iam', 'update-assume-role-policy', '--role-name', name, '--policy-document', 'file://' + str(self.folder / 'trust.json'))
            self.aws('iam', 'update-role', '--role-name', name, '--max-session-duration', '7200')
        else:
            self.aws('iam', 'create-role', '--role-name', name, '--assume-role-policy-document', 'file://' + str(self.folder / 'trust.json'),
                     '--max-session-duration', '7200', '--tags', json.dumps([{'Key':'PrashnStack','Value':self.args.stack},{'Key':'RepositoryId','Value':'1409380811'}]))
        self.aws('iam', 'put-role-policy', '--role-name', name, '--policy-name', 'code-only-delivery', '--policy-document', 'file://' + str(self.folder / 'permissions.json'))
        print('IAM setup applied. Deployment role:', f'arn:aws:iam::{self.args.account}:role/{name}', flush=True)
        print('No AWS application release or compute resume occurred. Run approved delivery in GitHub after workflow activation.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', nargs='?', choices=('plan','apply'), default='plan')
    parser.add_argument('--account', required=True)
    parser.add_argument('--stack', default='prashn-cloud-v2')
    args = parser.parse_args()
    if args.account != '683146427271' or args.stack != 'prashn-cloud-v2':
        parser.error('This reviewed setup is bound to account 683146427271 and stack prashn-cloud-v2')
    setup = Setup(args)
    try:
        b = setup.plan()
        if args.command == 'apply': setup.apply(b)
    except Exception as error:
        print('Setup stopped:', type(error).__name__, str(error) if isinstance(error, (AssertionError, Blocked)) else 'Inspect permissions/network and generated plan; partial IAM changes may remain')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
