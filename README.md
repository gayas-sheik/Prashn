# Prashn

Cloud-Native Intelligent Document Processing and Question Answering Platform.

Prashn processes uploaded PDFs and images, preserves complete extracted content, and answers supported questions with document citations. The current implementation runs locally with React, Express, SQLite, filesystem storage, PDF.js and Tesseract OCR. Custom model training, Ollama installation and AWS deployment are deferred.

## Documentation

- [Project documentation](docs/project-documentation.md): objectives, implemented features, architecture, extraction and Q&A behavior, data model, setup, configuration, API reference, limitations and roadmap.
- [Proposed AWS architecture](docs/aws-architecture.md): service diagram, asynchronous Textract flow, migration work, scaling, retries, monitoring and cost considerations.
- [Local validation report](docs/local-mvp-test-report.md): earlier repair coverage and results.
- [Synthetic evaluation and browser verification](docs/synthetic-evaluation-report.md): measured before/after results, browser checks, repairs and limits.
- [Contributor instructions](AGENTS.md): development boundaries and project conventions.

## Quick start

The current working checkout is `Prashn-latest`; the original sibling `Prashn` folder was retained. Install dependencies in both the repository root and `backend/` using `npm ci`. Create `backend/.env` from [the example](backend/.env.example) if it does not already exist. Set a private `JWT_SECRET` and leave `OLLAMA_MODEL=` empty.

Start the backend in one terminal:

```powershell
cd 'C:\Users\rithv\Downloads\Cloud_computing_project(Prashn)\Prashn-latest\backend'
npm run dev
```

Start the frontend in a second terminal:

```powershell
cd 'C:\Users\rithv\Downloads\Cloud_computing_project(Prashn)\Prashn-latest'
npm run dev
```

Open Vite's printed URL, normally `http://localhost:5173`. The default backend is `http://localhost:5000`; health is `/api/health`. Register, log in, upload a PDF/PNG/JPEG, wait for completion, inspect the original and Full Text, then ask questions. Limits are 10 MiB per file, 20 files per batch API request and 100 PDF pages by default.

Both frontend and backend must run from the same current checkout. `/api/health` reports `workspace` and `extractionVersion`; the current extraction marker is `layout-fields-v2`. An earlier screenshot used the latest frontend with an older backend from the sibling `Prashn` folder. The local ignored `backend/.env` now points to that folder's existing database and storage to preserve those uploads while running the latest code. Those local paths are not required on another machine.

For a compiled backend, run `npm run build` then `npm start` inside `backend/`. Restart that server after rebuilding. Reprocess existing documents to apply newer extraction logic. A previous preview session used ports 5174/5050; those are session-specific rather than defaults.

## Verification

A single-file upload opens its results automatically when processing completes. Batch results appear on the upload screen with real statuses, extracted fields, line items and retry actions for failures. No manual trip to the processing queue is needed.

Backend:

```powershell
cd backend
npm test
```

Frontend, from the repository root:

```powershell
npm run build
npm run lint
```

The latest verification passed 24 backend cases, 72 expected-field checks, 73 Q&A checks and the frontend build. Lint exits successfully with 11 React advisory warnings. Brave browser verification covered single/batch upload, failed processing retry, PDF preview, chat scrolling, mobile layouts and session expiry. See the synthetic evaluation report for scope and limits. Tests generate isolated artifacts under `backend/.test-output/`.

Repeated fields are retained across pages, including identical values. Broad date/amount questions return all recognized values with page citations. Page-specific questions such as “What is the date on page 3?” restrict the answer to that page. Restart an existing compiled backend and use Reprocess on previously uploaded documents to apply these extraction fixes.

## Current boundaries

Extraction, classification and field matching are heuristic. Q&A supports recognized fields, line items, summaries and matching passages; arbitrary paraphrases, reasoning and conversational references are limited. Missing evidence returns a refusal. Passing regression fixtures does not guarantee every document layout is parsed correctly.

Original uploads, complete text and page provenance are retained. Owner checks protect document, chat and activity access. The local processing queue is bounded and restart-recoverable but does not distribute jobs across servers. Account/cloud settings beyond theme are unfinished. AWS service adapters, infrastructure and deployment are future work.

See the detailed documentation for the implemented behavior and proposed cloud computing demonstrations. No cloud resources are provisioned by this repository's current local workflow.
