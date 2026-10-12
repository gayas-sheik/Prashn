# Cloud browser verification — 12 October 2026

**Verdict: FAIL for full browser acceptance.** Core ingestion, extraction, OCR, document-grounded questions, history, and downloads passed the executed checks. Search, PDF page navigation, cloud-facing labels, and audit metric presentation have defects. This report does not supersede the earlier API acceptance or claim production readiness.

The later [local fix report](browser-fixes-test-report.md) records corrections and local verification before deployment. Those local results do not change this historical cloud verdict.

## Environment and scope

- Website: `https://d1ew9wh9ondbo.cloudfront.net/`.
- Browser: connected Google Chrome, desktop viewport and a temporary 390 × 844 viewport. Viewport overrides were reset afterward.
- Public health returned HTTP 200 with release `d70169849bc05702c222a3fa97890413ef97a953`, production, S3, DynamoDB, SQS, and extractive Q&A. The ALB API target was inspected as healthy.
- The owner supplied a GitHub screenshot showing approved delivery #8 successful for `d701698`, including checks, delivery, and cleanup, in 17 minutes 21 seconds. Its artifact contents were not independently downloaded in this browser pass. Subsequent live health independently matched that source revision.
- The owner completed test-account sign-in directly in Chrome. Credentials were not collected or stored in this report.
- Both fleets began at min/max/desired/current zero. Existing fleets were resumed at min 1, max 2, desired 1. Account plan was ACTIVE with reported credits of USD 135.80 before resume. Credits are an estimate, not a spending cap.
- Initial browser/API 502/503 errors occurred during fresh-instance bootstrap. Subsequent public health and sign-in succeeded. EC2 InService/Healthy preceded actual application readiness.
- Fixtures were reconstructed from the repository's existing `infra/verify_deployment.py` fixtures and committed OCR payloads. All uploaded document contents are fictional.
- No application source, infrastructure template, IAM permissions, or existing customer documents were modified.

## Executed checks

| Check | Result | Observed evidence |
| --- | --- | --- |
| Sign-in and empty dashboard | PASS | Owner sign-in reached dashboard with zero documents and no activity. |
| Empty login validation | PASS | Browser displayed required-field validation. |
| Invalid email validation | PASS | `invalid-email` was rejected with an email-format message. |
| Incorrect credentials | PASS | Nonexistent synthetic account returned `Invalid credentials`; no authenticated navigation. |
| Logout and protected route | PASS | Sign-out returned `/login`; opening the known inspection URL while signed out redirected to `/login`. This does not test server-side token revocation. |
| Unsupported file | PASS | Synthetic `.txt` selection displayed `Choose PDF, PNG or JPEG` and disabled upload. |
| Oversized file | PASS | PDF of 10 MiB plus 9 bytes displayed `File exceeds 10 MB` and disabled upload. Exact-limit acceptance and a 20-file batch were not tested. |
| Single native PDF | PASS | Two-page invoice uploaded, showed real upload progress, completed, and automatically opened inspection. |
| Native extraction | PASS | Vendor Audit Northwind Supplies; invoice AUD-A; subtotal USD 100.00 on page 1; tax USD 10.00 and total USD 110.00 on page 2. |
| Preserved full text | PASS | Full Text displayed both native PDF pages, including the warranty sentence; PNG text displayed OCR provenance and the warranty sentence. |
| Mixed batch | PASS | Eight files uploaded together. Seven readable files completed; corrupt PDF failed as expected. Results remained inline and displayed recognized values. |
| Classification | PASS | Invoice, Receipt, Form, and Unknown fixtures displayed their expected categories. |
| PNG, JPEG, scanned PDF OCR | PASS | Each completed with Clear Scan Technologies, SCAN-123, total USD 110.00, subtotal USD 100.00, and tax USD 10.00. |
| Original previews | PASS | Native PDF page 1 and PNG image rendered visibly. Outer PDF page navigation failed separately below. |
| Amount Q&A | PASS | Invoice A answered USD 110.00 with page 2 total citation and source passage. |
| Passage Q&A | PASS | Warranty answer used the exact manufacturing-defects passage, citing page 2. |
| Missing evidence | PASS | Passport-number question returned `I couldn't find that information in this document.` without a citation. |
| Document-specific Q&A/history | PASS | Invoice B began with zero messages and answered USD 275.50 with page 1 citation; invoice A's USD 110.00 was not mixed into its answer. This is within one account, not a two-user isolation test. |
| History after reload | PASS | Invoice A retained all six messages, source citations, and original timestamps after a full page reload. |
| Transcript export | PASS | Browser export produced a local text file containing all three question/answer pairs. The automation download event timed out, but the specific resulting file was located and read. Citation metadata is not included in the text export. |
| PNG original download | PASS | Downloaded `scan.png` SHA-256 exactly matched the fixture: `51ffef073200267eee3b1f45ba927a5836122e7010d1052b291ba6977701ff03`. |
| PDF original download | PASS | Downloaded `invoice-a.pdf` SHA-256 exactly matched the fixture: `5b203de58bd12ab96564af166bdd1a289ea56f5e281f7223a1f11cdf1374b48d`. |
| Inspection JSON | PARTIAL | Raw OCR JSON rendered valid document data. Export JSON displayed `Copied JSON`, but the browser automation clipboard returned empty text, so copied payload delivery was not verified. |
| Valid reprocessing | PASS | PNG reprocess completed in generation 2, retaining its original hash, page count, and expected total. |
| Corrupt PDF retry | PASS | Retry returned another readable Failed result. Activity displayed Retry Initiated → Processing → Failed. |
| Failed-document questions | PASS | Failure reason displayed; suggested question and Send controls were disabled. |
| List counts and failed filter | PASS | Nine records, eight Completed, one Failed, zero Processing/Queued; Failed filter selected only corrupt.pdf. |
| Filename search | PASS | `invoice-b` selected the expected single document. |
| Vendor/invoice-number search | FAIL | `Contoso` and `AUD-B` each returned no matches despite those values being visible in invoice B. |
| Mobile upload and Q&A | PASS | At 390 × 844, upload and Q&A rendered without page-level horizontal overflow. The Q&A viewport reported innerWidth 390 and document scrollWidth 385. |
| Mobile navigation | PASS | Drawer opened, listed navigation links, and navigation to Activity closed it and loaded the page. |
| Activity records | PASS | Account activity contained the actual uploads, processing transitions, completion, corrupt failure, and retry events. |
| PDF outer page selector | FAIL | Outer selector and iframe URL changed to page 2, while embedded Chrome PDF viewer remained at 1/2 and showed invoice page 1. Confirmed in repeated screenshots. |
| Cloud-facing labels | FAIL | Sidebar/header say LOCAL/Local Workspace/Local processing; upload says originals stored locally; Q&A says Local storage. Actual API and integrity display report AWS services/S3. |
| Audit metrics | FAIL | Avg Processing Latency is hardcoded `< 1s`; DLQ count is failed/warning activity count rather than measured SQS DLQ items; “Ingestion Success” includes non-failed processing events. Observed 96% and two DLQ-labelled items after eight completed documents, one failed document, and one failed retry. |

## Defects and relevant source

1. **Search omits advertised fields.** `src/pages/Documents/DocumentsPage.tsx` filters name, ID, uploaderName, and type only. Extend the predicate to the available extracted fields and document text, or narrow the search promise. Verify both `Contoso` and `AUD-B` on the next release.
2. **PDF outer controls do not move the native viewer.** `src/components/documents/OriginalDocumentPreview.tsx` changes the fragment of an existing blob-backed iframe. The observed Chrome viewer did not react. An iframe remount on page/zoom changes is a candidate correction; verify the rendered page contents, not only the outer label or URL.
3. **Cloud UI still presents local-only copy.** Sidebar, header, upload, and Q&A text need to reflect the deployed operating mode.
4. **Audit cards claim measurements they do not compute.** `src/pages/Activity/ActivityPage.tsx` hardcodes latency, counts failures as DLQ items, and derives ingestion success from all event statuses. Replace those claims with actual metrics or accurate descriptions of the available event data. The DLQ was not independently measured during this browser pass.

## Local screenshots

Screenshots are retained under ignored `.aws-build/browser-report-2026-10-12/`, rather than committed as private runtime artifacts. Key evidence:

- [Native fields and original](../.aws-build/browser-report-2026-10-12/invoice-fields.jpg)
- [Grounded Q&A and refusal](../.aws-build/browser-report-2026-10-12/qa-grounding.jpg)
- [Mixed batch results](../.aws-build/browser-report-2026-10-12/batch-results.jpg)
- [OCR image inspection](../.aws-build/browser-report-2026-10-12/ocr-image.jpg)
- [PDF page navigation mismatch](../.aws-build/browser-report-2026-10-12/pdf-page-navigation-mismatch.jpg)
- [Vendor search failure](../.aws-build/browser-report-2026-10-12/vendor-search-failure.jpg)
- [Mobile upload](../.aws-build/browser-report-2026-10-12/upload-mobile.jpg)
- [Mobile Q&A](../.aws-build/browser-report-2026-10-12/qa-mobile.jpg)
- [Audit cards](../.aws-build/browser-report-2026-10-12/activity-metrics.jpg)

## Retained test records and limits

Nine synthetic document records remain in the test account for review:

| File | Document ID |
| --- | --- |
| invoice-a.pdf | DOC-87b04aa3-a97e-4f16-a979-5067dd7de038 |
| invoice-b.pdf | DOC-2bda98fe-80c5-4f1d-ad62-48c4d37d8b02 |
| receipt.pdf | DOC-17311135-a707-481b-9205-6dd00a41a880 |
| form.pdf | DOC-96421719-3e5f-4ede-b035-a2a6c55d9f4f |
| unknown.pdf | DOC-281c44d6-c81b-42ca-87d8-a45d2cf590a9 |
| scan.png | DOC-203078d8-be18-4afd-b396-9c142ded32ee |
| scan.jpg | DOC-a79b6f68-0797-44cc-8828-5a4583e916a8 |
| scan.pdf | DOC-f4d9e166-851d-4d65-8df2-1f846b848d57 |
| corrupt.pdf | DOC-f59e09aa-9edf-488d-b0f2-38c3441887bd |

Deletion, conversation clearing, a second-user browser session, a long-history stress case, arbitrary real documents, poor scans/handwriting, settings persistence, automatic scaling, backup restore, provider outages, and document/history persistence across a subsequent compute pause/resume were not exercised. No claims of success are made for those areas.

Chrome file upload initially required the owner to enable extension file-URL access; it succeeded afterward. Browser policy blocked navigation to Chrome's internal Downloads page. Specific generated download files were verified through local artifact reads instead; no privileged browser page or browser metadata was accessed through a workaround.

## Final compute state

After browser requests completed, the existing `python3 infra/cd_release.py pause --account 683146427271` helper completed in the owner's IAM CloudShell. Inspected output: `[VERIFIED] Final demo-only cleanup: Both stack ASGs min/max/desired/current = 0; API deliberately unavailable.` The shell returned to its prompt. [Cleanup screenshot](../.aws-build/browser-report-2026-10-12/final-pause.jpg) is retained locally.

The test account's nine synthetic documents and conversations remain for review. The browser was signed out and temporary viewport overrides were reset. Login/upload/Q&A are intentionally unavailable while compute is paused; retained ALB/storage/logs and the separate original server are not covered by this pause.
