"""Bounded API-health traffic for observing an existing scaling policy.

No AWS credentials or capacity-changing API calls are used. Run only against
your own Prashn deployment; configured Auto Scaling may launch an instance.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import ssl
import time
from urllib.parse import urlsplit
from urllib.request import urlopen
from urllib.error import HTTPError


def validate_settings(url, duration, rate):
    parsed = urlsplit(url)
    local = parsed.hostname in ("127.0.0.1", "localhost", "::1")
    cloud = parsed.scheme == "https" and (parsed.hostname or "").endswith(".cloudfront.net")
    if not (cloud or (local and parsed.scheme in ("http", "https"))):
        raise ValueError("Use your HTTPS CloudFront website or a loopback test server")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Supply the website root URL without credentials, query or fragment")
    if not (math.isfinite(duration) and 1 <= duration <= 360):
        raise ValueError("Duration must be 1-360 seconds")
    if not (math.isfinite(rate) and 0 < rate <= 4):
        raise ValueError("Rate must be greater than zero and at most 4 requests/second")


def health(endpoint, context):
    try:
        response = urlopen(endpoint, timeout=10, context=context)
    except HTTPError as error:
        error.close()
        raise RuntimeError(f"Health returned HTTP {error.code}") from error
    with response:
        if response.status != 200:
            raise RuntimeError(f"Health returned HTTP {response.status}")
        value = json.loads(response.read(4096))
    expected = {"status": "ok", "processingMode": "sqs", "storageMode": "s3", "databaseMode": "dynamodb"}
    if any(value.get(key) != item for key, item in expected.items()):
        raise RuntimeError("Health did not report the expected cloud modes")
    return value


def run_load(url, duration=360, rate=4):
    validate_settings(url, duration, rate)
    endpoint = url.rstrip("/") + "/api/health"
    context = ssl.create_default_context()
    preflight = health(endpoint, context)
    print(json.dumps({"event": "scaling_demo_start", "endpoint": endpoint,
        "release": preflight.get("release"), "seconds": duration, "requestsPerSecond": rate,
        "maximumLoadRequests": math.ceil(duration * rate), "preflightRequests": 1}), flush=True)
    started = time.monotonic()
    deadline = started + duration
    next_due = started
    next_report = started + 30
    submitted = successes = errors = 0
    first_errors = []
    pending = set()

    def collect(futures):
        nonlocal successes, errors
        for future in futures:
            try:
                future.result()
                successes += 1
            except Exception as error:
                errors += 1
                if len(first_errors) < 3:
                    first_errors.append(f"{type(error).__name__}: {str(error)[:160]}")

    with ThreadPoolExecutor(max_workers=8) as pool:
        while time.monotonic() < deadline and submitted < math.ceil(duration * rate):
            done = {future for future in pending if future.done()}
            pending -= done
            collect(done)
            if errors >= 5:
                break
            now = time.monotonic()
            if now >= next_due:
                if len(pending) < 8:
                    pending.add(pool.submit(health, endpoint, context))
                    submitted += 1
                # Never catch up with a burst after a scheduling/network delay.
                next_due = now + 1 / rate
            if now >= next_report:
                print(json.dumps({"event": "scaling_demo_progress", "elapsedSeconds": round(now - started),
                    "submitted": submitted, "successful": successes, "failed": errors}), flush=True)
                next_report = now + 30
            time.sleep(min(0.05, max(0.001, next_due - time.monotonic())))
        # At most eight in-flight requests finish with the configured timeout.
        collect(pending)

    result = {"event": "scaling_demo_finished", "elapsedSeconds": round(time.monotonic() - started, 2),
        "submitted": submitted, "successful": successes, "failed": errors,
        "stoppedAfterFailures": errors >= 5, "firstErrors": first_errors}
    print(json.dumps(result), flush=True)
    print("Inspect Auto Scaling activity and instance counts; HTTP success alone does not prove scaling.", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--seconds", type=float, default=360)
    parser.add_argument("--rate", type=float, default=4)
    arguments = parser.parse_args()
    try:
        result = run_load(arguments.url, arguments.seconds, arguments.rate)
    except (ValueError, OSError, RuntimeError) as error:
        parser.exit(1, f"Scaling demo stopped: {error}\n")
    raise SystemExit(1 if result["failed"] else 0)
