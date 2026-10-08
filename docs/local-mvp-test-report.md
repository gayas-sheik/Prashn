# Local application validation

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

All fifteen automated cases passed. Backend build, frontend production build, and the backend development command also passed. Lint exits successfully with React advisory warnings concerning effect state updates, context exports and event-handler purity; it is not warning-free.

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

The latest column-field changes were verified with anonymous generated fixtures. They were not reapplied to the stored private invoice before the pause, and the running static backend was not restarted for this final build. Existing records need Reprocess after the latest backend is launched. No model or AWS service was installed or deployed.
