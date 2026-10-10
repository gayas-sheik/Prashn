# Prashn local application validation

Date: 2026-10-09. Base: upstream `a15b25b` in the fresh `Prashn-latest` checkout. Runtime: Windows, Node 22.14, SQLite, local storage, pdf-parse 2.4.5 and Tesseract.js 7. Ollama and AWS are not enabled.

## Problems reproduced or identified

- The upstream frontend and backend failed TypeScript builds.
- Scanned PDFs had no OCR path. OCR failures were converted into success-looking text.
- Extraction contained a hardcoded total (`6045.00`), vendor-name replacements, and automatic dollar symbols.
- Q&A expanded unrelated synonyms and selected matches with little evidence; every citation claimed page 1.
- Previews used the wrong token key; downloading the original produced simulated bytes.
- Login displayed a fake user while API requests shared an automatically created test account.
- Reprocessing could run concurrently; interrupted jobs had no restart recovery. Deleted documents left extracted text and chat records.
- Several UI metrics, staged uploads, notifications and settings represented static examples as real results.

## Automated regression coverage

Run `npm test` from `backend/`. Tests generate actual PDFs and raster images, use the real extraction engines, and run HTTP requests against Express with an isolated database and storage directory.

| Case | Checks |
| --- | --- |
| Digital PDF | Two pages, full text, tabular columns, invoice fields, original currency, line items |
| Structured extraction | No invented totals/currencies/OCR corrections; INR, zero discount, tax rate, longer field aliases, form names |
| Dates and forms | Invoice date versus due date, before-tax amount, email address, form name |
| Document Q&A | Total, subtotal, tax, vendor, product quantity, ordinal item price, product list, warranty passage, absent attributes and products |
| Image and scanned PDF OCR | Real PNG/JPEG OCR with bundled language data; mixed digital/scanned PDF |
| Failure reporting | Blank image, corrupt PDF, unsupported type |
| API workflow | Registration/login, ownership isolation, original bytes, page citations, validation, persisted chat clearing, retry and deletion |
| Recovery and limits | Batch upload, unique IDs, interrupted-job recovery, readiness guard, failed upload processing, page limit |
| Attribute disambiguation | Phone number, tax amount versus rate, invoice payment status versus total, paid amount, payer, payment date/method |
| Rotated image | Real OCR of a clear invoice rotated 90 degrees |
| API boundaries and legacy content | Invalid/missing tokens, no URL-token bypass, 10 MB file limit, 20-file batch limit, legacy page-content recovery, cross-user deletion/activity isolation |
| Visual PDF reading order | Values drawn before labels are reassembled by page coordinates; date, invoice number and customer stay paired with actual values; bare headings are rejected |
| Optional provider contract | Mocked model response must quote actual page content; invalid citations are rejected. No model is installed or invoked. |

All eighteen automated cases passed in the latest local run. Backend build and frontend production build passed; the backend development command had passed in the earlier repair pass. Lint exits successfully with React advisory warnings concerning effect state updates, context exports and event-handler purity; it is not warning-free.

## Served application check

A separate smoke test passed through the running frontend at port 5174 and its Vite proxy to the isolated backend at port 5050. It verified served HTML, health reporting `extractive` Q&A, registration/login, PDF upload and completion, laptop quantity, missing vendor-age information, a warranty passage, byte-identical download, live metrics and test-document cleanup.

Visual browser QA was unavailable: the browser connector reported no enabled browsers. Build and HTTP checks do not establish visual or interactive browser correctness.

## Remaining limits

- Lightweight Q&A is extractive, with limited paraphrase understanding, reasoning, and conversational follow-ups. It is not a general language model.
- OCR quality depends on resolution, typography, language and layout. Handwriting and complex tables are not guaranteed. `OCR_MODE=always` handles incomplete PDF text layers when auto-detection is insufficient.
- Classification and field confidence values are heuristics, not calibrated accuracy probabilities.
- Theme preferences work. Other unfinished account/cloud settings are read-only and labelled as planned.
- The local queue is bounded and recoverable on restart, but does not provide distributed processing across multiple server instances.
- AWS still requires storage, queue, database, extraction and inference adapters. Large extracted content should live in object storage rather than exceed DynamoDB item limits.

## Follow-up verification of a reported invoice failure

A real uploaded three-page invoice was rendered and visually inspected after the user reported incorrect prefills. Its PDF drawing instructions listed many values before their corresponding labels. Native extraction now reconstructs rows using PDF.js coordinates rather than drawing order. Reprocessing restored the invoice number, customer and date fields, and ordinary cost/amount/date questions returned the correct values with citations. The original PDF and existing chat history were preserved. An anonymous PDF with the same ordering defect was added to the repeatable regression suite; the private invoice is not committed as a fixture.

## Documentation pause status

Development was paused at the user's request on 9 October 2026. The last run completed with 15 tests passing. Two additional cases cover column fields, multiline addresses, payment method/amount, GST identifiers, distinct invoice numbers across pages, and classification word boundaries. The latest frontend build and lint passed, with existing React advisory warnings.

The latest column-field changes were verified with anonymous generated fixtures. They were not reapplied to the stored private invoice before the pause, and the running static backend was not restarted for that build. Existing records need Reprocess after the latest backend is launched. No model or AWS service was installed or deployed.

## General multi-page repair verification

Development resumed locally after the reported missing invoices and basic-question failures. Extraction no longer stops at the first label/amount match or deduplicates matching values across different pages. Explicit compound labels are checked before matching short prefixes, preventing Date from consuming Date of Birth. Generic repeated colon fields and FROM/TO blocks are retained. Answers return matching values with their pages rather than selecting the first date or tax field.

Generated digital PDFs with 1, 2, 4 and 7 invoice pages passed extraction and question checks; separate cases cover repeated receipts, forms, unknown-document fields and two distinct invoice entries on one page. Questions include the reported “what is the invoice” and “Whatt is the date”, plural dates, totals, tax, due dates, distinct invoice-number count, page-scoped questions, missing pages and punctuated page selectors. A five-page HTTP upload test verifies stored fields, every answer citation, conversation persistence, original bytes and retry results.

The chat card now gives its inner content a constrained flex height so the message thread can scroll while the input remains reachable. Chat autoscroll targets that thread instead of the whole page. Long field values wrap, and PDF preview sizing no longer forces a 500-pixel iframe inside a 400-pixel clipped container. Frontend build/lint pass. The browser tool failed to start, so these layout changes still need visual and interactive browser review.

All 18 backend cases pass. This run uses an isolated test database and generated fixtures; it does not demonstrate perfect extraction for arbitrary layouts or reprocess the user's existing uploads. Restart any static compiled backend and reprocess affected existing documents. Changes were kept local during this verification pass.

## Upload result flow update

The upload screen now polls accepted documents without overlapping polls, cancels status requests on unmount, and automatically navigates to completed single-file results. Batch results render recognized fields, line items or page text previews inline, retaining failure reasons and processing retry actions. Removing a selection cancels automatic navigation; completed documents remain stored. File inputs reset so the same file can be selected again. Displayed upload limits now match validation, and the UI bounds selections to 20 files. Frontend build and lint pass, with existing advisory warnings. Interactive browser testing remains outstanding; the earlier 18 backend tests validate the underlying upload/status/retry contracts, not these browser interactions.

## Runtime mismatch and screenshot follow-up

Process launch paths confirmed that the frontend on 5173 used `Prashn-latest`, while the backend on 5000 used the older `Prashn` checkout. The older backend had no pending jobs when switched. Its database was backed up, and the latest backend was configured through ignored local environment paths to retain the existing database and storage. The document shown in the screenshot was then reprocessed through the latest API. Its invoice number, date and total passed assertions, original-file checksum remained identical, and conversation row count was unchanged. Earlier incorrect replies remain historical messages; new questions use the corrected record.

Health through the frontend proxy now reports `workspace: Prashn-latest` and `extractionVersion: layout-fields-v2`. The default Q&A PDF preview requests fit-to-width rather than forcing 100% zoom in a narrow panel. The `view=FitH` parameter is supported by the [Chromium PDF parameter parser](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/resources/pdf/open_pdf_params_parser.ts); interactive rendering still needs browser verification.


## Synthetic evaluation and browser verification

A subsequent 9 October 2026 pass used nine new fictional PDFs, 72 expected fields and 73 sequential questions. Targeted repairs improved expected-field correctness/provenance from 64/72 to 72/72 and fully correct question/citation checks from 41/73 to 73/73. All 12 missing-evidence questions still refuse. The six added regression cases bring the backend suite to 24 cases.

Brave browser testing now covers single-upload automatic navigation, mixed-success batch results, retry of a corrupt PDF, original PDF preview, typed Q&A, persisted long-history scrolling, mobile navigation/upload layouts at 390 x 844 CSS pixels, and automatic logout after token expiry. The mobile header and staging actions were repaired; fabricated navigation badges and cloud/certification claims were removed. Frontend build passes and lint has 11 advisory warnings with no errors.

See [the full synthetic evaluation and browser report](synthetic-evaluation-report.md) for grading definitions, observations, reproduction instructions and limits. This is a synthetic development benchmark, not an independent holdout or a claim of perfect real-document accuracy. Original user records were not reprocessed in this pass.

## Final independent local MVP audit - 9 October 2026

This entry records a new run against `Prashn-latest` based on `d330c37` and the subsequent local repairs. Earlier counts and browser claims above are historical; they are not a substitute for this pass. See [the final audit](local-mvp-final-audit.md) and [sanitized execution evidence](local-mvp-final-audit-evidence.json) for scope, endpoints, source hashes, limitations and the verdict.

The original suite passed 27/27. New isolated fault tests initially passed 1/7 and failed 6/7: development accepted a missing signing secret, simultaneous duplicate registration returned 500, simultaneous retries produced duplicate acknowledgements/activity, a blank vendor consumed a Notes field, a failed metadata insert left an inaccessible original, and failed processed-text deletion happened after removal of its database record/original. Those defects were repaired and rerun. Read-only review of a real template also exposed incorrect column associations, date placeholders and URL footer fields; an eighth regression covers those cases.

An intermediate full suite passed 34/35 because the new missing-field guard also rejected a valid payment-method/amount row. The guard was narrowed, that failure was retained in the raw log, and the final `npm test` run passed **35/35** with zero skips/failures. Tests now provide random local signing secrets; the normal suite includes `final-audit-faults.cjs`.

`npm run audit:local` passed **17/17** independent checks with separately launched backend/Vite servers, an isolated SQLite database and disposable accounts/storage. It recorded 110 HTTP observations. Checks include missing/malformed/expired/wrong-signature/unsigned tokens, two-user isolation across every document operation, independently specified invoice vendors/currencies/totals, a mixed batch with corrupt input, six concurrent distinct uploads, persisted Q&A across an actual backend stop/start, recovery of a persisted pending record, failure/retry, original bytes and complete text, live metrics, conversation clearing and deletion. Five concurrent retries now produce one 200, four 409 responses and one accepted retry event/job. SQLite integrity was `ok`, with no foreign-key violations in the audit database.

The final `npm run evaluate` reproduced **9/9 completed and correctly classified documents, 72/72 expected fields, 2/2 line items, 73/73 Q&A checks, 61/61 positive citations and 12/12 refusals**. This benchmark checks expected-field correctness/recall, not the precision of all extra emitted fields or arbitrary-document accuracy. Local OCR is implemented and was exercised with English image/scanned/rotated/mixed-page fixtures.

Two existing PDFs were rendered/extracted read-only before and after the repairs. The invoice-bearing first page of a ten-page browser-printed template and all three pages of a real ride/tax invoice were visually compared with selected results. Original checksums stayed identical. The template's blank date now refuses and false customer/URL associations are removed. Unlabeled company/customer blocks and general component-tax aggregation still have documented coverage limits. Private source contents/renderings remain in ignored output; existing records were not manually reprocessed or deleted.

The existing Activity and Processing screens now show request failures; Processing catches retry errors; the dashboard activity card handles loading/empty/error states and refreshes its real API data. These changes preserve the existing layout/design. Final frontend `npm run build` and `npm run lint` both exit 0; lint retains **11 warnings and no errors**.

Current interactive browser verification is **BLOCKED**: the connector returned no enabled browsers and the in-app browser was unavailable. The earlier Brave pass was not reproduced here. HTTP serving/proxy checks and builds cannot verify visual layout, upload navigation, scrolling, responsive behavior, theme rendering or absence of browser-console errors.

The new guard correctly refuses a missing signing secret in both development and production. It exposed that the normal local environment had been relying on the insecure fallback. A random secret was added only to the ignored `backend/.env`, without displaying it, and the existing watcher restarted successfully. Direct backend health on 5000 and normal frontend proxy health on 5173 both returned 200 afterward; audit-only servers on 5057/5177 were stopped. Old sessions require a fresh login. No AWS resources or credentials were introduced.

**Verdict: PASS WITH LIMITATIONS** for the exercised local API/processing baseline. Full frontend acceptance remains blocked; partial storage/database failure recovery, production security controls and portable/distributed AWS adapters remain unfinished. This entry does not declare the entire project complete or cloud-deployment-ready.

### Authorized Brave follow-up - 9 October 2026

After authorization to proceed with Brave, browser discovery still returned no apps or browsers. Explicitly opening the local application with browser ID `brave` returned `Browser is not available: brave`. No additional UI test ran. Browser acceptance remains BLOCKED pending browser access; this result does not demonstrate an application compatibility failure.

## EC2 deployment follow-up - 10 October 2026

The unchanged application source at `1b4217e` was deployed on Ubuntu 24.04 EC2 with Node 22.23.3, Nginx and HTTPS. Owner-supplied terminal output showed a fresh backend `npm test` run with **35/35 passing**, zero failures/skips, and a successful frontend production build. Backend production-only dependency audit reported zero known advisories; full installation still reported development/build dependency advisories, which were not repaired in this pass.

Inspected command results confirmed HTTP 200 health directly and through Nginx, HTTP 200 frontend HTML through Nginx, HTTPS health with normal certificate validation, HTTP-to-HTTPS 301 redirection, an enabled certificate-renewal timer and a successful Certbot renewal dry run. The owner reported successful browser use and retained document/field/question-history data after a backend restart; a subsequent health response was supplied. Temporary CloudShell SSH access was revoked and the remaining SSH rule was inspected.

See [the deployment record](ec2-deployment.md) for commands, configuration and evidence boundaries. Owner-reported browser checks do not replace the blocked independent rendered UI review in the local audit. The original local audit verdict is unchanged. This is EC2 hosting with local storage/processing, not verification of S3, DynamoDB, SQS, Textract, Cognito, scaling or CloudWatch application-log integration. No application code or visual design changed during this deployment pass.

## AWS adapter preparation regression - 10 October 2026

After adding optional S3/DynamoDB/SQS mode, the shared extraction pipeline and local storage/repository alternatives were rerun through `npm test`: **35/35 passed**, zero failures/skips, in the final captured 12.83-second run. Frontend production build and lint passed; lint retains the 11 existing React advisory warnings. CSS output is unchanged. Backend production-only dependency audit reported zero known advisories after SDK installation; development/build advisories remain unresolved.

The separate `npm run test:aws` suite passed **18/18** against local Moto services, including two-worker processing, user isolation, durable outbox/retries, a timed heartbeat, large output and size-boundary handling, deletion races and snapshot import. See [the preparation report](aws-migration-test-report.md) for precise scope and the [rollout guide](aws-migration.md). These are emulator results, not live AWS provisioning, scaling, logging or browser acceptance. The deployed original EC2 application and actual production data were not modified by preparation. The earlier independent local audit verdict is unchanged.

### CloudShell dependency compatibility follow-up - 10 October 2026

The first owner-run cloud `apply` stopped before provisioning: frontend build and backend compilation passed, but CloudShell could not load the downloaded SQLite binary because it required `GLIBC_2.38`. The test runner reported 23 passes and 14 failures, including follow-on startup/cleanup errors. The deployment and fresh-instance bootstrap now check native dependencies and rebuild incompatible SQLite binaries from source on Linux. Actual native smoke checks and three stubbed fallback/failure-path checks passed locally; a new Windows `npm test` run passed **35/35**, zero skips/failures, in 12.31 seconds. CloudShell compilation and live deployment remain unverified until the corrected script is rerun. See [the cloud preparation report](aws-migration-test-report.md#first-cloudshell-rollout-attempt-and-portability-correction) for the failed-run evidence and correction scope. The earlier local verdict is unchanged.

### AWS rollout and readiness follow-up - 10 October 2026

Subsequent owner-supplied CloudShell output confirms SQLite source rebuild/native checks, frontend build and **35/35 backend tests passing**, zero failures/skips, in 15.59 seconds. The new artifact stack succeeded; the main stack later reached **ROLLBACK_COMPLETE** after receiving no worker readiness signal. Both services had started: inspected CloudWatch output contains the worker startup event and repeated API health 200 responses. The worker console shows completed cloud-init and later rollback termination. Source review found the readiness command used a hostname rather than the EC2 instance ID required for Auto Scaling signals. That code defect was corrected and eight stubbed handshake regression checks plus CloudFormation schema validation passed locally. Actual acceptance of the corrected signal, complete deployment, application cloud workflows and scaling remain unverified. See [the rollout evidence](aws-migration-test-report.md#aws-rollout-and-readiness-signal-correction). The original local audit verdict is unchanged.

### Corrected cloud website publication - 10 October 2026

The owner-run `prashn-cloud-v2` retry printed **https://d1ew9wh9ondbo.cloudfront.net/** for release `4fa4879`. Independent curl requests with normal TLS verification returned frontend HTML **200**, health **200** with S3/DynamoDB/SQS modes and the matching full release hash, and document-list **401** for both missing and malformed bearer tokens. No authenticated records were read or changed during these public checks. Actual login/upload/processing/Q&A/isolation, new-stack logs and scaling, rendered UI, production-data migration and cleanup still need cloud acceptance; the deployment is not declared fully verified. See [the new public-check evidence](aws-migration-test-report.md#corrected-v2-publication-and-independent-public-checks). Historical failed attempts and the earlier local audit verdict are preserved.

### Live service and cost follow-up - 10 October 2026

The owner supplied `CREATE_COMPLETE`, reported successful fresh-account upload/extraction/Q&A/history browser checks, and supplied read-only AWS evidence for one matching completed document: two S3 original/result objects (299,498 bytes), DynamoDB completion metadata pointing to that result, a generation-one CloudWatch completion event, and SQS operation sums of one sent/received/deleted. Both ASGs were at one instance with a maximum of two; the actual API target-tracking policy has target 100 ALB requests/minute per target. These observations support that one-job cloud processing path, not all failure/isolation/scaling scenarios. The active Free plan reports 139.61 USD remaining credits; the owner chose demo-only uptime and a $4 additional testing allowance before credits. No live load test has run yet. A bounded demo helper and cost-control operating instructions were added; 11 infrastructure/helper checks passed locally with strict resource warnings, including three real loopback HTTP traffic-limit/failure tests. See [the current cloud evidence](aws-migration-test-report.md#current-live-document-and-cost-observations). The earlier local audit verdict remains unchanged.
