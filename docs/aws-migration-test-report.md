# AWS migration preparation verification

Date: **10 October 2026 (Asia/Kolkata)**. Source: migration preparation changes following the deployed `1b4217e` baseline. Preparation checks were local; subsequent owner-run rollout attempts recorded below did create AWS resources.

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
| S3 originals/results and private downloads | IMPLEMENTED | TESTED; emulator cases and owner-run controlled live upload/download/deletion assertions | VERIFIED for tested originals/results, matching references, exact original bytes/SHA256, anonymous original rejection and cleanup; provider-fault cases pending |
| DynamoDB accounts/documents/history/activity | IMPLEMENTED | TESTED; emulator cases and owner-run live auth/isolation/history/metadata/cleanup assertions | VERIFIED for two fresh accounts, scoped CRUD/history, four persisted messages, tested result references, counts/activity and deletion tombstones; old-data persistence across replacement/restore pending |
| SQS workers, retry, leases and recovery | IMPLEMENTED | TESTED; emulator cases plus controlled live native/OCR processing, corrupt failure and retry | VERIFIED for exercised processing and successful/failed retry generations; duplicate/lease/outage/worker-interruption recovery remains emulator-tested only |
| Automatic API/worker scaling | IMPLEMENTED in template | TESTED by bounded live API traffic, actual policy/ASG inspection and launch activity | VERIFIED: alarm-triggered API 1-to-2 launch now reports Successful; resumed API target healthy; original second-target health not separately captured; worker scaling and automatic scale-in pending |
| CloudWatch logs/metrics/alarms | IMPLEMENTED in bootstrap/template | TESTED by schema/source review, inspected supplied job logs/SQS metrics and live-script matching completion assertions | VERIFIED for test-document original/retry completion events and earlier SQS metrics; all agent metrics/alarms/bootstrap streams pending |
| Single-entry deployment | IMPLEMENTED | Shell/template/handshake checks passed; corrected retry printed website; independent HTTP checks and owner stack-state inspection passed | VERIFIED: v2 `CREATE_COMPLETE`, reachable release and frontend publication; individual signal events not collected; historical failures retained below |
| Existing-data import | IMPLEMENTED | TESTED with private synthetic snapshot; repeat import/source-preservation inspected | BLOCKED; real production data not imported |
| Rendered AWS UI and error states | Existing design retained; upload integration changed | Frontend compile/lint passed | BLOCKED pending deployed browser checks |

These statuses include inspected output of the owner-run reviewed verification script, distinct from direct audit-workstation HTTP observations and browser reports. They do not upgrade the earlier local audit or establish unexecuted cloud cases. **Core cloud acceptance: PASS WITH LIMITATIONS. CI/CD and broader production acceptance remain incomplete.**

## Completed owner-run live acceptance - 10 October 2026

The owner supplied console output for:

```bash
cd ~/Prashn-cloud
git pull --ff-only
EXPECTED_ACCOUNT=683146427271 PRASHN_STACK=prashn-cloud-v2 AWS_REGION=us-east-1 bash verify.sh --resume-for-test --pause-after
```

The initial invocation from `~` returned `bash: verify.sh: No such file or directory`, before any tests. Changing into the checkout resolved it; `git pull --ff-only` reported Already up to date. The corrected full run completed with **PASS WITH LIMITATIONS**, **41 VERIFIED entries**, **zero FAILED**, **zero BLOCKED**, and one grouped **NOT TESTED** scope entry. Entries include configuration and aggregate cleanup checks; this is not 41 separate independent application test cases.

The script printed report directory `.aws-build/audit-20261010T162320Z-f7a06f/`, whose start marker is **16:23:20 UTC / 21:53:20 IST on 10 October 2026**. Finish time and elapsed duration were not supplied. Original `report.md`/`report.json` and raw HTTP bodies were not supplied; conclusions are based on inspected console output and the reviewed script's explicit assertions. The supplied output and a derived summary are preserved locally under ignored `.aws-build/live-acceptance-evidence/audit-20261010T162320Z-f7a06f/`. The audit workstation made no new AWS/website calls during this review.

| Executed area | Inspected live-script result |
| --- | --- |
| Stack/resources/security configuration | Correct account, CREATE_COMPLETE, both private/encrypted S3 configurations/TLS policies, ACTIVE DynamoDB/indexes/PITR, encrypted SQS/matching DLQ, restricted workload ingress, IAM profiles/inline policy checks, IMDSv2/encrypted launch settings and disabled CloudFront API cache passed |
| Previous automatic API scale-out | The previously recorded alarm-triggered launch of `i-0bde7c7feb6d72e06` now reports **Successful**, replacing its earlier warmup-pending observation; no new load test was run |
| Bounded resume and current readiness | Both groups resumed to desired 1/max 2; API target `i-0ef733c7121c6fd7a` healthy; production health 200 with S3/DynamoDB/SQS and full release `4fa4879f5b545eb8e06418b8549704cd7f85282b` |
| Frontend publication | HTML, referenced JS/CSS and SPA route over verified HTTPS passed; no rendered browser interaction test |
| Two fresh accounts | Each registration 201, duplicate 409, incorrect password 401, login/me 200 and future issued-token expiry passed |
| Protected routes and ownership | Missing/malformed/tampered token 401; user B details/download/question/history-clear/retry/delete 404, list/activity empty and user A record still accessible |
| Upload validation | Unsupported MIME, traversal filename, oversized intent and zero-byte intent 400 passed |
| Independent processing | Two overlapping native-PDF upload workflows retained separate IDs/originals/results and distinct source vendors/totals; source text/fields/pages/SHA256 and identical private originals matched |
| Categories and OCR | Receipt, Form, Unknown, PNG, JPEG and image-only PDF fixtures passed source/field/page/reference/original-byte checks; reviewed assertions require OCR provenance for scanned fixtures |
| Q&A/history | Selected-document amount/citations matched; absent passport fact refused; four history messages unchanged across reads and confirmed in DynamoDB; other document history empty |
| Retry/failure | Valid owner retry completed in generation 2 with expected source values; corrupt PDF recorded Failed with reason, questions 409, then another Failed retry generation |
| Lists/metrics/activity/logging | Nine test records matched list/counts; upload/retry activity matched; CloudWatch delivered the original and retry completion events for the test document |
| Logout policy | Logout 200; request after discarding token 401; the retained JWT still worked as documented because server token revocation is absent |
| Deletion/storage cleanup | All nine test documents inaccessible, originals/results/history removed, minimal tombstones/deletion activity retained |
| Compute pause | Both stack groups inspected at **minimum/maximum/desired/current = 0**; API intentionally unavailable; ALB/storage/logs/original-server costs remain |

The preflight plan snapshot reported **FREE**, remaining credits **139.05 USD**. It was collected before the functional tests, not a final test-cost measurement. Do not attribute the change from the earlier 139.61 estimate entirely to this run or claim a reconciled bill. Two generated accounts and minimal audit records remain under the documented policy.

Still unexecuted in this live run: rendered browser/mobile/error states, worker scale-out, automatic scale-in, busy-worker interruption/DLQ redrive, real data import/backup restore, old-data persistence across pause/resume, a correctly signed expired-token test, runtime IAM denial tests and complete security/performance acceptance. CI/CD remains pending. Core deployment/functionality is verified within the executed scope; unrestricted production readiness is not declared.

## Current live document and cost observations

These initial observations precede the live scale-out evidence recorded in the next section; statements about pending traffic/scaling below are historical checkpoints.

The owner supplied `prashn-cloud-v2` status **CREATE_COMPLETE** and its resource outputs. This confirms actual stack provisioning, beyond the previously inspected public endpoints. The owner also reported fresh-account registration, upload/extracted-value checks, Q&A and question history after refresh working in the browser. No source document, exact expected field values or rendered browser session were independently inspected for that report.

Read-only owner-run service checks produced these mutually matching observations:

- S3 bucket `prashn-cloud-v2-documents-rdt7uxzmmecc` contains original `originals/c7ac43ec-23bf-443f-9ed1-506ee65c378c` (**290,957 bytes**) and result `results/DOC-904e17f3-f3f7-46a6-b6f7-ee5c255d0d20/1-c9a2a174-7b53-4259-ab11-98b3a715ac26.json` (**8,541 bytes**): **two objects, 299,498 bytes**.
- A consistent DynamoDB scan of `prashn-cloud-v2-Data-1A1BL8CP0EBBD`, filtered/projected to document metadata only, returned one document with `PK: DOC#DOC-904e17f3-f3f7-46a6-b6f7-ee5c255d0d20`, `status: Completed` and the exact S3 result key above. `Count: 1`, `ScannedCount: 18`; customer profiles/password hashes and question contents were not returned by that projection.
- Application log group `/prashn/prashn-cloud-v2/application` contains `job_completed` for the same document, generation **1**, at **2026-10-10 00:15:07.167 UTC** (**05:45:07.167 IST**).
- SQS CloudWatch sums over the owner's two-hour query window were **1 sent, 1 received and 1 deleted** for `prashn-cloud-v2-Jobs-IAwD9MmUQPJV`. These are operation counts, not a general exactly-once guarantee.
- Both live ASGs had **minimum 1, desired 1, current 1, maximum 2**. The API group is `prashn-cloud-v2-ApiGroup-wNaD6zJovorZ`; the worker group is `prashn-cloud-v2-WorkerGroup-7tyvnqSr5bU0`.
- Live API policy `prashn-cloud-v2-ApiRequestScaling-frosbI9Ofh37` is **TargetTrackingScaling**, **ALBRequestCountPerTarget**, target **100.0**. No activity demonstrating a policy-triggered capacity change has yet been supplied.
- AWS Free Tier plan-state response: **FREE**, **ACTIVE**, remaining credits **139.61 USD**, expiration `2027-01-06T05:45:03.181000+00:00` (**6 January 2027, 11:15:03 IST**, fractional seconds omitted). This is an inspected API response, not an instant reconciliation of the final bill.

The owner selected testing/demo-only uptime and initially an additional testing allowance of **$4 total before credits**, subsequently increased to **$10 total before credits**. Traffic limits and the observed two-instance group maxima remain unchanged. No live traffic-test result has been supplied at this checkpoint. Baseline hosting, the original EC2 server, the ALB and retained data resources remain separate ongoing costs; the allowance is a planning constraint, not an AWS hard cap.

A reusable `infra/scaling_demo.py` now caps traffic at four health requests/second, 360 seconds, 1,440 load requests plus one preflight, and eight in-flight requests. It validates cloud health, avoids catch-up bursts, stops scheduling after repeated failures and makes no AWS capacity API calls. Existing scaling can add one API instance under the observed maximum of two. Three real loopback HTTP checks cover pacing/request limits, early stop on repeated 500 responses, and rejection of invalid targets/unbounded arguments before network requests. The first run exposed an unclosed HTTP error response; it was fixed by explicitly closing that response. Final `python -W error::ResourceWarning -m unittest discover -s infra/tests -v` passed **11/11** (three traffic checks plus eight handshake checks), no reported resource warnings, in **4.35 seconds**. Actual scale-out/scale-in, pause/resume persistence and billing impact remain pending. The bounded test and deliberate zero-capacity pause/resume instructions are in [the operating guide](aws-migration.md#bounded-api-scaling-demonstration).

## Bounded live API scale-out and one-command acceptance preparation

On **10 October 2026**, the owner ran `python3 infra/scaling_demo.py --url https://d1ew9wh9ondbo.cloudfront.net --seconds 360 --rate 4`. The final inspected result was **360.01 seconds, 1,439 submitted, 1,439 successful, zero failed**, plus the separately logged health preflight. The planned maximum was 1,440; that is not the actual request count. The release was `4fa4879f5b545eb8e06418b8549704cd7f85282b`.

Inspected owner-run `describe-auto-scaling-groups` showed API **desired 2/max 2**, with `i-044c12ec22f0c292c` and newly launched `i-0bde7c7feb6d72e06` both **InService/Healthy**. Worker remained **desired 1/max 2**, instance `i-03befd5783bb80c3d` InService/Healthy. `describe-scaling-activities` identifies the target-tracking monitor alarm at **01:14:55 UTC (06:44:55 IST)** changing desired capacity **1 to 2**. Its launch activity started at **01:15:03.681 UTC (06:45:03.681 IST)**. This verifies actual automatic API scale-out, beyond policy existence or HTTP availability alone.

The activity's latest supplied status was **WaitingForInstanceWarmup**, not Successful. ASG Healthy can precede ALB application readiness during the grace period; no second-target ALB-health output or final warmup completion was supplied. The older Successful activity refers to the baseline user-requested launch, not this scale-out. Worker scale-out and automatic scale-in remain untested.

The owner's SQS attribute checks returned visible **0**, in-flight **0**, delayed **0**, twice, before the pause instructions. The owner subsequently reported running pause commands; the worker command in the reply was truncated and no final capacity output was supplied. **Actual zero-capacity pause is not yet verified.** Queue counts are approximate. No final billing impact has been measured.

Added `verify.sh` and `infra/verify_deployment.py`, with committed controlled OCR fixtures and [one-command instructions](cloud-acceptance.md). The script verifies stack/configuration, core API workflows, two-user isolation, source-grounded extraction/Q&A/history, failure/retry, original/result references, private downloads, CloudWatch job logs, existing scale-out activity and deletion. Explicit `--resume-for-test --pause-after` handles the owner's paused demo fleet, with bounded capacity/traffic and inspected zero-capacity shutdown. This code is IMPLEMENTED and locally TESTED; its full live run is **pending**, so no new live acceptance results are claimed.

Local command `python -W error::ResourceWarning -m unittest discover -s infra/tests -v` passed **26/26**, zero failures/resource warnings, final captured run **7.53 seconds**. Fifteen acceptance-script safety checks plus the earlier eleven traffic/handshake checks ran without AWS access. Python compilation, `bash -n verify.sh` and whitespace validation passed. Fixture validation separately executed all **eight** PDFs/images through the real local extractor/classifier/field extractor; expected types/pages/passages/vendors/totals, form/receipt fields and OCR provenance matched, including PNG/JPEG and image-only PDF OCR. An intermediate cleanup indentation error was caught by compilation and fixed before the successful rerun. These local results do not establish deployed extraction or the live script's final verdict. Application source, infrastructure template and visual design were not changed.

## First CloudShell rollout attempt and portability correction

On 10 October 2026, the owner supplied output for `EXPECTED_ACCOUNT=683146427271 AWS_REGION=us-east-1 bash deploy.sh plan` and then `bash deploy.sh apply`. Read-only preflight passed, with quota `16.0`, estimated peak `10` vCPUs and two usable public subnets. The frontend production build passed. Backend compilation passed, but `npm test` reported **23 passes and 14 failures across 37 reported tests/hooks**, zero skips, in 12.05 seconds. This is a failed run, not a replacement passing result. SQLite loading failed with `ERR_DLOPEN_FAILED`: `/lib64/libm.so.6: version GLIBC_2.38 not found`, required by the downloaded `node_sqlite3.node`. Uninitialized test-server URLs and cleanup-hook errors followed the startup failures. Dependency-install advisory counts remained seven frontend and three backend; they were not force-upgraded.

The script stopped at the backend test gate before its artifact/application CloudFormation creation commands. The supplied output shows no new stack creation, document migration or modification of the original application. No AWS resource inventory was independently inspected during this follow-up.

Correction: added `infra/verify-native.sh`, called after backend `npm ci` by both deployment and fresh-instance bootstrap. An incompatible SQLite load triggers a scoped `npm_config_build_from_source=true npm rebuild sqlite3` on Linux with Python/make/g++ present. Rebuild failures stop immediately. The final check executes a real in-memory SQL query, creates a canvas and checks a bcrypt hash. The helper is included in the release archive. The DynamoDB runtime selection and existing visual design are unchanged.

Executed local verification after this correction:

- Git Bash `bash -n deploy.sh`, `bash -n infra/bootstrap.sh`, `bash -n infra/verify-native.sh`: all passed.
- Git Bash `bash infra/verify-native.sh`: passed against actual installed Windows native modules, including the SQL query, canvas and bcrypt checks.
- A disposable ignored shell harness with stubbed commands exercised a failed prebuilt load followed by a scoped source rebuild, a rebuild failure that stopped validation, and a final smoke-check failure that stopped validation: all three checks passed. These are control-flow checks, not evidence of a successful Linux compilation.
- Backend `npm test`: **35/35 passed**, zero failures/skips, 12.31 seconds on Windows.

The actual CloudShell source rebuild, corrected deployment, live scaling/log delivery and new website acceptance remain pending owner-run output. The 18-case emulator suite was not repeated for this installation-only correction; its earlier evidence remains historical.

## AWS rollout and readiness signal correction

The owner pulled `64f4976`, installed the CloudShell C++ build tools and reran `apply`. Supplied output shows the incompatible prebuilt SQLite load followed by **a successful source rebuild and native checks** on CloudShell Amazon Linux 2023, Node **20.20.2**. Frontend build passed, and backend `npm test` passed **35/35**, zero failures/skips, in **15.59 seconds**. The AWS SDK emitted an advisory about future Node 22 requirements; fresh-instance bootstrap installed the pinned Node 22 release. The artifact stack was created successfully and the main stack entered creation.

After the terminal reconnected, no deployment-script process was found by the owner. CloudFormation continued provisioning. Supplied events show CloudFront and scaling policies created, followed by worker failure at **2026-10-09 23:28:49 UTC** (10 October 2026, **04:58:49 IST**): `Received 0 SUCCESS signal(s) out of 1`. The API group's creation was cancelled, and final status was **ROLLBACK_COMPLETE**. Both new EC2 instances were terminated. This is a failed rollout; the new website was not published or accepted.

The retained application group `/prashn/prashn-cloud/application` had streams for both instances. Inspected owner-supplied events show worker `i-0484257736cf644d2` logged `worker_started` at **23:12:05 UTC**, then a successful empty orphan-reconciliation result. API `i-0fbd2e4d3ff8fc738` logged DynamoDB configuration, server startup and repeated `/api/health` HTTP 200 responses from **23:12:00 UTC** onward. This verifies delivery of those application logs and the logged startup/health results, not document CRUD, queue processing, scaling, every metric or independent browser acceptance.

The owner's worker console output confirms native checks, service and CloudWatch Agent startup, then a normally completed cloud-init final stage at **23:12:11 UTC**, before termination during rollback. It does not contain an explicit rejected-signal error. Source review found that the deployed user data used `--unique-id "$(hostname)"`. AWS's [SignalResource specification](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_SignalResource.html) requires the EC2 instance ID when signalling an Auto Scaling group. This is a confirmed code defect and a likely explanation for the observed missing accepted worker signal; the supplied logs alone do not prove the exact signal request/response.

Correction: `infra/signal-ready.sh` checks for a creating/updating stack, obtains and validates its EC2 instance ID via IMDSv2, and sends the readiness signal with that ID. It propagates lookup/metadata/signal failures, uses bounded SDK/metadata retries, and prints no metadata token. The generated user data invokes it after the existing application startup checks; the release archive includes the helper. Bootstrap output now goes to a separate `{instance_id}/bootstrap` CloudWatch stream for future diagnosis.

Local `python -m unittest discover -s infra/tests -v` passed **8/8** stubbed handshake checks in **1.52 seconds**: creation, update, completed-stack scale-out, rollback, invalid hostname ID, failed metadata retrieval, failed stack lookup and failed signal API. These contact neither AWS nor IMDS. Template regeneration and `cfn-lint infra/template.json infra/artifacts.json` passed. Application code was not changed by this correction; the latest actual backend evidence remains the owner's 35/35 CloudShell result. An actual accepted instance-ID readiness signal and complete corrected deployment remain pending a separate retry. Historical failed-run evidence is retained above.

## Corrected v2 publication and independent public checks

The owner pulled `4fa4879` and attempted `PRASHN_STACK=prashn-cloud-v2 ... bash deploy.sh apply`. A first v2 attempt stopped at native validation because `g++` was missing in the current CloudShell environment; it had not reached provisioning. The newly installed tmux client also reported `server version is too old for client`. Guidance was corrected to reinstall the C++ tools, use a separate tmux server socket with `env -u TMUX tmux -L prashn-v2 ...`, and append the deployment output to a persistent home-directory log. This does not kill the existing CloudShell tmux server and cannot preserve a process across full compute-environment shutdown.

The subsequent supplied terminal text shows all **eight handshake tests passed**, frontend/backend install/build/test stages were entered, both CloudFormation deployment waits were passed, and the script printed **`Website: https://d1ew9wh9ondbo.cloudfront.net`**. That pasted terminal text omits some lines, including the backend pass/fail summary and final health body; no missing command output is reconstructed or claimed as directly inspected.

Independent commands executed from the audit workstation on **10 October 2026, approximately 05:39-05:40 IST** (00:09-00:10 UTC):

```powershell
curl.exe -i --max-time 20 https://d1ew9wh9ondbo.cloudfront.net/api/health
curl.exe -sS -i --max-time 20 https://d1ew9wh9ondbo.cloudfront.net/
curl.exe -sS -i --max-time 20 https://d1ew9wh9ondbo.cloudfront.net/api/documents
curl.exe -sS -i --max-time 20 -H 'Authorization: Bearer invalid-audit-token' https://d1ew9wh9ondbo.cloudfront.net/api/documents
```

| Endpoint / request | Inspected result |
| --- | --- |
| HTTPS `/api/health` | **200**, `status: ok`, production, `processingMode: sqs`, `storageMode: s3`, `databaseMode: dynamodb`, `release: 4fa4879f5b545eb8e06418b8549704cd7f85282b`, extractive Q&A, `layout-fields-v2` |
| HTTPS `/` | **200**, frontend HTML from Amazon S3 through CloudFront; references `index-Bi5WCa2l.js` and unchanged `index-CSsXUjLz.css` |
| `/api/documents`, no Authorization | **401**, `{"error":"Unauthorized","message":"Missing token"}` |
| `/api/documents`, malformed bearer token | **401**, `{"error":"Unauthorized","message":"Invalid token"}` |

TLS verification was enabled; no insecure option was used. Responses carried CloudFront headers and API Gateway request IDs on API responses. A web-reader tool could not access the URL; the actual curl requests above succeeded and supply the evidence. No authenticated user records were read, created or changed by these checks.

These checks establish public reachability, published frontend HTML, the active release/modes and two unauthenticated rejection cases. They do not establish valid-login behavior, user isolation, actual S3/DynamoDB document operations, SQS processing, retry/deletion, new-stack log delivery, scaling or rendered UI. No AWS console credentials were used by the audit workstation; explicit `CREATE_COMPLETE` and accepted instance-ID signal events remain owner-side verification steps. Existing-data migration and deliberate cleanup of the original server/failed-stack retained resources remain outstanding. **Website deployment passed these initial checks; full cloud acceptance is not yet complete.**
# CI/CD preparation — 2026-10-10

Follow-up: implementation commit `ba092929e5468897e769d3ba499fe9a5c57d5d76` passed [GitHub CI run 38072471640](https://github.com/gayas-sheik/Prashn/actions/runs/38072471640), including the real release-packaging and artifact-upload steps. The same code was fast-forwarded to `main`; GitHub's workflow API returned `state: active` for `delivery.yml` (workflow ID `380701143`). Checksum-verified actionlint 1.7.12 returned exit 0 for both workflows (`-shellcheck= -pyflakes=`); embedded shell/Python were checked separately. Git status was clean and `git ls-files docs/private-handbook` returned no tracked files. Live AWS OIDC setup and approved delivery remain pending.

GitHub CI run [38069908701](https://github.com/gayas-sheik/Prashn/actions/runs/38069908701) completed successfully for `95a95cfcacc289075033161443ff0c75246c4e36`: dependency/native checks, frontend build/lint, backend regressions, local AWS-emulator tests and infrastructure checks. Packaging was skipped on that initial ordinary push run. The revised CI also packages push/manual runs so artifact generation is exercised before any AWS delivery.

Executed locally: `python -W error::ResourceWarning -m unittest discover -s infra/tests -v` — **41 passed**, 9.264 seconds. The new real-packager test initially failed because Windows manifest paths used backslashes; changed to POSIX paths and reran successfully. Delivery tests inspect revision/checksum/privacy guards, change-set resource/parameter bounds, stale completion observations, OIDC subject/boundary controls and cleanup waiting. Bash syntax, Python compilation, workflow YAML parsing and `git diff --check` passed. No AWS resources were created by these checks.

Implemented manual code-only delivery, one-time OIDC/role/boundary setup, exact deployed-release acceptance checking and a separate cleanup job. **Live IAM setup, OIDC assumption, CloudFormation release through GitHub, and post-release pause remain unverified until a real delivery run completes.** Manual workflow activation on `main` is complete as recorded above. See [CI/CD setup and operations](ci-cd.md). Previous owner-run application acceptance remains separate evidence.
