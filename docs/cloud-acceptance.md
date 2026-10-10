# One-command cloud deployment verification

Prepared **10 October 2026 (Asia/Kolkata)** for the existing `prashn-cloud-v2` stack. The script is implemented and locally checked; its full live acceptance run is **not yet executed**. Previously supplied evidence already establishes stack publication, one completed S3/DynamoDB/SQS document, CloudWatch completion logging and policy-triggered API scale-out. See [the evidence report](aws-migration-test-report.md).

## Run in IAM CloudShell

Run these commands one at a time while signed in as `prashn-admin`. Hold off on other uploads during verification/pause. No npm install, application rebuild or redeployment is needed.

```bash
cd ~/Prashn-cloud
```

```bash
git pull --ff-only
```

```bash
EXPECTED_ACCOUNT=683146427271 PRASHN_STACK=prashn-cloud-v2 AWS_REGION=us-east-1 bash verify.sh --resume-for-test --pause-after
```

This explicitly resumes paused groups with desired capacity **one API and one worker**, maximum **two per group**, waits for startup, tests, cleans up its documents and pauses compute afterward. Existing active groups are not deliberately resized by the resume step. These are existing fleet operations, not creation of a new stack. The original standalone server is untouched. Typical runtime will depend on instance bootstrap, processing and log delivery; bounded waits can produce a BLOCKED verdict rather than wait indefinitely.

If the groups are already running, `--resume-for-test` is unnecessary; `bash verify.sh --pause-after` performs the same tests/pause. Without `--resume-for-test`, a paused stack is reported BLOCKED and is not automatically resumed. Explicit resume requires `--pause-after` under the demo-only cost policy.

Reports are saved continuously to an ignored `.aws-build/audit-<UTC-time>-<random>/` directory:

- `report.md`: readable checklist, evidence and verdict.
- `report.json`: structured observations and this run's document IDs.

The final output prints the exact paths. Partial reports say **IN PROGRESS**; they do not imply completion. Share the final verdict and any FAILED/BLOCKED lines. Tokens, passwords, signing secrets, password hashes and signed URLs are excluded from these reports. Do not commit generated reports without reviewing their contents.

## What the script actually checks

| Area | Executed check |
| --- | --- |
| Account/stack | Matching account, IAM rather than root, completed stack and stack-derived resource IDs/URL |
| Cost/configuration | Active plan and reported credits at least $10 before resume; existing fleet maximum at most two; credits are an estimate, not a cap |
| HTTPS/frontend/API | Verified HTTPS, cloud health tuple/release, frontend HTML/JS/CSS, SPA fallback and ALB target health |
| AWS storage/queue | Private encrypted S3 configuration/TLS policy, ACTIVE DynamoDB/indexes/PITR, encrypted SQS and matching DLQ configuration |
| Network | API ingress only from its ALB on port 5000; worker has no ingress |
| Workload configuration | Stack IAM profiles, scoped inline policies, IMDSv2/encrypted launch settings and disabled API caching/HTTPS policy; runtime IAM denial tests remain untested |
| Authentication | Two fresh generated accounts, duplicate registration, incorrect password, login/me, missing/malformed/tampered tokens and documented stateless logout behavior |
| Isolation | User B rejected from user A's details, download, question/history operations, retry and deletion; B's list/activity remain empty |
| Native PDF processing | Two overlapping upload workflows, distinct vendors/totals, two-page content, split label/value variation, receipt/form/unknown classification and supported fields |
| OCR | Committed controlled PNG, JPEG and image-only PDF; expected vendor/total/source passage, page count and OCR provenance |
| Original/results | Signed S3 upload/finalize, immutable original references, exact downloaded source bytes/SHA256, anonymous original rejection, matching DynamoDB result reference and nonempty S3 result |
| Q&A/history | Selected-document total with source-page citations, absent-fact refusal, unchanged history across requests and actual DynamoDB history records, no history mixing |
| Errors/retry | Traversal/unsupported type/zero/oversize intent rejection; corrupt PDF records Failed, blocks questions and fails again in a new retry generation; valid reprocessing completes |
| Lifecycle/logging | Actual list/metrics, upload/retry/deletion activity and matching CloudWatch completion events for the test document/generations |
| Scaling | Existing target-tracking policy and actual alarm-triggered 1-to-2 launch from the last 20 activities; no new load test |
| Deletion | Only this run's document IDs are deleted through the owner API; confirm original/result/history removal and minimal retained tombstones |
| Cost pause | Close API admission, wait for API instances to disappear and queue to drain, then pause worker; inspect both groups at min/max/desired/current zero |

Eight readable fixtures plus one corrupt PDF create **nine test document records**, with two retries. The script creates two fresh test accounts; these accounts, minimal deletion tombstones and activity remain under current policy because no account-deletion API exists. It never purges other users, scans customer records, reads the SSM signing secret, inserts arbitrary queue messages, stops a busy worker for a fault test or purchases services.

## Verdict and limits

- **FAIL**: an executed check disagreed with the expected result.
- **BLOCKED**: at least one required check could not complete, such as paused/unready servers, insufficient permissions, unavailable metrics/logs or a timeout.
- **PASS WITH LIMITATIONS**: every required core deployment check passed, with the untested areas listed explicitly. This supports a successful core cloud deployment; it does not certify complete production readiness.
- **PASS** is reserved for a scope with no untested checks. This script deliberately lists broader acceptance gaps, so its normal successful result is PASS WITH LIMITATIONS.

It does not independently render browser/mobile/error states, demonstrate worker scale-out or automatic scale-in, interrupt a busy worker, test provider outages/DLQ redrive, import the original data, restore backups, verify persistence across another pause/resume, manufacture a correctly signed expired token or perform a complete security/performance review. Clean controlled OCR does not establish performance on handwriting, poor scans or complex layouts. The local MVP audit verdict is unchanged.

Traffic is paced at at most **one request/second** across upload threads, with a **750 HTTP request** limit, **240 AWS CLI call** limit, bounded processing/startup/cleanup/pause waits and no repeated scaling load. These are operational limits; they do not enforce the $10 additional testing-cost allowance. Instance bootstrap can take several minutes, and existing policies remain active within their inspected bounds.

Pausing intentionally makes login/upload/Q&A unavailable. **ALB, retained storage/logs and the original server can still incur costs.** A terminal/environment shutdown, forced interruption, AWS permission error or busy queue can prevent cleanup/pause from completing; inspect the final/checkpoint report and group counts. The script reports partial outcomes rather than claiming costs stopped. AWS SQS counts are approximate; avoid other uploads while pausing. No Free-to-Paid upgrade or new credentials are introduced.

## Local verification of the script

`python -W error::ResourceWarning -m unittest discover -s infra/tests -v` passed **26/26** local checks in **7.53 seconds**. Fifteen checks cover acceptance-report verdicts/checkpoints, wrong-account protection, private transport errors, signed-destination validation, actual loopback HTTP/redirect handling, request limits, missing/paused fleet handling, bounded worker-first resume/API-first pause, busy-queue protection, cleanup continuation and wrong-vendor/total detection. The other eleven are existing traffic/handshake checks. Shell syntax and Python compilation passed. These tests make no live AWS requests.

Separately, eight controlled fixtures were executed through the actual local `LocalExtractor`, `LocalClassifier` and `StructuredFieldExtractor`: expected types/pages/passages/vendors/totals passed, including PNG/JPEG and image-only PDF OCR. This establishes fixture validity against the current extractor, not their deployed AWS results. Images can be regenerated by maintainers with `node infra/generate_audit_images.cjs` after installing the existing backend development dependencies; live execution uses the committed fixtures and Python/AWS CLI only.
