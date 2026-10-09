"""Readiness handshake checks with stubbed AWS/IMDS commands; no network calls."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
HARNESS = r'''
aws() {
  printf 'aws %s\n' "$*" >> "$TEST_CALL_LOG"
  if [[ "${2:-}" == describe-stacks ]]; then
    [[ "$TEST_DESCRIBE_FAILURE" == 0 ]] || return 46
    printf '%s\n' "$TEST_STACK_STATUS"
  elif [[ "${2:-}" == signal-resource ]]; then
    if [[ "$TEST_SIGNAL_FAILURE" != 0 ]]; then
      echo 'Injected signal API failure' >&2; return 45
    fi
  else
    return 99
  fi
}
curl() {
  printf 'curl %s\n' "$*" >> "$TEST_CALL_LOG"
  [[ "$TEST_METADATA_FAILURE" == 0 ]] || return 22
  if [[ "$*" == *latest/api/token* ]]; then
    printf 'fake-test-metadata-token\n'
  elif [[ "$*" == *latest/meta-data/instance-id* ]]; then
    printf '%s\n' "$TEST_INSTANCE_ID"
  else
    return 99
  fi
}
export -f aws curl
bash "$TEST_HELPER"
'''


class SignalReadyTests(unittest.TestCase):
    def run_helper(self, **overrides):
        if os.name == "nt":
            bash = str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe")
        else:
            bash = shutil.which("bash")
        self.assertTrue(bash and Path(bash).is_file(), "Git Bash or Bash is required")
        with tempfile.TemporaryDirectory(prefix="prashn-readiness-") as directory:
            calls = Path(directory) / "calls.log"
            environment = {
                **os.environ, "AWS_REGION": "us-east-1", "STACK_NAME": "prashn-unit-test",
                "LOGICAL_RESOURCE": "WorkerGroup", "TEST_HELPER": (ROOT / "infra/signal-ready.sh").as_posix(),
                "TEST_CALL_LOG": calls.as_posix(), "TEST_STACK_STATUS": "CREATE_IN_PROGRESS",
                "TEST_INSTANCE_ID": "i-0123456789abcdef0", "TEST_METADATA_FAILURE": "0",
                "TEST_DESCRIBE_FAILURE": "0", "TEST_SIGNAL_FAILURE": "0", **overrides,
            }
            result = subprocess.run([bash, "-c", HARNESS], env=environment, capture_output=True, text=True, timeout=15)
            return result, calls.read_text() if calls.exists() else ""

    def test_create_uses_imdsv2_instance_id_without_logging_token(self):
        result, calls = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("-X PUT http://169.254.169.254/latest/api/token", calls)
        self.assertIn("X-aws-ec2-metadata-token: fake-test-metadata-token", calls)
        self.assertIn("--unique-id i-0123456789abcdef0 --status SUCCESS", calls)
        self.assertIn("--logical-resource-id WorkerGroup", calls)
        self.assertNotIn("fake-test-metadata-token", result.stdout + result.stderr)

    def test_update_signals_api_group(self):
        result, calls = self.run_helper(TEST_STACK_STATUS="UPDATE_IN_PROGRESS", LOGICAL_RESOURCE="ApiGroup")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--logical-resource-id ApiGroup", calls)

    def test_normal_scale_out_does_not_signal_completed_stack(self):
        result, calls = self.run_helper(TEST_STACK_STATUS="CREATE_COMPLETE")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("signal-resource", calls)
        self.assertNotIn("curl ", calls)

    def test_rollback_does_not_receive_late_success(self):
        result, calls = self.run_helper(TEST_STACK_STATUS="ROLLBACK_IN_PROGRESS")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("signal-resource", calls)

    def test_hostname_is_rejected_as_instance_id(self):
        result, calls = self.run_helper(TEST_INSTANCE_ID="ip-172-31-1-2")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid instance ID", result.stderr)
        self.assertNotIn("signal-resource", calls)

    def test_metadata_failure_stops_before_signal(self):
        result, calls = self.run_helper(TEST_METADATA_FAILURE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("signal-resource", calls)

    def test_stack_lookup_failure_stops_before_signal(self):
        result, calls = self.run_helper(TEST_DESCRIBE_FAILURE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("signal-resource", calls)

    def test_signal_api_failure_is_visible_and_fails_script(self):
        result, _ = self.run_helper(TEST_SIGNAL_FAILURE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Injected signal API failure", result.stderr)
        self.assertNotIn("API accepted", result.stdout)


if __name__ == "__main__":
    unittest.main()
