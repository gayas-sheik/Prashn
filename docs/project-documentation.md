# Prashn application documentation

**Purpose:** document processing and document-grounded question answering.

**Implementation described:** React frontend, Express backend, SQLite, filesystem storage, PDF.js and Tesseract.js.

**Documentation date:** 9 October 2026.

Prashn accepts supported document files, extracts their text and recognizable structured information, and answers supported questions with source citations. Processing takes place on the machine running the backend. The standard setup is local. Optional AWS hosting and integration are described separately in the [deployment guide](aws-architecture.md); they are not current application features or prerequisites.

## Contents

- [Purpose and supported documents](#purpose-and-supported-documents)
- [Features and application screens](#features-and-application-screens)
- [Architecture and repository](#architecture-and-repository)
- [Installation and running](#installation-and-running)
- [Processing and extraction](#processing-and-extraction)
- [Question answering](#question-answering)
- [Accounts and access](#accounts-and-access)
- [Data storage and maintenance](#data-storage-and-maintenance)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Testing and validation](#testing-and-validation)
- [Troubleshooting](#troubleshooting)
- [Limitations and future work](#limitations-and-future-work)
- [Optional AWS deployment](#optional-aws-deployment)

## Purpose and supported documents

Users can upload invoices, receipts, application forms, IDs and other semi-structured files as PDF, PNG or JPEG. The application preserves the original and complete text so that recognized fields do not become the only available evidence.

| Document content | Implemented behavior | Boundary |
| --- | --- | --- |
| Invoices | Supported identifiers, parties, dates, amounts, payment labels and item tables | Layout and label recognition are heuristic |
| Receipts | Supported receipt identifiers, dates, store and payment/amount fields | Unfamiliar layouts may lose structured fields |
| Application forms | Names, date of birth, contact information and explicit fields | No universal form schema or form-submission workflow |
| Contracts / agreements | Text, explicit fields and matching passages | No legal interpretation or document approval workflow |
| IDs | Text/OCR and supported explicit fields | No dedicated ID classifier, identity verification or MRZ/barcode decoding |
| Other readable documents | Full text and supported explicit key/value fields | Classification may be Unknown or another heuristic category |

The classifier's categories are `Invoice`, `Receipt`, `Form`, `Contract` and `Unknown`. An ID is not guaranteed a particular category. A file can contain multiple document entries, and recognized repeated values remain associated with their pages. Classification does not establish authenticity or accuracy.

### Accepted files and limits

| Constraint | Default |
| --- | --- |
| Accepted MIME types | `application/pdf`, `image/png`, `image/jpeg` |
| Maximum file size | 10 MiB: `10 * 1024 * 1024` bytes |
| Maximum selected files / batch API files | 20 |
| Maximum PDF pages | 100; configured with `MAX_DOCUMENT_PAGES` |
| OCR language | English; additional local trained data must be supplied for other languages |
| Maximum question length | 4,000 characters, with nonempty content |
| Processing concurrency | Two documents within one backend process |

DOCX, spreadsheets and other unsupported MIME types are rejected. File acceptance is not a guarantee that a document is readable: corrupt, protected and unreadable files can fail during processing. The frontend displays size limits as "10 MB" while the actual enforced size is 10 MiB.

## Features and application screens

| Screen | What it does |
| --- | --- |
| Login | Register an account or sign in; restore an existing valid session |
| Dashboard | Show actual document counts, processing states, storage totals and recent activity for the signed-in account |
| Upload | Select files, report upload errors, track processing and show results |
| Documents | Browse, filter and inspect owned documents; filtering/pagination are handled in the client |
| Document inspection | Preview/download the original; inspect fields, supported items, full text and extraction JSON; export results, reprocess or delete |
| Document Q&A | Ask questions, inspect source snippets/page citations, revisit history and export or clear a conversation |
| Processing queue | Inspect current document processing states |
| Activity | Review owned upload, processing, retry and deletion events |
| Settings | Change the theme; other unfinished settings are displayed as planned or read-only |

Only theme selection has implemented persistent preferences. Profile editing, password management, multi-device session management and external notifications are not completed features.

### Typical user workflow

1. Register and sign in.
2. Select **Single Document Quick Inspect** for one file, or **Batch Upload** for a selection.
3. Select supported files and choose **Upload / Retry Files**.
4. Wait for a processing result. Single-file success opens its inspection page automatically; multiple-file results remain on the upload page.
5. Compare extracted values with the original preview and Full Text. Use **View Full Results** or **Ask Questions** from a completed batch result.
6. Ask a question and inspect its citations. Use a page selector in the question when several pages contain similar values.
7. Use **Retry Processing** for a failed document or **Reprocess** to apply newer extraction logic to an existing document.

Upload-request retry and processing retry are different actions. A successful upload means the bytes were accepted, not that extraction succeeded. Retrying a corrupt PDF can correctly fail again until a readable source is uploaded. Removing a file from the upload selection does not delete an already accepted document.

The upload UI currently sends selected files through individual single-file requests and tracks each returned document. A separate multiple-file API endpoint also exists. Neither interface promises that a group of uploads is one atomic transaction.

## Architecture and repository

~~~mermaid
flowchart TD
    U[User] --> F[React frontend]
    F -->|HTTP /api with bearer token| A[Express API]
    A --> R[Repositories]
    R --> D[(SQLite)]
    A --> S[Storage provider]
    S --> O[(Original files)]
    A --> Q[Bounded processing queue]
    Q --> E[PDF layout extraction and OCR]
    E --> C[Classification and field extraction]
    C --> R
    E --> T[(Complete extracted text)]
    A --> N[Extractive question answerer]
    R --> N
    N -->|Answer with citations| A
~~~

Vite forwards `/api` requests to the backend during development and local preview. Controllers enforce request and ownership rules; repositories handle persistence; the processor orchestrates extraction and state changes. Storage and extraction concerns are separated, but alternative implementations still require code and validation.

| Location | Responsibility |
| --- | --- |
| `src/App.tsx` and `src/routes/AppRoutes.tsx` | Frontend entry and page routes |
| `src/context/` | Authentication and theme state |
| `src/services/api/` | Requests and API-to-UI data mapping |
| `src/pages/` and `src/components/` | Screens and reusable UI |
| `backend/src/server.ts` | Database initialization, pending-job recovery and server startup |
| `backend/src/app.ts` | Express configuration, health, routing and error handling |
| `backend/src/controllers/` and `backend/src/routes/` | API behavior |
| `backend/src/repositories/` and `backend/src/database/` | SQLite persistence and schema initialization |
| `backend/src/storage/` | Original-file storage |
| `backend/src/processing/processor.ts` | Queue, recovery, status updates and orchestration |
| `backend/src/processing/local.extractor.ts` | Native PDF extraction and OCR |
| `backend/src/processing/pdf.layout.ts` | Reconstruct visual text rows and significant gaps |
| `backend/src/processing/field_extractor.ts` | Fields, aliases, values, line items and provenance |
| `backend/src/processing/document.answerer.ts` | Document-grounded answers and source citations |
| `backend/src/processing/question.language.ts` | Bounded phrasing and follow-up resolution |
| `backend/tests/` | Regression tests and fictional fixture generators |

## Installation and running

### Prerequisites

Install Node.js and npm compatible with the locked packages. Node.js 22.14 was used in recorded verification. Installed Vite requires `^20.19.0 || >=22.12.0`, pdf-parse requires `>=20.16.0 <21 || >=22.3.0`, and sqlite3 requires `>=20.17.0`. Use `npm ci` to install the lockfile rather than selecting new package versions.

SQLite, bcrypt and canvas include native components. Install/build dependencies for the operating system and architecture that will run the backend; do not copy Windows `node_modules` to a Linux host. Native compilation tools may be needed if a suitable prebuilt package is unavailable.

The normal application and backend regression suite do not require Python. The optional evaluation generator requires Python with reportlab and Pillow and currently uses `C:/Windows/Fonts/arial.ttf`. The default OCR engine uses bundled English trained data. The application does not automatically install an inference model.

### Install a fresh checkout

~~~bash
git clone https://github.com/gayas-sheik/Prashn.git
cd Prashn
npm ci
cd backend
npm ci
~~~

The repository root means the directory containing the frontend `package.json`. Its folder name can differ. Create `backend/.env` from `backend/.env.example` only if an environment file does not already exist. Set a private random `JWT_SECRET` and leave `OLLAMA_MODEL=` empty for the default mode. Keep the environment file out of version control.

### Development

In a terminal inside `backend/`:

~~~bash
npm run dev
~~~

In another terminal inside the repository root:

~~~bash
npm run dev
~~~

The backend command rebuilds TypeScript and launches the compiled server, watching source changes. Open Vite's printed frontend URL, normally `http://localhost:5173`. The backend defaults to `http://localhost:5000`; `http://localhost:5000/api/health` should respond. Stop each server with `Ctrl+C`.

### Compiled builds and local preview

Backend, from `backend/`:

~~~bash
npm run build
npm start
~~~

Frontend, from the repository root:

~~~bash
npm run build
npm run preview
~~~

Vite preview is for inspecting a local build. It is not a complete production hosting configuration. For a hosted installation, serve the frontend build with an appropriate web server and route `/api` to the backend, or set `VITE_API_BASE_URL` before building.

Rebuild and restart a compiled backend after code changes. Existing document records keep their saved extraction until reprocessed. Both servers must use the same intended checkout. The health response includes the repository folder as `workspace` and an `extractionVersion` marker, currently `layout-fields-v2`; these help diagnose a mismatched backend, but health is not a comprehensive readiness test.

### Alternate ports

Set backend `PORT` in its environment. Set `PRASHN_API_TARGET` in the shell launching Vite, for example `http://localhost:5050`, so its proxy targets that backend. If browser requests are cross-origin, set `CORS_ORIGIN` to the actual frontend origin. Refer to the printed Vite URL rather than assuming an unavailable port was used. Session-specific test ports are not application defaults.

## Processing and extraction

### Processing states

The backend workflow normally progresses through:

~~~text
Uploaded -> Queued -> Processing -> Classifying -> Extracting information -> Completed
~~~

Errors produce `Failed` and a saved failure reason. `Ready` and `Uploading` are frontend staging/request states. Queue positions and transitions are not progress guarantees or extraction-accuracy estimates.

The queue limits concurrent work within one backend process. Startup recovers persisted pending document records and queues their stored originals again. This recovery does not provide distributed scheduling across multiple API servers. Reprocessing is accepted for `Completed` or `Failed` documents; requests for already active documents return a conflict.

### Text extraction

1. Read PDF text using page coordinates rather than PDF drawing order.
2. Reconstruct visual rows and preserve large vertical gaps as text boundaries.
3. Detect pages needing OCR, including low-text pages and some image pages with short selectable headers.
4. OCR images or rendered PDF pages with Tesseract.js.
5. For weak OCR, retry quarter-turn orientations on an expanded canvas and keep the more readable candidate.
6. Preserve complete text and each page's extraction method/provenance.

`OCR_MODE=always` forces OCR for PDF pages when automatic detection is insufficient. It can take longer and is not a promise of improved accuracy for every file. Existing extracted records must be reprocessed after changing the mode. English OCR, clear scans and machine-printed text are the normal validated path; handwriting and other languages need separate evaluation.

### Classification and structured information

The classifier scores keywords and returns one of the supported categories. Field extraction uses label aliases, explicit key/value pairs, column relationships and supported table patterns. Common fields include identifiers, dates, parties, contacts, addresses, totals, tax, discounts and payment details when printed in a recognizable form. Supported line items contain description, quantity, unit price and amount.

Repeated recognized fields remain present across pages, including identical values. Page references and verbatim snippets connect structured values to the source text. Multiline values are retained where the parser recognizes a continuation; significant gaps can stop a field from consuming a distant footer. The parser does not invent totals, currency or OCR corrections to fill missing information.

The document includes a SHA-256 checksum of its stored original. This helps compare bytes; it does not prove who created the document or whether its contents are true.

Confidence values have different conventions: field confidence is a heuristic fraction, classification confidence is displayed as a percentage, and OCR uses its engine's confidence score. These are not calibrated probabilities of correctness. Review results against the original.

## Question answering

The default answerer is extractive. It checks structured fields and line items and retrieves relevant passages from the preserved page text. It does not train a model, call an external inference endpoint or require a vector database in the default setup.

| Request | Behavior when supported evidence exists |
| --- | --- |
| Identifiers and parties | Return recognized invoice/receipt numbers, vendor, buyer or form fields |
| Costs and dates | Return recognized totals, subtotal, tax, invoice/due dates and payment fields |
| Items | Answer supported quantity, unit-price, amount, named-item and ordinal-item questions |
| Repeated information | List recognized matching values with their pages |
| Page selection | Restrict `on page 2` and similar explicit selectors to that page |
| Summary | List recognized fields/items or return bounded document excerpts |
| Passage questions | Return matching source passages, such as a printed warranty or delivery statement |

Examples include "How much do I owe?", "When is payment due?", "How much did the customer pay?", "What does one mouse cost?" and "What is the total on page 2?" when the relevant content is present and recognized.

### Follow-ups and refusal

"And on page 3?" can inherit the preceding question's requested attribute. A party follow-up such as "What is their phone number?" can use the preceding unambiguous, successfully cited party answer. Pronoun-based resolution requires a single cited source on one page; ambiguous or missing antecedents refuse. Saved user questions remain the original text, not the internally resolved wording.

Conversation history selects a page or party; it never supplies answer facts. A missing page, absent attribute, unknown product or unsupported request should return:

> I couldn't find that information in this document.

Refusals have no citations. The supported phrasing is bounded: arbitrary paraphrases, arithmetic, broad reasoning and multi-document conversations are not general capabilities. An invoice total does not establish payment; a tax rate is not a tax amount; an identifier is not a date. A warranty's scope alone does not establish its duration.

### Citations and readiness

A citation contains the original filename, page, section, supporting snippet and heuristic confidence. It indicates the source used by the engine, not independently verified truth. Important answers should be checked against both the snippet and original preview.

Questions require a `Completed` document with retained page content. An active document or legacy record lacking page text produces HTTP `409`; wait or reprocess before asking. The optional Ollama provider hook is dormant by default. It needs a separately configured running service/model and has only mocked provider-contract coverage in the recorded tests; it is not part of the validated default installation.

## Accounts and access

Registration requires a valid email, a nonempty full name of at most 100 characters, and a password of at least eight characters and at most 72 UTF-8 bytes. Email is normalized before storage. Passwords are hashed with bcrypt. Login returns a signed JWT and user information; protected APIs require a bearer token.

Document, original-file, conversation and activity requests are scoped to the authenticated owner. Unowned and missing documents return `404`. A role value exists in the user record, but the application does not implement a comprehensive administration or role-management interface.

The frontend keeps the token in browser local storage and restores a valid session with `/auth/me`. Invalid protected requests can clear the client session and redirect to login. Logout removes the client token; its endpoint acknowledges logout but does not revoke an already issued JWT on the server. Password recovery, MFA and multi-device revocation are unfinished.

The default processing pipeline has no configured remote OCR or inference provider. Uploaded documents are still stored on the backend host and may contain sensitive information. Access checks do not imply encryption at rest, malware scanning, a compliance certification or a completed production security review. A public installation needs HTTPS, private secrets, operational controls and additional security work.

## Data storage and maintenance

### Stored entities

| Entity | Contents |
| --- | --- |
| `users` | ID, normalized email, password hash, name, role and timestamps |
| `documents` | Owner, original filename/MIME/size, storage key, status/type, checksum, page count, summary, failure reason, fields, items and page text |
| `qa_messages` | Document and owner IDs, user/assistant text, timestamps and citations |
| `activity_events` | Owner, related document, actor, event, status, details and timestamps |

Fields, items, pages and citations are serialized as JSON in SQLite. The database uses WAL, foreign-key enforcement and a busy timeout. Startup creates tables and adds the page-content column to older document schemas. This is a lightweight startup migration, not a general database migration framework.

### Default locations

| Data | Path relative to `backend/` |
| --- | --- |
| Database | `data/development/prashn.db` |
| Original files | `storage/uploads/`, under generated storage keys |
| Complete extracted text | `storage/processed/[document-id].txt` |
| Isolated evaluation/test artifacts | `.test-output/` |

`DB_FILE`, `UPLOAD_DIR` and `PROCESSED_DIR` can override the locations. Relative paths resolve from `backend/`, not the shell's current directory. Temporary multipart files use the operating system's temporary directory before successful storage. Changing paths does not migrate old records or files automatically.

### Reprocessing, deletion and backup

Reprocessing uses the stored original and updates extraction results while retaining the conversation. Earlier answers remain historical messages; new questions use the current document record. There is no extraction-version history or automatic replay of past answers.

Deleting a document removes its original, metadata, extracted text and associated conversation. The deletion event remains in account activity. There is no document trash or restore workflow. Clearing a conversation removes its persisted messages but keeps the document.

Back up the database and original/processed storage together. Stop the backend for a consistent file-copy backup, or use a SQLite-aware database backup procedure and coordinate file storage. Do not assume copying only an active WAL database file is a complete backup. Verify restoration in a separate directory before replacing working data. Store backups and uploads outside version control.

## Configuration

Backend configuration loads `backend/.env`. Shell environment variables can also supply values. Frontend settings have different scope: `VITE_API_BASE_URL` is incorporated at build time, while `PRASHN_API_TARGET` configures the Vite development/preview proxy.

| Variable | Default / behavior |
| --- | --- |
| `PORT` | `5000` |
| `NODE_ENV` | `development`; production refuses startup without an explicit JWT secret |
| `JWT_SECRET` | Set a private random signing secret; never use a shared example value |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | `http://localhost:5173`; use the actual frontend origin |
| `DB_FILE` | `data/development/prashn.db` |
| `DATABASE_URL` | Legacy path alias used when `DB_FILE` is absent; not a managed SQL connection URL |
| `UPLOAD_DIR` | `storage/uploads` |
| `PROCESSED_DIR` | `storage/processed` |
| `PROCESSING_CONCURRENCY` | `2`; one backend process |
| `MAX_DOCUMENT_PAGES` | `100` |
| `OCR_LANGUAGE` | `eng` |
| `OCR_LANG_PATH` | Optional local trained-data directory |
| `OCR_MODE` | `auto`; `always` forces PDF OCR |
| `OLLAMA_MODEL` | Empty selects the default extractive answerer |
| `OLLAMA_URL` | `http://127.0.0.1:11434`; used only by the optional provider |
| `STORAGE_MODE` | `local`; other values are rejected |
| `DATABASE_MODE`, `PROCESSING_MODE`, `CLASSIFICATION_MODE` | Default to `local`; names alone do not implement alternate backends |
| `VITE_API_BASE_URL` | Frontend API base, otherwise `/api` |
| `PRASHN_API_TARGET` | Vite proxy target, otherwise `http://localhost:5000` |

Keep secrets in server-side configuration. Any `VITE_` value embedded in a frontend build can be visible to browser users and must not contain a secret. Changing a backend environment setting requires restarting the process; changing a frontend build-time setting requires rebuilding.

## API reference

All paths below have the `/api` prefix. Protected requests require `Authorization: Bearer <token>`. Query-string tokens are not accepted, including for original downloads. Requests and responses use JSON unless an upload is multipart or a file response returns original bytes.

### Accounts and health

| Method | Path | Auth | Request / successful response |
| --- | --- | --- | --- |
| GET | `/health` | No | Process health, environment, processing/Q&A mode, workspace and extraction marker |
| POST | `/auth/register` | No | `{email, password, fullName}`; `201` acknowledgement |
| POST | `/auth/login` | No | `{email, password}`; `200 {token, user}` |
| GET | `/auth/me` | Yes | `200 {user}` |
| POST | `/auth/logout` | No | `200` acknowledgement; client removes its token |

### Documents, conversations and activity

| Method | Path | Request / successful response |
| --- | --- | --- |
| GET | `/documents` | `200 {documents}` for the owner; current API returns the owned list without cursor pagination |
| GET | `/documents/metrics` | `200 {metrics}`: counts, original-byte totals, concurrency and configured limits/modes |
| POST | `/documents/upload` | Multipart `file`; `201 {document}` after acceptance/queueing |
| POST | `/documents/upload-multiple` | Multipart `files`, up to 20; `201 {documents}` |
| GET | `/documents/:id` | `200 {document}` |
| GET | `/documents/:id/file` | `200` original bytes with the original MIME type and private/no-store caching headers |
| POST | `/documents/:id/retry` | `200 {success, message}` acknowledgement; use GET to inspect the updated status |
| DELETE | `/documents/:id` | `200 {success, message}` after deletion |
| GET | `/documents/:id/questions` | `200 {conversation}` |
| POST | `/documents/:id/questions` | `{question}`; `201 {message}` containing the assistant answer and citations |
| DELETE | `/documents/:id/questions` | `200 {success}` after clearing history |
| GET | `/activity` | `200 {events}` for the authenticated owner |

All endpoints in the second table require authentication. A successful upload returns a queued record; poll the document endpoint until `Completed` or `Failed`. Original-file access requires the authorization header, so a bare browser link is not sufficient. The frontend fetches authenticated bytes and creates a temporary blob URL for its preview.

An assistant message contains `id`, `documentId`, `userId`, `sender`, `text`, `timestamp`, `createdAt` and `citations`. Each citation contains `id`, `source`, `page`, `section`, `snippet` and `confidence`. A document contains the persisted metadata plus optional `extractedFields`, `lineItems` and `pages`. Each page has `page`, `text`, `extractionMethod` and optional `confidence`.

Example question request, using placeholders for an actual document and token:

~~~http
POST /api/documents/DOC-EXAMPLE/questions HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"question":"What is the total on page 2?"}
~~~

### Error handling

| Status | Common cause |
| --- | --- |
| `400` | Missing file, invalid account/question input or multipart limits |
| `401` | Missing, invalid or expired authentication; invalid login credentials |
| `404` | Missing document or owner mismatch |
| `409` | Duplicate registration email, active retry request, unfinished document or missing legacy page content |
| `413` | File exceeds the upload size limit |
| `415` | Unsupported upload MIME type |
| `503` | Configured optional Q&A provider failed |
| `500` | Unexpected server-side failure |

Most errors include `{error: "message"}`; authentication errors also include an explanatory `message`. Extraction failures after upload are reported in the document's `Failed` status and `failureReason` rather than turning an accepted upload into a successful extraction. The health endpoint reports process status; it does not test every storage/database operation or operational dependency.

## Testing and validation

Backend, from `backend/`:

~~~bash
npm test
~~~

Frontend, from the repository root:

~~~bash
npm run build
npm run lint
~~~

Optional evaluation, from `backend/`:

~~~bash
npm run evaluate
~~~

The normal backend suite builds TypeScript and runs `workflow.test.cjs` plus `question-language.test.cjs`. It generates fictional PDFs/images and isolated database/storage artifacts under `backend/.test-output/`. It checks real extraction/OCR, API workflows, authentication/ownership, original bytes, citations, limits, failures, retry/deletion/recovery, field disambiguation, multiline/column layouts, repeated pages and bounded follow-up safety. An optional-provider contract test uses mocked responses; it does not install or invoke a model.

Recorded verification on 9 October 2026:

| Check | Recorded result |
| --- | --- |
| Backend regression cases | 24/24 |
| Synthetic benchmark documents | 9/9 completed with expected categories, page counts and extraction methods |
| Expected field/value/page/provenance checks | 72/72 |
| Expected line items | 2/2 |
| Questions | 73/73 |
| Positive-answer citation checks | 61/61 |
| Missing-evidence refusals | 12/12 |
| Frontend builds | Passed |
| Lint | Passed exit status; 11 advisory warnings, zero errors |

Brave browser verification covered single-upload navigation, mixed-success batch results, corrupt-file processing retry, original PDF preview, typed Q&A, persistent long-history scrolling, mobile navigation/upload at 390 x 844 CSS pixels, and automatic session expiry. See the [evaluation report](synthetic-evaluation-report.md) for observations and the [benchmark instructions](../backend/tests/evaluation/README.md) for grading.

The benchmark uses the same fictional fixtures before and after targeted fixes. It is a development/regression benchmark, not an independent post-fix holdout or population accuracy estimate. The field metric checks expected fields and does not measure precision of every extra emitted field. The browser pass covers one browser and an emulated phone viewport, not all physical devices or interruption scenarios.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| Frontend loads but API requests fail | Start the backend; check `/api/health` and the Vite proxy target. Compare the configured port and printed frontend URL. |
| Results differ from newly built code | Stop/restart the intended compiled backend, confirm its workspace, then reprocess the document. A frontend rebuild does not reload a static backend. |
| Old documents disappeared after changing settings | Verify the database and storage paths. Different paths create/use different data locations; they do not migrate existing uploads. |
| PDF values are missing or associated incorrectly | Inspect the original and full text. Reprocess with the current backend; try forced OCR if the selectable text layer is incomplete. |
| Image or PDF returns Failed | Read the actual failure reason. Supply an unlocked/readable file or a clearer scan. Retry alone cannot repair corrupt source bytes. |
| OCR language data fails to load | Use bundled English data or provide the correct local trained-data directory for the configured language. |
| Q&A returns `409` | Wait for completion; reprocess legacy records that lack page content. |
| Q&A refuses a present fact | Inspect whether the fact was extracted; use a specific field/page question. Report the layout/question with an anonymized reproducible example. |
| Preview or direct download returns `401` | Authenticate through the app or include a bearer header in an API client; do not put the token in the URL. |
| Sign-in suddenly ends | An invalid/expired protected request can clear the session. Sign in again; verify the intended server's secret and token lifetime. |
| Optional provider returns `503` | Check the separately configured service/model, or leave `OLLAMA_MODEL=` empty to use the validated default mode. |
| A native module cannot load | Install dependencies for the target OS/architecture using the lockfile; do not reuse another machine's native binaries. |
| Port is already in use | Use an available port and update the matching proxy/origin settings. Verify which checkout each process belongs to. |

For a useful bug report, include an anonymized source file or reproducible layout, the question, expected and actual values, page number, failure reason and runtime configuration without secrets. Do not submit private uploads, database files or tokens to the repository.

## Limitations and future work

Current limits include heuristic extraction/classification, incomplete complex-table and handwriting support, bounded phrasing and follow-ups, single-document Q&A, a single-process queue, client-side list filtering/pagination, unfinished account/settings features and incomplete production security controls.

Useful improvements include representative anonymized real-document evaluation, additional browser/device and interruption checks, better unsupported-layout reporting, pagination, account recovery/session controls, operational readiness, rate limiting and tested backup restoration. Dedicated ID parsing or verification would require separately specified features and evaluation; accepting an ID file does not implement them.

## Optional AWS deployment

AWS can be considered when a hosted installation or independently scalable processing is needed. It is optional and does not define the application's purpose. The repository has no implemented AWS adapters or infrastructure deployment workflow. See [Optional AWS deployment](aws-architecture.md) for hosting the existing application on EC2, the proposed managed-service architecture, migration prerequisites and acceptance checks. Local startup does not provision resources or upload existing documents to AWS.
