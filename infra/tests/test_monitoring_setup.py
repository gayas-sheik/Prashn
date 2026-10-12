"""Monitoring access changes stay scoped to one reviewed API role/account."""
import contextlib
from copy import deepcopy
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import setup_monitoring as setup
from monitoring_policy import monitoring_policy, with_monitoring_boundary


class MonitoringSetupTests(unittest.TestCase):
    def bindings(self):
        return {'region': 'us-east-1', 'stackArn': 'arn:aws:cloudformation:us-east-1:123456789012:stack/prashn-test/id',
                'logArn': 'arn:aws:logs:us-east-1:123456789012:log-group:/prashn/prashn-test/application',
                'queueArns': ['arn:aws:sqs:us-east-1:123456789012:jobs', 'arn:aws:sqs:us-east-1:123456789012:dlq'],
                'monitorAlarmArns': ['arn:aws:cloudwatch:us-east-1:123456789012:alarm:prashn-test-errors'],
                'boundaryArns': ['arn:aws:iam::123456789012:policy/prashn-test-api-boundary'], 'DataTable': 'test-table'}

    def test_read_policy_has_no_mutations_or_unrestricted_log_reads(self):
        policy = monitoring_policy(self.bindings())
        self.assertEqual({a for s in policy['Statement'] for a in s['Action']}, {
            'cloudformation:DescribeStackResources', 'autoscaling:DescribeAutoScalingGroups', 'cloudwatch:GetMetricData',
            'cloudwatch:DescribeAlarms', 'sqs:GetQueueAttributes', 'logs:FilterLogEvents'})
        for statement in policy['Statement']:
            if statement['Resource'] == '*':
                self.assertEqual(statement['Condition'], {'StringEquals': {'aws:RequestedRegion': 'us-east-1'}})
        logs = next(s for s in policy['Statement'] if 'logs:FilterLogEvents' in s['Action'])
        self.assertEqual(logs['Resource'], self.bindings()['logArn'] + ':*')
        base = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': ['s3:GetObject'], 'Resource': 'original'}]}
        original = deepcopy(base)
        expanded = with_monitoring_boundary(base, policy)
        self.assertEqual(base, original)
        self.assertEqual(expanded['Statement'][0], base['Statement'][0])

    def test_account_fallback_selects_only_existing_profile_and_reads_no_hash(self):
        calls = []
        def aws(service, operation, *args):
            calls.append((service, operation, args))
            key = json.loads(args[args.index('--key') + 1])
            if key['PK']['S'] == 'EMAIL#missing@example.test': return {}
            if key['SK']['S'] == 'UNIQUE': return {'Item': {'userId': {'S': 'fixture-user'}}}
            return {'Item': {'id': {'S': 'fixture-user'}, 'email': {'S': 'admin@example.test'}, 'role': {'S': 'user'}}}
        user = setup.find_admin(SimpleNamespace(aws=aws), ['missing@example.test', 'admin@example.test'], 'test-table')
        self.assertEqual(user['id'], 'fixture-user')
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(operation == 'get-item' for _, operation, _ in calls))
        self.assertTrue(all('--projection-expression' in args for _, _, args in calls))
        with self.assertRaises(AssertionError):
            setup.find_admin(SimpleNamespace(aws=lambda *_args: {}), ['missing@example.test'], 'test-table')

    def test_cancelled_or_changed_review_cannot_write_iam_or_promote(self):
        for approved in (False, True):
            with self.subTest(approved=approved), tempfile.TemporaryDirectory() as folder:
                calls = []
                audit = SimpleNamespace(args=SimpleNamespace(account='123456789012'), resources={'ApiRole': 'api-role'},
                                        aws=lambda *args: calls.append(args) or {'Policy': {'DefaultVersionId': 'changed'}})
                user = {'id': 'one-user', 'email': 'admin@example.test', 'role': 'user'}
                with patch.object(setup, 'plan', return_value=(self.bindings(), user, Path(folder), 'v1', True)), \
                     patch('builtins.input', return_value='ENABLE MONITORING 123456789012 one-user' if approved else 'no'), \
                     self.assertRaises(AssertionError):
                    setup.apply(audit, [user['email']])
                self.assertTrue(all(call[:2] == ('iam', 'get-policy') for call in calls))

    def test_promotion_is_conditional_and_only_api_boundary_is_changed(self):
        with tempfile.TemporaryDirectory() as folder:
            calls = []
            bindings = self.bindings()
            proposed = with_monitoring_boundary({'Version': '2012-10-17', 'Statement': []}, monitoring_policy(bindings))
            (Path(folder) / 'api-boundary.json').write_text(json.dumps(proposed))
            def aws(service, operation, *args):
                calls.append((service, operation, args))
                if operation == 'get-policy': return {'Policy': {'DefaultVersionId': 'v1'}}
                if operation == 'get-policy-version': return {'PolicyVersion': {'Document': proposed}}
                if operation == 'get-role-policy': return {'PolicyDocument': monitoring_policy(bindings)}
                return {}
            audit = SimpleNamespace(args=SimpleNamespace(account='123456789012'), resources={'ApiRole': 'api-role'}, aws=aws)
            user = {'id': 'one-user', 'email': 'admin@example.test', 'role': 'user'}
            with patch.object(setup, 'plan', return_value=(bindings, user, Path(folder), 'v1', True)), \
                 patch.object(setup, 'find_admin', return_value={**user, 'role': 'admin'}), \
                 patch('builtins.input', return_value='ENABLE MONITORING 123456789012 one-user'), contextlib.redirect_stdout(io.StringIO()):
                setup.apply(audit, [user['email']])
            writes = [call for call in calls if call[1] in ('put-role-policy', 'create-policy-version', 'update-item')]
            self.assertEqual(len(writes), 3)
            update = next(call for call in writes if call[1] == 'update-item')[2]
            self.assertEqual(json.loads(update[update.index('--key') + 1])['PK']['S'], 'USER#one-user')
            self.assertIn('email = :email AND #role = :old', update)
            boundary = next(call for call in writes if call[1] == 'create-policy-version')[2]
            self.assertIn(bindings['boundaryArns'][0], boundary)
            self.assertFalse(any(service in ('ec2', 'autoscaling') for service, _, _ in calls))

    def test_failed_effective_boundary_verification_does_not_promote_user(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / 'api-boundary.json').write_text(json.dumps({'Statement': [{'Effect': 'Allow'}]}))
            calls = []
            def aws(service, operation, *args):
                calls.append((service, operation, args))
                if operation == 'get-policy': return {'Policy': {'DefaultVersionId': 'v1'}}
                if operation == 'get-policy-version': return {'PolicyVersion': {'Document': {'Statement': []}}}
                return {}
            audit = SimpleNamespace(args=SimpleNamespace(account='123456789012'), resources={'ApiRole': 'api-role'}, aws=aws)
            user = {'id': 'one-user', 'email': 'admin@example.test', 'role': 'user'}
            with patch.object(setup, 'plan', return_value=(self.bindings(), user, Path(folder), 'v1', True)), \
                 patch('builtins.input', return_value='ENABLE MONITORING 123456789012 one-user'), \
                 self.assertRaisesRegex(AssertionError, 'administrator role was not changed'):
                setup.apply(audit, [user['email']])
            self.assertFalse(any(operation == 'update-item' for _, operation, _ in calls))


if __name__ == '__main__': unittest.main()
