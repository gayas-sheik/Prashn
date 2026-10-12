"""Plan/apply administrator-only monitoring for the existing stack. No compute starts."""
import argparse
import json
from pathlib import Path
import re

from setup_github_oidc import Setup
from monitoring_policy import monitoring_policy, with_monitoring_boundary
from verify_deployment import require


def find_admin(audit, emails, table):
    for email in emails:
        link = audit.aws('dynamodb', 'get-item', '--table-name', table, '--consistent-read', '--key',
                         json.dumps({'PK': {'S': 'EMAIL#' + email}, 'SK': {'S': 'UNIQUE'}}), '--projection-expression', 'userId').get('Item')
        if not link:
            continue
        id_ = link['userId']['S']
        profile = audit.aws('dynamodb', 'get-item', '--table-name', table, '--consistent-read', '--key',
                            json.dumps({'PK': {'S': 'USER#' + id_}, 'SK': {'S': 'PROFILE'}}),
                            '--projection-expression', 'id,email,#role', '--expression-attribute-names', '{"#role":"role"}').get('Item')
        require(profile and profile['id']['S'] == id_ and profile['email']['S'] == email
                and profile['role']['S'] in ('user', 'admin'), 'Existing account binding/role needs operator review')
        return {'id': id_, 'email': email, 'role': profile['role']['S']}
    raise AssertionError('No selected email is registered. Register the intended account directly in the app first.')


def plan(audit, emails):
    b = audit.plan()
    role = audit.resources['ApiRole']
    boundary_arn = b['boundaryArns'][0]
    actual_role = audit.aws('iam', 'get-role', '--role-name', role)['Role']
    require(actual_role.get('PermissionsBoundary', {}).get('PermissionsBoundaryArn') == boundary_arn,
            'Expected API permission boundary is missing or different; complete reviewed OIDC setup first')
    read_policy = monitoring_policy(b)
    base = json.loads((audit.folder / 'api-boundary.json').read_text())
    base['Statement'] = [s for s in base['Statement'] if not s.get('Sid', '').startswith('PrashnMonitoring')]
    proposed = with_monitoring_boundary(base, read_policy)
    require(len(json.dumps(proposed, separators=(',', ':'))) <= 6144, 'Monitoring boundary exceeds IAM policy size')
    policy = audit.aws('iam', 'get-policy', '--policy-arn', boundary_arn)['Policy']
    version = policy['DefaultVersionId']
    current = audit.aws('iam', 'get-policy-version', '--policy-arn', boundary_arn, '--version-id', version)['PolicyVersion']['Document']
    require(current in (base, proposed), 'API boundary contains an unreviewed change; refusing to overwrite')
    versions = audit.aws('iam', 'list-policy-versions', '--policy-arn', boundary_arn)['Versions']
    require(current == proposed or len(versions) < 5, 'Boundary has five versions; operator must review retirement of an old version separately')
    user = find_admin(audit, emails, b['DataTable'])
    folder = Path('.aws-build/monitoring-iam')
    folder.mkdir(parents=True, exist_ok=True)
    for name, document in [('read-policy.json', read_policy), ('api-boundary.json', proposed), ('previous-api-boundary.json', current)]:
        (folder / name).write_text(json.dumps(document, indent=2) + '\n')
    print('Read-only monitoring plan:', folder)
    print('Selected existing user ID:', user['id'], '; current role:', user['role'])
    print('Apply grants this API role read access, augments only its existing boundary, and promotes this one account to admin.')
    print('Metrics/fleet Describe reads require region-restricted Resource *; server queries remain bound to this stack. No compute starts.')
    return b, user, folder, version, current != proposed


def apply(audit, emails):
    b, user, folder, version, update = plan(audit, emails)
    expected = 'ENABLE MONITORING ' + audit.args.account + ' ' + user['id']
    require(input('Type ' + expected + ' to approve the reviewed access changes: ').strip() == expected, 'Monitoring setup cancelled')
    boundary = b['boundaryArns'][0]
    require(audit.aws('iam', 'get-policy', '--policy-arn', boundary)['Policy']['DefaultVersionId'] == version,
            'Boundary changed after review; rerun the plan')
    audit.aws('iam', 'put-role-policy', '--role-name', audit.resources['ApiRole'], '--policy-name', 'monitoring-read',
              '--policy-document', 'file://' + str(folder / 'read-policy.json'))
    if update:
        audit.aws('iam', 'create-policy-version', '--policy-arn', boundary, '--policy-document',
                  'file://' + str(folder / 'api-boundary.json'), '--set-as-default')
    effective_version = audit.aws('iam', 'get-policy', '--policy-arn', boundary)['Policy']['DefaultVersionId']
    effective_boundary = audit.aws('iam', 'get-policy-version', '--policy-arn', boundary,
                                   '--version-id', effective_version)['PolicyVersion']['Document']
    require(effective_boundary == json.loads((folder / 'api-boundary.json').read_text()),
            'Monitoring boundary verification failed; administrator role was not changed')
    audit.aws('dynamodb', 'update-item', '--table-name', b['DataTable'], '--key',
              json.dumps({'PK': {'S': 'USER#' + user['id']}, 'SK': {'S': 'PROFILE'}}),
              '--update-expression', 'SET #role = :admin', '--condition-expression', 'email = :email AND #role = :old',
              '--expression-attribute-names', '{"#role":"role"}', '--expression-attribute-values',
              json.dumps({':admin': {'S': 'admin'}, ':email': {'S': user['email']}, ':old': {'S': user['role']}}))
    effective = audit.aws('iam', 'get-role-policy', '--role-name', audit.resources['ApiRole'], '--policy-name', 'monitoring-read')['PolicyDocument']
    require(effective == monitoring_policy(b), 'Monitoring read policy verification failed')
    require(find_admin(audit, [user['email']], b['DataTable'])['role'] == 'admin', 'Administrator role verification failed')
    print('Monitoring setup applied and administrator role verified. No compute resumed; deploy the checked code before opening Monitoring.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'apply'])
    parser.add_argument('--account', required=True)
    parser.add_argument('--stack', default='prashn-cloud-v2')
    parser.add_argument('--admin-email', action='append', required=True, help='Existing account email; repeated options are ordered fallbacks')
    args = parser.parse_args()
    require(re.fullmatch(r'\d{12}', args.account) and re.fullmatch(r'[a-z][a-z0-9-]{2,24}', args.stack), 'Invalid account/stack')
    emails = [email.strip().lower() for email in args.admin_email]
    require(len(emails) <= 2 and all(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) and len(email.encode()) <= 254 for email in emails), 'Supply one or two valid existing email addresses')
    args.region = 'us-east-1'
    audit = Setup(args)
    if args.command == 'plan': plan(audit, emails)
    else: apply(audit, emails)


if __name__ == '__main__':
    main()
