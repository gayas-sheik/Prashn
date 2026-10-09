# AWS migration preparation verification

Date: **10 October 2026 (Asia/Kolkata)**. Source: migration preparation changes following the deployed `1b4217e` baseline. No new AWS resources were created during these checks.

## Executed checks

| Command / evidence | Result |
| --- | --- |
| Backend `npm run build` | TypeScript compile passed after adapter, worker and migration changes |
| Backend `npm test` | **35/35 passed**, zero failures/skips; final captured run 12.83 seconds |
| Backend `npm run test:aws` | **18/18 passed**, zero failures/skips; final captured run 58.25 seconds |
| Backend `npm audit --omit=dev` | Zero known production dependency advisories reported after adding SDK dependencies |
| Root `npm run build` | TypeScript/Vite build passed; CSS output remains `index-CSsXUjLz.css`, matching the prior design build |
| Root `npm run lint` | Passed; 11 existing React advisory warnings, zero errors or new backend warnings |
| `python infra/build_template.py` | Generated reviewable CloudFormation JSON |
| `cfn-lint infra/template.json infra/artifacts.json` | Passed with no errors/warnings after correction |
| `bash -n deploy.sh`, `bash -n infra/bootstrap.sh` | Passed |
| Owner-supplied AWS listing checks | Load balancers `0`, HTTP APIs `0` in `us-east-1` |
| Owner-supplied EC2 quota query | Standard On-Demand vCPU quota `16.0` |

The SDK endpoints in the integration suite point only to a fresh local Moto 5.2.3 server. API processes are actually launched/restarted; the worker executes the existing extractor on controlled PDF bytes. Storage, queues and tables are emulator services. This proves the tested application behavior against the emulator, not AWS IAM enforcement, service availability, resource provisioning or live scaling.

Execution environment: Windows, Node 22.14.0, Python 3.10, Moto 5.2.3 and cfn-lint 1.57.2. Final backend logs are retained locally in ignored `.test-output/aws-preparation-local.log` and `.test-output/aws-preparation-emulator.log`. Full development/build dependency advisories remain; the production-only audit is not a complete security assessment.

## AWS-mode cases actually executed

1. Health modes, missing/malformed/expired/wrong-signature tokens and simultaneous duplicate registration.
2. S3 original upload, native PDF extraction, expected vendor/total, byte-identical download, cited Q&A, refusal of absent information and second-user isolation.
3. Documents and exact question history across an actual API process restart.
4. Concurrent independent uploads, two concurrent workers, distinct vendor/total records.
5. Duplicate delivery and five concurrent retries: one accepted generation and four conflicts; correct completed-event count.
6. Lease exclusivity, expired-worker replacement and rejected stale-token commit.
7. SQS send failure after metadata commit; persisted outbox recovered and processed.
8. Extracted page evidence larger than 400 KB stored in S3 and read without truncation.
9. Real signed multipart POST, owner-scoped finalization, immutable original despite staging overwrite, invalid filename and oversized intent rejection.
10. Full 10 MiB signed-upload boundary, signed policy constraints and rejected spoofed PDF signature.
11. Confirmed injected S3 failure: one failed attempt, queued recovery and a successful second attempt.
12. A worker held for over 31 seconds: actual periodic database-lease and SQS-visibility renewal, followed by a valid commit.
13. Corrupt PDF failure, owner-scoped retry and a new failed generation.
14. Expired upload intent and interrupted deletion recovery.
15. Read-only SQLite snapshot validation, repeated import, unchanged source database/original bytes, preserved user ID/full page text/history, migrated login and grounded Q&A.
16. Deletion while extraction is held: late worker cannot publish; original/results/history inaccessible afterward.
17. Five simulated worker interruptions become a recorded failure on redelivery; an owner retry creates a new generation and completes.
18. A sent queue message deliberately removed from the emulator is redispatched from the retained outbox without changing its generation, then completes.

## Defects found and corrections

The first emulator run exposed an empty string in a DynamoDB dispatch-index key query; the query now omits the range-prefix condition when no prefix is needed. Early controlled fixtures used an incorrect PDF-generator input shape; these test setup failures were corrected before successful runs. A test synchronization issue after adding stale queue messages was fixed so deletion targets actual in-flight extraction, with an explicit timeout. The transient-failure test now asserts the injection occurred and verifies attempt counts, rather than accepting an already-queued record as recovery evidence.

Infrastructure lint initially found a missing VPC-link name and an invalid IAM `TransactWriteItems` action. The template now includes the name and grants the actual transaction item actions including `ConditionCheckItem`. CloudWatch permissions and request/queue scaling policies were reviewed and statically revalidated. New lint warnings from the changed backend/tests were removed. Repeated worker interruptions now become a recorded failure before additional extraction attempts. Sent outbox entries remain discoverable until terminal commit and can redispatch a missing/expired delivery after the delivery-check interval, while active leases prevent unnecessary redispatch. Lost visibility renewal stops further lease renewal. The worker IAM policy permits original deletion needed by background cleanup. A focused AWS-auth rerun passed after adding the 254-byte email limit; Only the auth case was selected in that focused run; the other 17 were not executed again. Forced dependency upgrades were not applied.

## Requirement status

| Requirement | Code/configuration | Executed evidence | Live AWS verification |
| --- | --- | --- | --- |
| S3 originals/results and private downloads | IMPLEMENTED | TESTED; inspected emulator results and byte comparisons | BLOCKED pending rollout |
| DynamoDB accounts/documents/history/activity | IMPLEMENTED | TESTED; inspected ownership, history, migration and large-output results | BLOCKED pending rollout |
| SQS workers, retry, leases and recovery | IMPLEMENTED | TESTED; inspected duplicate, fault, heartbeat and deletion cases | BLOCKED pending rollout |
| Automatic API/worker scaling | IMPLEMENTED in template | TESTED by schema validation only | BLOCKED; no live scaling event executed |
| CloudWatch logs/metrics/alarms | IMPLEMENTED in bootstrap/template | TESTED by source/schema review only | BLOCKED; no real log delivery inspected |
| Single-entry deployment | IMPLEMENTED | Shell syntax and template validation passed | BLOCKED; `apply` not executed |
| Existing-data import | IMPLEMENTED | TESTED with private synthetic snapshot; repeat import/source-preservation inspected | BLOCKED; real production data not imported |
| Rendered AWS UI and error states | Existing design retained; upload integration changed | Frontend compile/lint passed | BLOCKED pending deployed browser checks |

These statuses do not upgrade the earlier local audit or owner-reported browser checks into independent cloud acceptance. Remaining limits and live acceptance steps are recorded in [the migration guide](aws-migration.md). **No complete AWS migration or production-readiness claim is made.**
