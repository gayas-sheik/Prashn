"""Real loopback HTTP checks for pacing, failure-stop and input limits."""
import contextlib
import importlib.util
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
import unittest

spec = importlib.util.spec_from_file_location("scaling_demo", Path(__file__).resolve().parents[1] / "scaling_demo.py")
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


class ScalingDemoTests(unittest.TestCase):
    def setUp(self):
        self.times = []
        self.fail_after_preflight = False
        testcase = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                testcase.times.append(time.monotonic())
                if testcase.fail_after_preflight and len(testcase.times) > 1:
                    self.send_error(500)
                    return
                testcase.assertEqual(self.path, "/api/health")
                payload = json.dumps({"status": "ok", "processingMode": "sqs", "storageMode": "s3",
                    "databaseMode": "dynamodb", "release": "loopback-fixture"}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_real_requests_are_paced_and_bounded(self):
        with contextlib.redirect_stdout(io.StringIO()):
            result = demo.run_load(self.url, duration=1, rate=2)
        self.assertEqual(result["submitted"], 2)
        self.assertEqual(result["successful"], 2)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(len(self.times), 3)  # One preflight plus two load requests.
        self.assertGreaterEqual(self.times[2] - self.times[1], 0.4)

    def test_repeated_http_failure_stops_traffic_early(self):
        self.fail_after_preflight = True
        with contextlib.redirect_stdout(io.StringIO()):
            result = demo.run_load(self.url, duration=3, rate=4)
        self.assertTrue(result["stoppedAfterFailures"])
        self.assertLess(result["submitted"], 12)
        self.assertGreaterEqual(result["failed"], 5)
        self.assertLessEqual(len(self.times), 9)  # Failure threshold plus in-flight bound.

    def test_invalid_target_and_unbounded_settings_send_no_requests(self):
        for url, seconds, rate in [("http://example.com", 1, 1), (self.url, 361, 1),
                (self.url, 1, 5), (self.url, 1, float("nan")), (self.url + "/api", 1, 1)]:
            with self.subTest(url=url, seconds=seconds, rate=rate):
                with self.assertRaises(ValueError):
                    demo.run_load(url, duration=seconds, rate=rate)
        self.assertEqual(self.times, [])


if __name__ == "__main__":
    unittest.main()
