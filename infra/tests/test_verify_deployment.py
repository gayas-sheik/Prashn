"""Audit safety checks; no AWS resources or internet requests are used."""
import contextlib
import importlib.util
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('verify_deployment', Path(__file__).resolve().parents[1] / 'verify_deployment.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class VerificationTests(unittest.TestCase):
    def make_audit(self):
        # Temporary cwd keeps ignored generated reports isolated from real runs.
        audit = verify.Audit(SimpleNamespace(account='123456789012', stack='prashn-test', region='us-east-1', pause_after=True, resume_for_test=False))
        audit.directory = Path(self.temp.name) / 'report'
        audit.directory.mkdir(exist_ok=True)
        return audit

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp.cleanup()

    def test_verdict_never_upgrades_failed_or_missing_required_checks(self):
        c = lambda status, required=True: dict(status=status, required=required)
        self.assertEqual(verify.verdict([c('FAILED'), c('VERIFIED')]), 'FAIL')
        self.assertEqual(verify.verdict([c('BLOCKED'), c('VERIFIED')]), 'BLOCKED')
        self.assertEqual(verify.verdict([c('VERIFIED'), c('NOT TESTED', False)]), 'PASS WITH LIMITATIONS')
        self.assertEqual(verify.verdict([c('VERIFIED')]), 'PASS')

    def test_wrong_account_stops_before_any_workload_call(self):
        audit = self.make_audit()
        calls = []
        def aws(service, operation, *_args, **_kwargs):
            calls.append((service, operation))
            return dict(Account='999999999999', Arn='arn:aws:iam::999999999999:user/wrong')
        audit.aws = aws
        with contextlib.redirect_stdout(io.StringIO()):
            audit.run()
        self.assertEqual(calls, [('sts', 'get-caller-identity')])
        self.assertEqual(verify.verdict(audit.checks), 'FAIL')
        self.assertFalse(audit.ready)

    def test_completed_rollback_requires_explicit_retry_scope_and_valid_bindings(self):
        audit=self.make_audit()
        stack={'StackStatus':'UPDATE_ROLLBACK_COMPLETE','Outputs':[{'OutputKey':k,'OutputValue':v} for k,v in
               {'WebsiteUrl':'https://fixture.cloudfront.net','ApiGroup':'api','WorkerGroup':'worker'}.items()]}
        resources={'StackResources':[{'LogicalResourceId':k,'PhysicalResourceId':v} for k,v in {'ApiGroup':'api','WorkerGroup':'worker'}.items()]}
        def aws(service,operation,*_args,**_kwargs):
            if operation=='get-caller-identity':return {'Account':audit.args.account,'Arn':'arn:aws:iam::'+audit.args.account+':user/fixture'}
            if operation=='describe-stacks':return {'Stacks':[stack]}
            if operation=='describe-stack-resources':return resources
            self.fail('Unexpected AWS operation')
        audit.aws=aws
        with self.assertRaises(AssertionError):audit.preflight()
        audit.preflight(allow_rollback_complete=True)
        self.assertTrue(audit.ready)
        for status in ('UPDATE_ROLLBACK_IN_PROGRESS','UPDATE_ROLLBACK_FAILED','DELETE_COMPLETE','CREATE_FAILED'):
            stack['StackStatus']=status
            with self.subTest(status=status),self.assertRaises(AssertionError):audit.preflight(allow_rollback_complete=True)
            self.assertFalse(audit.ready)

    def test_transport_failure_report_does_not_leak_signed_url_or_tokens(self):
        audit = self.make_audit()
        audit.tokens['A'] = 'private-test-token'
        def fail():
            raise OSError('https://bucket.s3.us-east-1.amazonaws.com/key?X-Amz-Signature=SECRET')
        with contextlib.redirect_stdout(io.StringIO()):
            audit.check('Example transport', fail)
        audit.finished = True
        audit.save()
        text = (audit.directory / 'report.json').read_text()
        self.assertNotIn('SECRET', text)
        self.assertNotIn('private-test-token', text)
        self.assertEqual(json.loads(text)['verdict'], 'BLOCKED')

    def test_partial_checkpoint_cannot_claim_a_completed_verdict(self):
        audit = self.make_audit()
        with contextlib.redirect_stdout(io.StringIO()):
            audit.record('One passed check', 'VERIFIED', 'Observed')
        self.assertEqual(json.loads((audit.directory / 'report.json').read_text())['verdict'], 'IN PROGRESS')

    def test_busy_queue_prevents_all_capacity_mutations(self):
        audit = self.make_audit()
        audit.queue_idle = lambda: False
        audit.aws = lambda *_args, **_kwargs: self.fail('AWS mutation while queue busy')
        with self.assertRaises(verify.Blocked):
            audit.pause()

    def test_api_is_paused_before_worker_and_zero_capacity_is_inspected(self):
        audit = self.make_audit()
        audit.outputs = dict(ApiGroup='api', WorkerGroup='worker')
        audit.queue_idle = lambda: True
        mutations = []
        audit.aws = lambda *args, **_kwargs: mutations.append(args) or {}
        audit.group_state = lambda: [dict(AutoScalingGroupName=name, MinSize=0, MaxSize=0, DesiredCapacity=0, Instances=[]) for name in ['api', 'worker']]
        with patch.object(verify.time, 'sleep'):
            result = audit.pause()
        self.assertEqual([call[3] for call in mutations], ['api', 'worker'])
        for call in mutations:
            self.assertIn('--max-size', call)
            self.assertEqual(call[call.index('--max-size') + 1], '0')
        self.assertIn('min/max/desired/current = 0', result)

    def test_s3_signed_destinations_are_restricted_to_stack_bucket(self):
        verify.s3_url('https://my-bucket.s3.us-east-1.amazonaws.com/key?signature=ignored', 'my-bucket')
        verify.s3_url('https://s3.us-east-1.amazonaws.com/my-bucket/key', 'my-bucket')
        for url in ['http://my-bucket.s3.us-east-1.amazonaws.com/key', 'https://other.s3.us-east-1.amazonaws.com/key',
                    'https://my-bucket.s3.us-east-1.amazonaws.com.evil.test/key', 'https://user@my-bucket.s3.us-east-1.amazonaws.com/key']:
            with self.assertRaises(AssertionError):
                verify.s3_url(url, 'my-bucket')

    def test_real_http_redirect_does_not_forward_authorization(self):
        received = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append((self.path, self.headers.get('Authorization')))
                if self.path == '/ok':
                    data = b'{"status":"ok"}'
                    self.send_response(200)
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                self.send_response(307)
                self.send_header('Location', '/external')
                self.send_header('Content-Length', '0')
                self.end_headers()
            def log_message(self, *_args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            audit = self.make_audit()
            audit.url = f'http://127.0.0.1:{server.server_port}'
            code, _, _, _ = audit.http('/file', token='test-token')
            self.assertEqual(code, 307)
            self.assertEqual(received, [('/file', 'Bearer test-token')])
            with self.assertRaises(AssertionError):
                audit.http(audit.url + '/external', external=True, token='test-token')
            self.assertEqual(len(received), 1)
            code, body, _, _ = audit.http('/ok')
            self.assertEqual((code, body), (200, {'status': 'ok'}))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)

    def test_request_budget_stops_before_transport(self):
        audit = self.make_audit()
        audit.http_count = 750
        with self.assertRaises(verify.Blocked):
            audit.http('/api/health')
        self.assertEqual(audit.http_count, 750)

    def test_no_automatic_resume_when_fleets_are_paused(self):
        audit = self.make_audit()
        audit.group_state = lambda: [dict(DesiredCapacity=0, MaxSize=0)] * 2
        with self.assertRaises(verify.Blocked):
            audit.active_groups()

    def test_explicit_resume_is_bounded_and_worker_precedes_api(self):
        audit = self.make_audit()
        audit.outputs = dict(ApiGroup='api', WorkerGroup='worker')
        audit.resources = dict(ApiTargets='targets')
        paused = [dict(AutoScalingGroupName=name, DesiredCapacity=0, MaxSize=0) for name in ('api', 'worker')]
        running = [dict(AutoScalingGroupName=name, Instances=[dict(LifecycleState='InService', HealthStatus='Healthy')]) for name in ('api', 'worker')]
        states = iter([paused, running])
        audit.group_state = lambda: next(states)
        mutations = []
        def aws(service, operation, *args, **_kwargs):
            if operation == 'describe-target-health':
                return dict(TargetHealthDescriptions=[dict(TargetHealth=dict(State='healthy'))])
            mutations.append((service, operation, *args))
            return {}
        audit.aws = aws
        with contextlib.redirect_stdout(io.StringIO()):
            audit.resume_for_test()
        self.assertEqual([m[3] for m in mutations], ['worker', 'api'])
        self.assertTrue(all(m[m.index('--desired-capacity') + 1] == '1' and m[m.index('--max-size') + 1] == '2' for m in mutations))

    def test_resume_refuses_larger_fleet_before_mutations(self):
        audit = self.make_audit()
        audit.outputs = dict(ApiGroup='api', WorkerGroup='worker')
        audit.group_state = lambda: [dict(AutoScalingGroupName=name, DesiredCapacity=1, MaxSize=4) for name in ('api', 'worker')]
        audit.aws = lambda *_args, **_kwargs: self.fail('Unexpected mutation')
        with self.assertRaises(AssertionError):
            audit.resume_for_test()

    def test_cleanup_continues_to_other_documents_after_one_failure(self):
        audit = self.make_audit()
        audit.documents = {'DOC-first': {}, 'DOC-second': {}}
        visited = []
        def cleanup(id_, _item):
            visited.append(id_)
            if id_ == 'DOC-first':
                raise verify.Blocked('simulated storage outage')
            return 'Cleanup observed'
        audit.cleanup_document = cleanup
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(verify.Blocked):
            audit.cleanup()
        self.assertEqual(visited, ['DOC-first', 'DOC-second'])
        self.assertEqual([c['status'] for c in audit.checks], ['BLOCKED', 'VERIFIED'])

    def test_missing_fleet_does_not_count_as_zero_capacity_success(self):
        audit = self.make_audit()
        audit.outputs = dict(ApiGroup='api', WorkerGroup='worker')
        audit.aws = lambda *_args, **_kwargs: dict(AutoScalingGroups=[])
        with self.assertRaises(AssertionError):
            audit.group_state()

    def test_wrong_vendor_or_total_fails_before_successful_storage_checks(self):
        audit = self.make_audit()
        audit.documents['DOC-test'] = dict(fixture=dict(name='invoice.pdf', type='Invoice', pageCount=1, text='Source passage', vendor='Expected Vendor', total='USD 110.00'))
        doc = dict(documentType='Invoice', pagesCount=1, pages=[dict(text='Source passage')],
                   extractedFields=[dict(label='Total', value='USD 999.00'), dict(label='Vendor / Seller', value='Other Vendor')])
        audit.aws = lambda *_args, **_kwargs: self.fail('Mismatch should stop before AWS reads')
        with self.assertRaises(AssertionError):
            audit.inspect_document('DOC-test', doc)


if __name__ == '__main__':
    unittest.main()
