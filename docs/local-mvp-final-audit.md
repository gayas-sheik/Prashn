# Prashn - Final Local MVP Audit and Acceptance Verification

Date: 9 October 2026 (Asia/Calcutta). Audited checkout: `Prashn-latest`, based on `d330c37`, including the local fixes documented below. Runtime: Windows, Node 22.14.0, npm 10.9.2, Express, SQLite, native PDF extraction and local Tesseract OCR.

## 1. Executive summary

**Final verdict: PASS WITH LIMITATIONS.** The exercised local API and document-processing workflows pass after focused repairs. This is not an unconditional declaration that the whole MVP is complete: interactive/visual frontend acceptance remains **BLOCKED**, and extraction still has documented layout/recall limits. AWS adapters are not implemented, and a cloud deployment is not accepted by this audit.

The existing suite initially passed **27/27** tests. Independent fault checks then failed **6 of 7** expectations, demonstrating that the earlier passing report was insufficient. Repairs removed a known JWT fallback, corrected registration/retry races, prevented missing-value misassociation, compensated failed metadata creation, and retained deletion metadata until file cleanup. A real template exposed additional false column fields and placeholder answers, which were also repaired. Frontend request failures were made visible in the existing activity/processing views; the activity card now refreshes.

Final results: **35/35 backend tests**, **17/17 independent acceptance checks**, and the existing nine-document benchmark reproduced **72/72 expected fields, 2/2 line items, 73/73 Q&A checks, 61/61 positive citation checks and 12/12 refusals**. Frontend build and lint exit 0; lint retains 11 warnings. Two existing PDFs were inspected read-only beyond the generated fixtures. Originals remained checksum-identical.

There are two checkouts in the workspace. This audit targets the newer `Prashn-latest`, whose test suite and documentation match the current implementation. The older `Prashn` application code is not certified; two of its stored originals were used read-only as realistic input. No private document content was added to tracked audit evidence. No AWS resources, credentials or external inference service were introduced.

The normal backend briefly became unavailable when its development watcher loaded the new missing-secret guard: the ignored local environment had no private signing secret. A random 48-byte secret was added to `backend/.env` without displaying it, and the existing watcher was restarted. Both `localhost:5000/api/health` and the normal `localhost:5173/api/health` proxy then returned `200`, reporting `Prashn-latest` and extractive Q&A. Sessions signed with the old fallback need a fresh login. Existing stored documents were not manually reprocessed or deleted.

## 2. Requirement checklist and status definitions

**IMPLEMENTED** means inspected code exists. **TESTED** means the relevant check actually ran. **VERIFIED** means the observed result matched the stated expectation, within the tested scope. **FAILED** means an executed check did not pass. **NOT IMPLEMENTED** means functionality is absent. **BLOCKED** means verification could not be completed. A final VERIFIED row includes implementation and execution evidence; it does not claim correctness for every possible document or environment. Repaired historical failures are retained in section 7.

Evidence references:

- **R**: executed `npm test`; assertions in [workflow.test.cjs](../backend/tests/workflow.test.cjs) and [question-language.test.cjs](../backend/tests/question-language.test.cjs).
- **F**: executed [final-audit-faults.cjs](../backend/tests/final-audit-faults.cjs), now included in `npm test`.
- **A**: executed [final-audit.cjs](../backend/tests/final-audit.cjs), using separately launched backend/frontend servers, an isolated database, fictional accounts and independent expected values.
- **E**: executed the existing [evaluation runner](../backend/tests/evaluation/run.cjs) and inspected its output.
- **P**: read-only real-PDF rendering/extraction using [final-audit-real.cjs](../backend/tests/final-audit-real.cjs); page 1 of a ten-page template and all three pages of a ride/tax invoice were visually inspected. The other nine template pages were extracted but not individually graded.
- **B/L**: executed frontend build/lint. **S**: inspected the named source/configuration/documentation. **UI**: browser discovery returned no enabled browsers; opening `iab` returned `Browser is not available: iab`.

The [sanitized evidence JSON](local-mvp-final-audit-evidence.json) records checks, HTTP statuses, before/after fault observations, SQLite integrity results and source-file hashes. Raw logs and private PDF evidence remain in ignored local output; see section 3.

| # | Requirement | Final status | Evidence and scope |
| --- | --- | --- | --- |
| 1 | Frontend starts without errors | VERIFIED | A: Vite starts on 5177; `/login` serves HTML referencing the actual frontend entry. B: production build passes. This does not prove browser rendering. |
| 2 | Backend starts without errors | VERIFIED | A: development build/server starts on 5057; compiled restart also succeeds. Normal development watcher restored on 5000. |
| 3 | Frontend connects to real backend | VERIFIED for HTTP proxy; UI BLOCKED | A: health, authentication and document requests through Vite `/api` reach the isolated backend; S: pages use the actual API service. Browser requests not observed. |
| 4 | Health endpoint returns success | VERIFIED | A: 200, `status: ok`, `workspace: Prashn-latest`, `qaMode: extractive`. Normal ports also checked after restoration. |
| 5 | Environment configuration documented | VERIFIED for exercised configuration | README, `.env.example`, config and application guide inspected; A exercises alternate ports/storage/database/concurrency. Fresh dependency installation was not tested. |
| 6 | Registration works | VERIFIED | A: two accounts, 201; invalid input 400; normalized duplicate 409. F: simultaneous duplicates produce one 201 and four 409. |
| 7 | Login returns a valid token | VERIFIED | A: login 200, `/auth/me` returns correct account; wrong password 401. Registration does not itself issue a token. |
| 8 | Protected endpoints reject missing/invalid tokens | VERIFIED | A: missing, malformed, expired, wrong-signature and unsigned tokens rejected with 401 across route families; R rejects URL-token bypass. |
| 9 | Users cannot access each other's documents | VERIFIED | A: B cannot list A's documents or read, download, question, clear, retry or delete them; individual access returns 404. |
| 10 | Passwords securely hashed | VERIFIED | A: stored bcrypt hashes, cost 10, real password comparison; plaintext password absent from user responses. |
| 11 | Secrets excluded from Git | VERIFIED for current tracked files/rules | S: `.env`, data and outputs ignored; tracked environment file is `.env.example`; common AWS/private-key/API-key pattern scan returned no matches. Full Git-history secret scanning not executed. |
| 12 | Single-file upload works | VERIFIED | A: 201, queued record, real processing completes. |
| 13 | Multiple-file upload works | VERIFIED | A: one multipart request accepts four different valid PDFs plus corrupt PDF; valid jobs complete independently and corrupt job fails. UI multi-select uses separate single-file requests. |
| 14 | Each file gets independent ID | VERIFIED | A: five unique batch IDs and six distinct concurrent upload IDs. |
| 15 | File metadata persisted | VERIFIED | A: owner, filename, byte count, storage key, status, page JSON and checksum compared with SQLite and source bytes. |
| 16 | Files stored on disk | VERIFIED | A: byte-identical originals and full processed text read from isolated storage. |
| 17 | File type and size validated | VERIFIED within policy | R: >10 MiB returns 413; >20 files returns 400. A: unsupported MIME 415, no file 400. F: spoofed PDF MIME accepted at upload but processing correctly fails. Content-signature validation before storage is NOT IMPLEMENTED. |
| 18 | Deletion removes record and files | VERIFIED for normal and early cleanup-failure paths | A: original/text/metadata/history removed; other documents remain; deletion activity retained. F: failed text cleanup returns 500 while retaining all assets/record. Cross-resource atomic deletion is NOT IMPLEMENTED. |
| 19 | Processing asynchronous | VERIFIED | A/R: upload returns before terminal result; jobs finish through real extractor with concurrency 2. |
| 20 | Status transitions persisted | VERIFIED | A: upload/work/classification/extraction/completion/failure events and stored statuses inspected. Queued is stored; no separate `Document Queued` activity event exists. |
| 21 | PDF extraction uses actual content | VERIFIED | A: varied PDF bytes match extracted pages and full-text file; R: native layout tests; P: comparisons with rendered source. |
| 22 | Invoice classification | VERIFIED on exercised documents | A, E, R and P: classified invoices match expected category. Confidence is heuristic, not calibrated. |
| 23 | Receipt classification | VERIFIED on exercised documents | A receipt and E payment receipt; R word-boundary checks. |
| 24 | Form classification | VERIFIED on exercised documents | A form with name/DOB; E application form; R repeated form fields. |
| 25 | Unknown documents handled safely | VERIFIED on exercised documents | A field note and E shipment classify Unknown; no unsupported total/tax/vendor invented in the field note. |
| 26 | Extracted results match documents | VERIFIED for graded values; limitations remain | A checks distinct vendors/totals/currencies/dates; E checks 72 expected fields, not precision of every extra field; P confirms selected real values and records missed fields. |
| 27 | Document list displays actual API data | IMPLEMENTED; API VERIFIED; UI BLOCKED | A list/metrics match stored owned records. S: Dashboard/Documents map service responses; UI was not exercised. |
| 28 | Document details show fields | IMPLEMENTED; API VERIFIED; UI BLOCKED | A/R inspect persisted detail JSON; S details/full text/original preview use actual service data. |
| 29 | Q&A uses document-specific evidence | VERIFIED within supported queries | A alternates two invoices with different totals/vendors and inspects verbatim page citations; E has 61 positive citation checks. |
| 30 | Unanswerable questions handled honestly | VERIFIED on exercised missing-evidence cases | A absent customer phone; E 12 refusals; F missing vendor and printed date placeholders refuse after repairs. This is not a universal semantic guarantee. |
| 31 | History persists | VERIFIED | A SQLite row counts and conversation responses agree, including actual backend stop/start. |
| 32 | Questions isolated by user/document | VERIFIED | A: independent histories; cross-user read/ask/clear all 404. |
| 33 | Failures recorded | VERIFIED | A/F: corrupt, empty and spoofed PDF processing ends Failed with reason; lifecycle failure activity exists. |
| 34 | Retry works end to end | VERIFIED | A: unchanged corrupt input fails again; replacing only disposable test bytes then retrying reaches Completed. Completed records can also be reprocessed. |
| 35 | Retry avoids duplicate jobs/results/logs | VERIFIED within one process | F/A: five simultaneous requests produce one accepted retry, four 409 conflicts, one retry event and one added completion. Distributed idempotency NOT IMPLEMENTED. |
| 36 | Activity reflects real lifecycle | VERIFIED | A checks actual upload/work/completion/failure/retry/deletion events and ownership. Events are retained after document deletion. |
| 37 | Concurrent uploads preserve data | VERIFIED for six simultaneous uploads | A: distinct IDs, vendors and totals, all Completed; mixed batch failure does not contaminate successful documents. Not a load/stress benchmark. |
| 38 | Corrupt/unsupported inputs fail gracefully | VERIFIED | A/R/F: corrupt and zero-byte PDFs fail without false Completed status; unsupported MIME rejected; server remains usable. |
| 39 | API endpoints documented | VERIFIED | Route/controller inventory compared with application guide; actual API results in section 4. |
| 40 | Local setup accurate | TESTED in installed environment; clean setup BLOCKED | Builds, installed dependency inventories and alternate environment paths pass. `npm ci` in a fresh checkout was not executed; default backend now requires a secret in all modes. |
| 41 | Automated report reproducible | VERIFIED for executed commands | R/F/A/E rerun against current checkout; new scripts and expected values retained. Real private PDFs are not committed fixtures. |
| 42 | Local providers separated behind interfaces | IMPLEMENTED partially; full replaceability NOT IMPLEMENTED | Storage/extractor/classifier/answerer interfaces exist. Repositories are concrete SQLite classes; processor constructs local providers directly. |
| 43 | Q&A avoids unportable local path | VERIFIED by inspected execution path | S/A: question controller and answerers use persisted `doc.pages`/fields, not local text-file reads. Processing/download/deletion still require local paths. |
| 44 | Migration plan identifies gaps | VERIFIED by source/document comparison | Section 8 and existing AWS guide identify missing adapters, durable jobs, identity and storage changes. No cloud integration tested. |

Additional frontend acceptance checks:

| Area | Implementation evidence | Execution/verification status |
| --- | --- | --- |
| Authentication screen, protected navigation, logout/session restore | LoginPage, AuthContext, AppLayout and routes use real authentication; no automatic shared demo account | API verified; browser interaction BLOCKED |
| Loading/empty/error/processing states | Source inspected for Dashboard, Documents, Upload, Details, Q&A, Processing, Activity and original preview; activity/processing failures repaired | B/L pass; actual rendered behavior BLOCKED |
| Single and multi-select upload, result navigation, mixed failures, UI retry/delete | UploadPage and documentService; batch UI sends individual requests; progress indicates request acceptance, not streamed byte progress | API contracts verified; interactive flows BLOCKED |
| Live counts/activity | Metrics derive from owned API records; repaired activity card polls every 3 seconds | API counts verified; live rendering BLOCKED |
| Preview, exports, scrolling, responsiveness, dark/light theme, console errors | Source implementation exists; persistent theme is implemented, planned account/cloud settings remain read-only | Visual/mobile/theme/console checks BLOCKED; earlier browser reports are historical evidence only |

## 3. Tests actually executed, commands and results

All commands below were executed locally. Ordinary shell execution initially failed before starting a process because the sandbox helper could not initialize. Inspection and test commands were then run through the approved elevated command runner; that infrastructure failure was not treated as an application test failure.

| Command / operation | Working directory | Observed result |
| --- | --- | --- |
| `node --version`; `npm --version` | repository root | v22.14.0; 10.9.2 |
| `npm ls --depth=0` | root and backend | Installed top-level dependencies listed successfully; no missing/invalid package reported. No vulnerability audit or fresh install performed. |
| `npm test` before edits | backend | 27 pass, 0 fail; includes backend TypeScript build |
| `node --test tests/final-audit-faults.cjs` before repairs | backend | 1 pass, 6 fail; failures retained, not discarded |
| `npm test` first repair run | backend | 34 pass, 1 fail: payment-method parsing regression from overly broad missing-value guard |
| `npm test` final backend run | backend | 35 pass, 0 fail; guard narrowed and payment assertion restored |
| `node tests/final-audit.cjs` initial run | backend | 16 pass, 0 fail; observed five duplicate retry acknowledgements/logs despite one actual job, leading to stricter fault assertion |
| `npm run audit:local` final run | backend | Build passes; 17 checks pass; 110 HTTP observations saved |
| `npm run evaluate` before and after final parser changes | backend | Both runs: 9/9 completion/classification, 72/72 fields, 2/2 items, 73/73 answers, 61/61 citations, 12/12 refusals |
| `npm run build` | root | Initial and final frontend production builds pass |
| `npm run lint` | root | Initial and final exit 0; 11 warnings, no errors |
| `node tests/final-audit-real.cjs <existing-local-pdf>` | backend | Two real PDFs rendered/extracted before and after fixes; 10 and 3 pages respectively, all native-text pages; source checksums unchanged. Private paths/content excluded from tracked results. |
| `node tests/final-audit-summarize.cjs` | backend | Produces sanitized durable evidence and source hashes |
| Browser discovery/open | browser connector | No enabled surfaces; in-app browser unavailable. No screenshot of the application or interactive-browser pass claimed. |
| Normal backend/proxy health after secret repair | root | Direct 5000 and frontend 5173 proxy return 200; only normal ports remain listening, audit ports stopped |
| `git diff --check`; tracked environment/data inventory and credential-pattern scan | root | Final whitespace check passes; runtime environment/data ignored; common credential patterns not found in tracked current files |

Inside A, the backend launches the installed npm CLI with `run dev:server` in `backend/`; this builds and runs `dist/server.js`. Vite launches as `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177 --strictPort`, with `PRASHN_API_TARGET=http://127.0.0.1:5057`. The backend restart uses `node dist/server.js`. Only audit-owned process trees are stopped. The normal development watcher was separately observed rebuilding/restarting after the secret repair.

Raw evidence locations, relative to repository root:

- `backend/.test-output/final-audit-npm-test.log`, `final-audit-faults-before.log`, `final-audit-npm-test-after.log`, `final-audit-npm-test-final.log` preserve initial, failing, intermediate and final outcomes.
- `backend/.test-output/final-audit-independent-final.log` and `final-audit-ysgzYv/evidence.json` preserve final API checks, fixture outputs, schema and database observations.
- `backend/.test-output/final-audit-faults-I8Q40O/observations.json` preserves the original six failures; `final-audit-faults-latest.json` identifies the repaired run.
- `backend/.test-output/final-audit-evaluate-final.log` and `evaluation/latest.json` preserve benchmark results, including actual fields/pages.
- `frontend-final-audit-build-final.log` and `frontend-final-audit-lint-final.log` preserve frontend checks.
- Real-document final runs: `backend/.test-output/final-audit-real-AisOJp/` and `final-audit-real-NISSN1/`. These contain private local renderings/output and must remain untracked.

These directories/logs are ignored and may not accompany a future clone. The tracked sanitized JSON and repeatable tests preserve the shareable evidence. The real-document script is read-only and accepts a local file path; no private invoice is embedded in a regression fixture.

## 4. API endpoint verification results

Requests used actual Express routes, largely through the running Vite proxy. Response shapes below were inspected directly or asserted in the executed tests; statuses for individual calls are preserved in the evidence JSON. All document/activity routes require a bearer token.

| Method | Endpoint | Observed outcome |
| --- | --- | --- |
| GET | `/api/health` | 200 `{status, environment, processingMode, qaMode, workspace, extractionVersion}` |
| POST | `/api/auth/register` | 201 `{message}`; normalized/parallel duplicate 409; invalid data 400 |
| POST | `/api/auth/login` | 200 `{token,user}`; bad password 401; malformed JSON 400 |
| GET | `/api/auth/me` | 200 correct `{user}` without password hash; invalid/missing/expired token 401 |
| POST | `/api/auth/logout` | 200 acknowledgement, including anonymous request; same JWT remains valid afterward |
| GET | `/api/documents` | 200 owned `{documents}`; second account receives empty list; missing/invalid token 401 |
| GET | `/api/documents/metrics` | 200 `{metrics}` agrees with actual owned records, terminal statuses and stored original byte totals; second account total 0 |
| GET | `/api/documents/:id` | 200 persisted `{document}` with fields/pages; cross-user/missing record 404 |
| GET | `/api/documents/:id/file` | 200 byte-identical original, correct MIME, `nosniff`, private/no-store caching; cross-user 404 |
| POST | `/api/documents/upload` | 201 queued `{document}`; no file 400, unsupported MIME 415, oversized file 413; corrupt/empty/spoofed PDF accepted then Failed during processing |
| POST | `/api/documents/upload-multiple` | 201 distinct `{documents}` for mixed five-file batch; 21-file request 400 |
| DELETE | `/api/documents/:id` | 200 `{success,message}` with verified cleanup; cross-user/missing 404; injected cleanup failure 500 with record/original retained after repair |
| GET | `/api/documents/:id/questions` | 200 persisted `{conversation}`; cross-user 404 |
| POST | `/api/documents/:id/questions` | 201 `{message}` with owned document evidence/citations; invalid question 400, unfinished/failed document 409, cross-user 404 |
| DELETE | `/api/documents/:id/questions` | 200 `{success}`, persisted history becomes empty; cross-user 404 |
| POST | `/api/documents/:id/retry` | 200 for accepted failed/completed job; active/concurrent duplicate 409; cross-user 404; subsequent terminal status inspected |
| GET | `/api/activity` | 200 owned `{events}`; second account empty; protected-route invalid/missing tokens 401 |

No real optional-model service was invoked. Its 503 provider-error path exists in source but was not verified against an installed model. `GET /api/health` is a process health response, not a comprehensive disk/database/provider readiness probe.

### Browser follow-up after authorization - 9 October 2026

Browser verification was retried after the user authorized proceeding with Brave. Refreshed browser-control inventory returned `{"apps":[],"browsers":[]}`. An explicit attempt to open `http://localhost:5173` with browser ID `brave` returned `Browser is not available: brave`. This establishes that Brave is not exposed to this session's browser-control tools; it does not establish that Prashn is incompatible with Brave. No UI interaction or visual check ran, so browser acceptance remains BLOCKED and the verdict is unchanged.

## 5. Authentication and user isolation

Registration normalizes email and stores a unique account with bcrypt cost 10. Concurrent duplicate registration originally leaked an internal failure as 500; the unique-constraint race now maps to 409. Login checks the real hash, signs a JWT with configured expiry (default seven days), and does not expose stored password hashes.

All tested owner-sensitive operations check the authenticated user before accessing a document. The two-account negative matrix includes details, originals, history reads, question submission, conversation clearing, retry and deletion. Unauthorized document access consistently returns 404; A's document remains after B's deletion attempt. List, metrics and activity remain scoped to the requesting account.

The known development fallback secret was a serious security defect. The backend now refuses a missing/blank secret in every environment; F verifies both development and production startup rejection. This is distinct from enforcing secret strength: arbitrary weak nonblank values are still accepted. Local configuration was repaired with a generated private secret, kept in the ignored environment file.

Logout is deliberately client-side token removal. The API acknowledgement does not revoke JWTs: a previously issued token still passes `/auth/me` after logout. That documented behavior was verified; logout-click/local-storage/session-restore behavior is IMPLEMENTED but browser verification is BLOCKED. Password recovery, MFA, server token revocation and request rate limiting are NOT IMPLEMENTED. Cognito issuer/audience/token-use validation is future work.

## 6. Upload, processing, extraction, classification and Q&A

### Independent controlled inputs

| Fixture | Expected/observed values |
| --- | --- |
| Mixed-case/values-first invoice A | Juniper Systems, invoice `AUD-A-391`, USD 517.25 total, USD 500.00 subtotal, USD 17.25 tax, different invoice/due dates; all asserted |
| Reordered invoice B | Harbor Engineering, invoice `AUD-B-852`, EUR 943.60 total; must not return A's vendor or USD total |
| Receipt | Saffron Corner, INR 89.50 total, separate tax/cash/change values; Receipt classification |
| Form | Morgan Example, DOB 1997-04-23, address/signature; Form classification and source values |
| Unknown field note | Tracking code/storage condition; Unknown classification, no invented invoice financial fields |
| Corrupt/zero-byte/spoofed PDFs and unsupported text | Failed processing or 415 according to policy; never false Completed |
| Six concurrent invoices | Six different vendors, identifiers and USD totals 20.00 through 25.00; no data mixing |
| Existing benchmark | Columns, repeated pages, INR/EUR/GBP/USD, receipts/forms/contracts/unknown, English scans, rotated scans and mixed native/OCR pages |

Actual processing stores `Uploaded -> Queued -> Processing -> Classifying -> Extracting information -> Completed`, or Failed with a reason. A checks recorded lifecycle events and terminal records. Complete text is saved separately, page text and field/item provenance are stored in SQLite, and original bytes receive a SHA-256 checksum. OCR exists locally; scanned-PDF support is not merely a future promise.

Retries of unchanged corrupt bytes correctly fail again. The failed-to-successful retry test deliberately replaces only its disposable stored source with a known valid PDF, then invokes the real retry endpoint. This intervention demonstrates recovery after source repair; it is not an automatic PDF-repair capability. Completed retries retain history and replace current extraction results. Historical answers are not regenerated.

Restart recovery was exercised by stopping the audit backend, marking one isolated stored record Processing, and starting a new backend process. It recovered to Completed; existing conversation counts survived the restart. This tests restart recovery of persisted work, not an abrupt mid-OCR crash or distributed queue delivery.

### Real-source review and limits

The ten-page existing PDF is a browser-printed invoice-template page, not an issued transaction. Its first page visibly contains an invoice identifier, company heading, USD currency, subtotal/total of $1,800.00 and zero tax. Those selected values match final extraction; `[date]` is a blank placeholder and now produces a refusal. The original parser incorrectly treated the adjacent invoice identifier as Bill To, customer-column text as field labels for date placeholders, and URL footers as `https` fields. Final extraction removes these false associations; it does not recover the unlabeled customer block. All ten pages returned text, but only the invoice-bearing first page was visually graded.

The three-page existing ride/tax invoice was rendered and inspected in full. Selected invoice identifiers, dates, customer field, payment method/amount, overall total and component fee/tax values match the visible source and page provenance. Personal names, addresses, identifiers and private document bytes are intentionally omitted from tracked audit output. A vendor question refuses despite an unlabeled company heading on page 3; the heading is not converted into a seller field. Separate CGST/SGST components are preserved, but there is no verified general aggregation of “total tax” across heterogeneous page sections. Those misses are limitations, not successful extraction claims.

The benchmark measures expected-field correctness/recall, not the precision of every extra generic field or arbitrary-document accuracy. Clear English scans and rotations passed; handwriting, non-English OCR, low-resolution/noisy real scans, complex overlapping tables, encrypted inputs, provider timeouts and memory exhaustion were not independently graded. Classification and confidence remain heuristic. Evidence provenance proves where a value came from; it does not by itself prove that every semantic label or optional model answer is correct.

## 7. Bugs, security/reliability findings and changes

| Finding | Original executed observation / evidence | Repair and final evidence |
| --- | --- | --- |
| D1 - Known JWT fallback (high) | F: missing-secret development configuration exits 0; S: `fallback_secret` used | `config/env.ts` requires a nonblank secret in all modes; F exits nonzero in development/production; local ignored environment repaired |
| D2 - Registration race | F: simultaneous duplicate email returns `[201,500,500,500,500]` | `auth.controller.ts` maps authoritative email-unique constraint to 409; F final one 201/four 409 |
| D3 - Duplicate retry acknowledgements/activity | A/F: five 200 acknowledgements and five retry events for one job | Processor returns whether enqueue was accepted; controller logs only an accepted retry and otherwise returns 409; A/F one job/event |
| D4 - Empty vendor consumes Notes | F: `Vendor:` followed by `Notes: Deliver tomorrow` becomes a seller value | `field_extractor.ts` refuses unrelated labelled next rows while preserving payment-method/amount pairs; F checks actual upload/Q&A refusal |
| D5 - Inaccessible upload after DB-create failure | F injected repository failure: 500, stored originals increase from 1 to 2 | Controller compensates metadata-create failure with storage deletion; F original count unchanged. Same helper used for single and batch creates |
| D6 - Deletion strands extracted text | F injected processed-text cleanup failure: 500, original and DB row already gone, text remains | Cleanup happens before metadata removal; F injected early failure retains record/original/text so delete can be retried |
| D7 - Template columns/placeholders/URL fields | P: false customer/date association and URL footer fields; blank date yields passages rather than refusal | Parser ignores ambiguous right-hand labelled columns, standalone placeholders and URL-as-label artefacts; Q&A filters tested placeholder passages. F regression and final P confirm corrected output |
| D8 - Frontend silent failures and stale activity | S: Processing/Activity only log fetch errors; dashboard activity promise lacks a catch and loads once | Existing views show request-error alerts; Processing handles retry errors; dashboard activity handles loading/empty/error and polls. Card label changed from cloud activity to activity. B/L pass; visual behavior BLOCKED |

An intermediate D4 guard was too broad and broke a valid `You Paid Using` / `Cash + amount` layout. The failing 34/35 run is retained. The guard was narrowed to preserve that pair, an explicit regression assertion was added, and final R/F/E pass. No failed check was reclassified as a success without rerunning it.

New reusable audit/fault/real-review/evidence scripts were added; the fault suite joins normal `npm test`, and `npm run audit:local` runs the isolated acceptance audit. Existing tests now create random test signing secrets rather than rely on a developer's environment. UI structure, CSS, layout components, storage/repository approach and local processing architecture were preserved.

Remaining security/reliability limitations from source inspection:

- **Not production-hardened:** no rate limiting, malware/content-signature scan, session revocation, HTTPS setup or complete credential-history/dependency vulnerability review. JWT shape/explicit algorithm restrictions can be tightened before identity migration. No current endpoint SQL-injection route was identified: values are parameterized; dynamic update column names come from internal document properties, not raw request input.
- **Filesystem assumptions:** generated storage keys prevent a user filename from selecting an arbitrary directory. Storage methods themselves do not enforce key containment against a malicious internal/storage reference. Public API download access is owner checked. A hostile stored-key or symlink scenario was not tested.
- **Non-atomic storage/database operations:** upload compensation can itself fail and is only console-logged; copy/unlink failures and later activity/trigger failures do not have a persisted reconciliation mechanism. Batch operations are intentionally non-atomic. Delete failures after text cleanup or after original deletion can leave a retained record with missing assets; a subsequent delete can remove that record, but rollback/reconciliation is not implemented. D6 verifies only the injected early text-cleanup failure and normal deletion, not all partial failure orders.
- **Queue limits:** worker concurrency is bounded, but the pending in-memory array has no capacity limit. The older phrase “bounded queue” should not be interpreted as bounded admission. Duplicate suppression is process-local; no persisted generation/lease or multi-instance lock exists. No load/soak or multiple-server test was run.
- **Persistence constraints:** users have unique email; document/user and message/document foreign keys exist; a trigger deletes document questions. Message `userId` has no user foreign key or owner-matching composite constraint; status/type fields lack CHECK constraints; no general versioned migration framework exists. API ownership checks are the current isolation boundary. SQLite integrity check returned `ok`, with no foreign-key violations in the audit database.
- **Logs/errors:** controller responses generally hide internal 500 details; application logging uses console and owner-scoped activity records. Processing stores raw error messages as failure reasons, which can expose internal path/provider details to the owner. No centralized redaction/retention logger exists. Activity retains document names after deletion; that is the observed audit-history policy.
- **Activity ordering:** repository results sort only by SQLite `createdAt`, whose default precision is one second. Events sharing that timestamp have no explicit tie-breaker, so their displayed order is not guaranteed; event presence/ownership was tested, exact display ordering was not. Prefer the full event timestamp plus a stable tie-breaker.
- **Client resilience:** several screens poll without cancellation/overlap protection; some dashboard/list action promises still lack dedicated catches. New visible error states have passed build/lint only. The unchanged 11 React warnings and all browser acceptance gaps remain documented.
- **Optional model:** its contract test mocks responses and checks quote/page validity. Valid quotations alone do not establish semantic entailment of arbitrary generated answers. A real optional-model installation and stronger grounding validation are not accepted by this report.

## 8. AWS migration readiness

The application is a useful local baseline with identifiable boundaries, but replacing providers by configuration alone will not work. The existing [AWS guide](aws-architecture.md) correctly describes proposed work, not installed integrations.

| Future replacement | Actual inspected boundary | Readiness / required work |
| --- | --- | --- |
| Local storage -> S3 | `StorageProvider`/factory are used for original save/get/delete | Partial. `saveFile` requires a temp path; `getFileUrl` promises a string used as a local path. Downloads call `res.sendFile(path.resolve(...))`; processing reads/hashes filesystem paths. Add byte/stream/object access and authenticated download handling; move processed-text writes/deletes behind storage too. |
| SQLite -> DynamoDB | Controllers/processor directly instantiate concrete document, user, question and activity repositories using `getDb()` | Repository interfaces/factory/injection NOT IMPLEMENTED. Define owned query/update/history/atomic-pair contracts, conditional updates, deletion policy and migration of local identities. Keep large page/full-text payloads in object storage, with metadata references. |
| Local trigger -> SQS/Lambda | Concrete singleton processor; in-memory queue/pending/active/cancelled collections; startup recovery from SQLite statuses | Queue interface and cloud worker adapter NOT IMPLEMENTED. Persist job/generation/source version; handle duplicate/out-of-order events, retries, cancellation, visibility/dead-letter policy and late completion after deletion. Process-local deduplication is insufficient. |
| Local extractor -> Textract | `DocumentExtractor` exists, but requires a path; processor explicitly constructs `LocalExtractor` | Adapter selection/injection NOT IMPLEMENTED. Preserve page numbers, complete text, OCR method, provenance and fields/items through a portable input/output contract; independently grade Textract results. `classificationMode` is also not wired to provider selection. |
| Local auth -> Cognito | `requireAuth` is an identifiable middleware boundary; local register/login sign HMAC JWTs | Cognito adapter NOT IMPLEMENTED. Validate the appropriate issuer/client/token type/signature/expiry and map existing owner identities; replace account flows without weakening owner checks. |
| Local logs -> CloudWatch | Console logging plus SQLite account activity events | Structured application logger/redaction/metrics adapter NOT IMPLEMENTED. Keep user activity distinct from operational logs; add correlation/job IDs and avoid private text/secrets in telemetry. |

**Q&A is already free of direct local file reads:** controller/answerers use persisted pages/fields. Its future portability depends on how repositories hydrate that page content; those pages currently live as JSON inside SQLite. There is no current Q&A dependency on `storage/processed/:id.txt`, unlike the processing/deletion path.

`DATABASE_MODE`, `PROCESSING_MODE` and `CLASSIFICATION_MODE` are configuration properties without complete replaceable factories in the inspected code. Only local storage mode is implemented; unsupported storage mode throws. Defining an interface is not evidence that every caller uses a portable contract.

Recommended migration gate: finish the outstanding browser acceptance, explicitly accept supported extraction limits, then implement/test portable storage and repository contracts before wiring queue/extraction/identity replacements. Create no production rollout based solely on these local fixture passes. Backup restoration, migration import, cloud permissions, deployment, cloud logs and distributed idempotency were not executed here.

## 9. Prioritized remaining work

| Priority | Work | Acceptance evidence needed |
| --- | --- | --- |
| P1 | Complete current browser/device acceptance | Registration/login/logout, token expiry, single/batch UI upload, loading/empty/error/status states, preview, Q&A/history/scroll, retry/delete, navigation, mobile and theme verified on the final source. Include backend interruption and failed action feedback. |
| P1 | Make partial persistence failures recoverable | Fault injection for failed copy/unlink, compensation failure, DB delete failure, activity failure and interrupted batch; no inaccessible orphan, misleading accepted-job status or irrecoverable deletion. |
| P1 | Establish portable storage/repositories/queue contracts before AWS replacement | All processing, hash, original-download and processed-text access through adapters; conditional generation updates and duplicate/deletion tests across workers; migration/backup-restore verification. |
| P1 before public hosting | Complete authentication/resource/security controls | Rate limits, strong secret policy, token/session strategy, content validation, resource budgets, error redaction and appropriate transport/operations checks. |
| P2 | Improve extraction coverage and unsupported-layout handling | Held-out realistic/anonymized layouts, unlabeled parties, multiple totals, component-tax questions, sparse/noisy scans; grade both missing and extra fields, semantic answers and citations. Preserve safe refusals. |
| P2 | Improve frontend polling/action errors and fix lint warnings | No overlapping stale state updates; failed delete/retry/download surfaces consistent feedback; browser checks and clean relevant lint outcomes. |
| P2 | Review optional-model correctness before enabling it | Installed-provider tests with adversarial documents and semantically contradictory answers despite valid quotations. |
| P2 | Reproduce clean setup and restore | Fresh dependency installation, explicit environment setup, independent schema upgrade and consistent database/storage backup restoration. |

D1-D7's exercised regressions are resolved in the audited checkout; the D8 UI changes compile but require browser review. No remaining critical defect was established in the exercised default local paths. That is narrower than a completed production security review.

## 10. Final verdict

**PASS WITH LIMITATIONS** for the independently exercised local MVP API and processing baseline. Authentication/isolation, uploads, native extraction/OCR, supported fields, grounded supported Q&A, history, failure handling, retry, concurrent distinct uploads, normal deletion and restart recovery have current evidence.

**Full frontend visual/interactive acceptance remains BLOCKED.** Real-document extraction misses, non-atomic failure recovery and process-local queue/security limits remain explicit. The project is not declared fully complete or AWS-deployment-ready by this report. The next acceptance steps are the P1 items above; future adapters need their own tests rather than inheriting these local results.
