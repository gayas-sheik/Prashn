# Prashn

**Document Processing and Question Answering**

Prashn lets users upload documents such as invoices, receipts, application forms, IDs and other semi-structured files, automatically extract readable text and supported fields, and ask questions with citations to the original document.

Documents are processed by the Express backend. The included setup runs on your machine with SQLite and filesystem storage. It preserves the original file, complete extracted text and page provenance. The default Q&A engine uses extracted fields and matching passages; no language model or external inference service is required.

## What you can do

- Register and sign in to an account with access to your own documents and conversations.
- Upload one document or a selection of documents and track actual processing results.
- Extract selectable PDF text and use English OCR for images and scanned PDF pages.
- Inspect recognized fields, supported line-item tables, complete text and the original file.
- Ask supported questions about amounts, dates, parties, items and passages, with page citations.
- Reprocess documents, download originals, export results or conversations, and delete documents.
- Review processing states, document counts and account-scoped activity.

## Supported documents and limits

| Area | Current support |
| --- | --- |
| File formats | PDF, PNG and JPEG/JPG |
| File size | Up to 10 MiB per file |
| Batch selection / batch API | Up to 20 files |
| PDF length | Up to 100 pages by default; configurable |
| Document categories | Invoice, Receipt, Form, Contract and Unknown |
| OCR | English language data is bundled |
| Questions | Nonempty text, up to 4,000 characters |

An ID image or PDF can undergo the same text extraction and supported field matching as other files. There is no dedicated ID category, identity-verification workflow, or MRZ/barcode decoder. Classification, OCR and field matching are heuristic; complex layouts, handwriting and unfamiliar formats may need manual review.

## Documentation

- [Application guide](docs/project-documentation.md): features, architecture, setup, user workflows, processing, Q&A, data handling, configuration, API reference, testing, troubleshooting and limitations.
- [Optional AWS deployment](docs/aws-architecture.md): hosting choices and a proposed managed-service migration, with prerequisites and implementation gaps clearly identified.
- [Evaluation and browser verification](docs/synthetic-evaluation-report.md): before/after measurements, tested browser flows and verification limits.
- [Earlier validation history](docs/local-mvp-test-report.md): repair history and regression coverage.
- [Contributor instructions](AGENTS.md): development conventions and data-preservation rules.

## Quick start

### Prerequisites

Use Node.js and npm compatible with the locked dependencies. Node.js 22.14 was used for the recorded validation. The installed Vite version requires Node.js `^20.19.0 || >=22.12.0`; other packages also have engine requirements. Python is needed only for the optional synthetic evaluation generator, not for running the application or the normal backend tests.

From a fresh checkout:

~~~bash
git clone https://github.com/gayas-sheik/Prashn.git
cd Prashn
npm ci
cd backend
npm ci
~~~

If `backend/.env` does not exist, create it from [backend/.env.example](backend/.env.example). Set a private random `JWT_SECRET` and leave `OLLAMA_MODEL=` empty for the default answerer. Preserve an existing environment file and its data/storage paths.

Start the backend in one terminal, from `backend/`:

~~~bash
npm run dev
~~~

Start the frontend in a second terminal, from the repository root:

~~~bash
npm run dev
~~~

Open Vite's printed URL, normally `http://localhost:5173`. The backend defaults to `http://localhost:5000` and its health endpoint is `/api/health`. Both processes must run from the same checkout.

Register an account, sign in, upload a supported document and wait for completion. A completed single-file upload opens its inspection page automatically. Multiple-file results appear inline, including processing failures and retry actions.

For compiled builds, configuration, alternate ports and troubleshooting, see the [application guide](docs/project-documentation.md#installation-and-running).

## Ask questions from the document

Examples, when the relevant information is present:

- "What is the invoice number?"
- "How much do I owe?"
- "When is payment due?"
- "How much was paid?"
- "What is the total on page 2?", followed by "And on page 3?"
- "What does the warranty cover?"

The engine supports common phrasing and limited, unambiguous follow-ups. It does not provide general reasoning or verify that a document is authentic. When it cannot find supported evidence, it returns: **"I couldn't find that information in this document."** Always inspect important values and their cited source.

## Verification

From `backend/`:

~~~bash
npm test
~~~

From the repository root:

~~~bash
npm run build
npm run lint
~~~

Optional synthetic benchmark, from `backend/`:

~~~bash
npm run evaluate
~~~

The benchmark requires Python with reportlab and Pillow, plus the Windows Arial font used by the generator. See [evaluation instructions](backend/tests/evaluation/README.md).

Recorded on 9 October 2026: 24 backend regression cases passed; the nine-document synthetic benchmark passed 72 expected-field checks and 73 Q&A checks, including 61 positive citation checks and 12 missing-evidence refusals. Frontend builds passed; lint reported 11 advisory warnings and no errors. Brave checks covered uploads, batch results, retries, preview, chat scrolling, an emulated mobile layout and session expiry.

These are results for the tested fixtures and flows, not an estimate of accuracy on arbitrary real documents. Runtime databases, private uploads and generated test artifacts remain ignored.

## Current boundaries

The processing queue operates within one backend process. Only theme selection has implemented persistent settings behavior; account management, notification integrations and other displayed planned settings are unfinished. Password recovery, token revocation, rate limiting and a complete production security review are not implemented.

After updating a compiled backend, rebuild and restart it. Existing documents need **Reprocess** to use newer extraction logic. Back up the database and stored files together before changing storage paths or migrating data.

## Optional AWS deployment

AWS is an optional hosting and integration path. This repository does not currently provision AWS resources or implement S3, DynamoDB, Cognito, SQS or Textract adapters. The [optional deployment guide](docs/aws-architecture.md) separates hosting the existing application on EC2 from a larger managed-service migration. Neither is a requirement for the current application's purpose or local setup.
