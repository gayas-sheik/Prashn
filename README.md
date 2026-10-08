# Prashn

Prashn is a cloud-ready document processing platform that allows users to upload PDF and image documents, automatically extract and classify their content, inspect structured information, and ask natural-language questions grounded in the selected document's text.

---

## Table of Contents
- [1. Project Overview](#1-project-overview)
- [2. Core Features](#2-core-features)
- [3. Current Architecture](#3-current-architecture)
- [4. Repository Structure](#4-repository-structure)
- [5. Technology Stack](#5-technology-stack)
- [6. Frontend Architecture](#6-frontend-architecture)
- [7. Backend Architecture](#7-backend-architecture)
- [8. Document Processing Pipeline](#8-document-processing-pipeline)
- [9. Document Extraction](#9-document-extraction)
- [10. Classification](#10-classification)
- [11. Q&A Architecture](#11-qa-architecture)
- [12. Database](#12-database)
- [13. Storage](#13-storage)
- [14. API Documentation](#14-api-documentation)
- [15. Environment Variables](#15-environment-variables)
- [16. Local Development Setup](#16-local-development-setup)
- [17. Running the Project](#17-running-the-project)
- [18. Testing](#18-testing)
- [19. Error Handling and Debugging](#19-error-handling-and-debugging)
- [20. Security](#20-security)
- [21. Current Limitations](#21-current-limitations)
- [22. Planned AWS Architecture](#22-planned-aws-architecture)
- [23. Local → AWS Migration Mapping](#23-local--aws-migration-mapping)
- [24. Cloud Computing Concepts Demonstrated](#24-cloud-computing-concepts-demonstrated)
- [25. Development Roadmap](#25-development-roadmap)
- [26. Important Development Rules](#26-important-development-rules)
- [27. Important Files for Future Agents](#27-important-files-for-future-agents)
- [28. Current Status](#28-current-status)

---

## 1. Project Overview

Prashn solves the problem of unstructured data trapped in images and PDFs (like invoices, receipts, and forms). 
It serves as a fully featured dashboard where users can upload documents and immediately begin chatting with the extracted content to pull insights.

The platform is built as a **Local MVP** that is explicitly designed with cloud-ready abstractions. It operates completely locally (Node.js backend, SQLite database, local filesystem storage, local OCR) but is designed to seamlessly migrate to AWS (Textract, DynamoDB, S3) in the future.

**Main Workflow:**
User → Frontend → Backend API → Document Ingestion → Processing Pipeline → OCR/Extraction → Classification → Storage → Document Q&A.

---

## 2. Core Features

### Authentication
- JWT-based authentication
- User registration and login
- User isolation (users can only access their own documents)
- Secure layout guarding on the frontend

### Document Upload
- Supports `.pdf`, `.jpg`, `.jpeg`, and `.png`
- Single or multi-file upload
- Validates file size (max 10MB)

### Document Processing
- Asynchronous pipeline with polling status ("Queued" → "Processing" → "Extracting" → "Classifying" → "Completed")
- Failure handling and manual "Retry" capabilities

### Document Extraction
- **PDF Extraction**: Extracts text native to PDF files using `pdf-parse`.
- **Image/OCR**: Extracts text from images using `tesseract.js`.
- **Canonical Representation**: Preserves the complete raw text, alongside structured fields and tables (Line Items).

### Document Classification
- Automatically classifies documents into: `Invoice`, `Receipt`, `Form`, or `Unknown`.

### Document Management
- List view with pagination UI
- Real-time status badges
- Detailed inspection view (shows actual uploaded file preview)
- Deletion

### Q&A
- **Document-Grounded:** Queries only search the currently selected document.
- **Retrieval Engine:** Features a custom scoring algorithm that scans Structured Fields, Tables, and the Full Text.
- **Strict Boundaries:** Refuses to answer if the information is not found in the document (zero hallucinations).
- **Conversational context:** Maintains conversation history per document.

### Dashboard & Activity
- Aggregates user metrics (Total Documents, Processing, Success rates).
- Real-time Activity Feed logging system actions.

---

## 3. Current Architecture

```text
                    ┌───────────────────────────┐
                    │      React Frontend       │
                    │  (TypeScript, Vite, SPA)  │
                    └────────────┬──────────────┘
                                 │ HTTP/REST (JWT)
                                 ▼
                    ┌───────────────────────────┐
                    │       Express Backend     │
                    │ (Node.js, TypeScript, API)│
                    └────────────┬──────────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
       Authentication        Processing             Q&A
      (Local SQLite)       (Tesseract/PDF)    (In-memory Retrieval)
             │                   │                   │
             ▼                   ▼                   ▼
        JWT Tokens      Local File System       SQLite Data
```

---

## 4. Repository Structure

```
/
├── src/                      # Frontend Application
│   ├── components/           # Reusable UI components (Dashboard, Documents, UI primitives)
│   ├── context/              # React Context (Auth context)
│   ├── pages/                # Page components (Upload, Documents, Q&A, Dashboard, etc.)
│   ├── routes/               # React Router definitions
│   ├── services/api/         # API client layer (documentService, authService)
│   └── ...
│
├── backend/                  # Backend Application
│   ├── data/development/     # Local SQLite database files
│   ├── src/
│   │   ├── controllers/      # Express route handlers
│   │   ├── middleware/       # JWT Auth and Multer upload middlewares
│   │   ├── processing/       # Document processing pipeline (Local OCR, Classification)
│   │   ├── repositories/     # SQLite database access layer
│   │   ├── routes/           # Express router definitions
│   │   ├── storage/          # File system storage abstraction
│   │   └── types/            # TypeScript interfaces
│   ├── storage/
│   │   ├── processed/        # Saved raw .txt OCR payload files
│   │   └── uploads/          # Saved raw image/pdf uploads
│   └── ...
```

---

## 5. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React (Vite) | UI framework |
| **Language** | TypeScript | Type safety |
| **Styling** | Tailwind CSS | Utility-first styling |
| **Backend** | Node.js + Express | API Server |
| **Database** | SQLite3 | Local MVP relational database |
| **Storage** | Local File System | File persistence (Images, PDFs, Text) |
| **PDF Extraction** | `pdf-parse` | Native PDF text parsing |
| **OCR** | `tesseract.js` | Image-to-text Optical Character Recognition |
| **Authentication** | `jsonwebtoken` & `bcrypt` | Secure user access |

---

## 6. Frontend Architecture

The frontend is a React Single Page Application (SPA) compiled with Vite.
- **Routing:** Handled by React Router (`src/routes/AppRoutes.tsx`).
- **State:** Authentication state is managed via `AuthContext.tsx`. Document state is largely local to components and fetched via `useEffect` from API services.
- **API Client:** Services like `src/services/api/documentService.ts` wrap Axios/Fetch to make authenticated calls (attaching the JWT from localStorage).
- **Q&A Flow:** The `DocumentQAPage.tsx` renders an image of the document alongside a conversational chat interface.

---

## 7. Backend Architecture

The backend follows a layered MVC-style architecture.
1. **Route (`document.routes.ts`)**: Defines endpoint and applies `requireAuth` middleware.
2. **Controller (`document.controller.ts`)**: Handles req/res formatting and user extraction.
3. **Service/Processor (`processor.ts`)**: Orchestrates the extraction, OCR, and classification.
4. **Repository (`document.repository.ts`)**: Abstracted SQLite queries to persist states.

---

## 8. Document Processing Pipeline

The exact pipeline (`processor.ts`):
1. **Upload**: User uploads file → Express saves via Multer → `Document` record created as 'Queued'.
2. **Text Extraction (`local.extractor.ts`)**: 
   - If PDF: Extracts via `pdf-parse`.
   - If Image: Extracts via `tesseract.js`.
3. **Save Raw Text**: The full extracted payload is saved to `storage/processed/[id].txt` for grounded Q&A.
4. **Classification (`local.classifier.ts`)**: Simple keyword matching identifies Invoice, Receipt, Form.
5. **Structured Extraction (`field_extractor.ts`)**: Regex patterns pull fields (Total, Date, Vendor) and Tables (Line Items).
6. **Completion**: Status marked as 'Completed', Activity event logged.

*Note: If processing fails, the status is marked 'Failed' and users can hit the `/retry` endpoint to queue it again.*

---

## 9. Document Extraction

- **PDF Extraction**: Works very well for digitally native PDFs. Scanned PDFs are not currently routed through Tesseract automatically (they rely on native text).
- **Image OCR**: Works well for clear, high-resolution JPG/PNGs. 
- **Structured Fields**: Capable of identifying Dates, Totals, Taxes, and basic Vendor information using Regex.
- **Table Extraction**: Employs heuristic Regex to find line items (Description, Quantity, Unit Price, Amount).
- **Limitation**: Deeply nested tables or complex multi-column forms will degrade in quality. 

---

## 10. Classification

- **Supported Classes**: Invoice, Receipt, Form, Unknown.
- **Algorithm**: Keyword weighting (e.g., finding the word "tax", "total", "invoice" weights heavily towards Invoice).
- **Note**: Classification is metadata only. The complete document payload is preserved regardless of classification.

---

## 11. Q&A Architecture

**Implementation (`question.controller.ts`)**:
1. **User Question**: User asks "How much is the tax?"
2. **Retrieval**: The system queries the `id` of the selected document.
3. **Query Expansion**: "tax" is expanded to synonyms (vat, gst).
4. **Scoring Engine**: The engine iterates through the Document's Structured Fields, Table Line Items, and the Full Raw Text (`.txt` file).
5. **Confidence**: It scores matches based on keyword density. If the best score is `< 3`, it refuses to answer.
6. **Answer**: It formulates a natural language response (e.g. "The tax is $5.00") and returns a precise citation snippet.

---

## 12. Database

The local MVP uses SQLite (`backend/data/development/docflow.db`).

**Core Tables:**
- `users`: id, email, password, name
- `documents`: id, userId, originalFileName, mimeType, documentType, status, extractedFields (JSON string), lineItems (JSON string)
- `questions`: id, documentId, userId, sender, text, citations (JSON string)
- `activity_logs`: id, userId, event, documentName, status

---

## 13. Storage

Local storage structure:
- `backend/storage/uploads/`: Contains the actual binary files (`.jpg`, `.pdf`) uploaded by the user.
- `backend/storage/processed/`: Contains the generated `.txt` files containing full OCR payload representations.

Files are named by their UUID `[id].extension`. They are served back to the frontend via the `/api/documents/:id/file` endpoint.

---

## 14. API Documentation

- `POST /api/auth/register` : Register a user.
- `POST /api/auth/login` : Login (Returns JWT).
- `GET /api/documents` : List user's documents.
- `GET /api/documents/:id` : Get document details (JSON).
- `GET /api/documents/:id/file` : Download/stream the original uploaded binary file. (Auth token supported in query string).
- `POST /api/documents/upload` : Upload single file (multipart/form-data).
- `POST /api/documents/upload-multiple` : Upload multiple files.
- `DELETE /api/documents/:id` : Delete document.
- `POST /api/documents/:id/retry` : Retry a failed document pipeline.
- `GET /api/documents/:id/questions` : Fetch Q&A history for a document.
- `POST /api/documents/:id/questions` : Ask a question about a document.
- `GET /api/activity` : Fetch user activity logs.
- `GET /api/dashboard/metrics` : Fetch user dashboard metrics.

---

## 15. Environment Variables

Create a `.env` in the `backend/` directory:

```env
PORT=5000
JWT_SECRET=super_secret_jwt_key
DATABASE_URL=./data/development/docflow.db
NODE_ENV=development
```

---

## 16. Local Development Setup

1. **Clone the repository**
2. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```
3. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   ```
4. **Configure Environment:** Create `backend/.env` using the template above.
5. **Start the Backend:**
   ```bash
   cd backend
   npm run build
   npm start
   ```
6. **Start the Frontend (in a new terminal):**
   ```bash
   npm run dev
   ```
7. **Use the App:** Open `http://localhost:5173`. Register a new account and begin uploading files.

---

## 17. Running the Project

- Frontend runs on Vite (`npm run dev`).
- Backend runs on Express (`npm run build` then `npm start`). 
- **Important Node.js Note**: Ensure you compile the backend TypeScript via `tsc` (`npm run build`) and run the emitted `dist/server.js` using standard `node` to avoid `ts-node` module resolution conflicts in certain environments.

---

## 18. Testing

To perform a regression test, manually verify:
- [ ] Register & Login
- [ ] Upload an image receipt
- [ ] Upload a PDF invoice
- [ ] Observe processing states (Queued -> Processing -> Completed)
- [ ] Open details page (Verify image renders properly on the left)
- [ ] Open Q&A workspace
- [ ] Ask "What is the total?"
- [ ] Ask "What is the customer's age?" (Verify it refuses to hallucinate)
- [ ] View Dashboard metrics and Activity Feed

---

## 19. Error Handling and Debugging

- **File preview missing (`Unauthorized`)**: Ensure the `?token=` parameter is properly appended in `DocumentDetailsPage` and `DocumentQAPage` image tags.
- **Q&A says "Cannot find information"**: The extraction pipeline may have failed to OCR the text correctly. Check `backend/storage/processed/[id].txt` to see if the OCR payload is mangled.
- **Backend fails to start**: Ensure the SQLite database directory `backend/data/development` exists and has write permissions.

---

## 20. Security

**Current Implementation:**
- JWT Bearer Token authentication.
- Strict Document/User isolation (queries enforce `userId` checks).
- Passwords hashed using `bcrypt`.

**Planned for AWS:**
- Authentication offloaded to AWS Cognito.
- IAM roles enforcing Least Privilege.
- S3 Bucket Policies restricting file access via signed URLs.

---

## 21. Current Limitations

- **Local MVP**: Does not scale horizontally. Processing blocks the Node event loop momentarily.
- **OCR Limitations**: Relies on Tesseract.js. Heavily skewed or low-resolution images will produce mangled text.
- **Q&A Engine**: Uses an in-memory TF-IDF/Keyword scoring engine. It does not understand complex semantic meaning (it is not a true LLM).
- **Scanned PDFs**: Will not be automatically rasterized and OCR'd; it will only parse text natively embedded in the PDF.

---

## 22. Planned AWS Architecture

```text
                    ┌──────────────┐
                    │    React     │
                    │   Frontend   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Backend    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │      S3      │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  EventBridge │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │     SQS      │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    Lambda    │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    ▼              ▼
              ┌──────────┐   ┌────────────┐
              │ Textract │   │ DynamoDB   │
              └──────────┘   └────────────┘
```

**Future Integration:** AWS Cognito, CloudWatch, Terraform, and GitHub Actions.

---

## 23. Local → AWS Migration Mapping

| Current Local Component | Future AWS Component |
|---|---|
| Local file storage (`/storage`) | S3 Bucket |
| SQLite Database | DynamoDB |
| Node.js Async Processor | Lambda Functions |
| Promise-based pipeline | SQS Queue + EventBridge |
| Tesseract.js / pdf-parse | AWS Textract |
| Local JWT Auth | AWS Cognito |

---

## 24. Cloud Computing Concepts Demonstrated

- **Asynchronous Processing**: Files are uploaded immediately while processing happens asynchronously.
- **Event-Driven UI**: Polling the API to update UI states.
- **Storage Abstraction**: Storage interfaces are abstracted allowing easy swap from Local FS to S3.
- **Data Isolation**: Multi-tenant data segregation.

---

## 25. Development Roadmap

- [x] Local MVP Dashboard
- [x] Local Authentication
- [x] Local Tesseract OCR & PDF Parsing
- [x] Local SQLite Database
- [x] Document-Grounded Q&A (Local Retrieval Engine)
- [ ] **AWS S3 Integration**
- [ ] **DynamoDB Migration**
- [ ] **AWS Textract integration**
- [ ] **SQS + EventBridge Async Queues**
- [ ] AWS Cognito
- [ ] CloudWatch & Terraform

---

## 26. Important Development Rules

1. **Read README.md before modifying the project.**
2. **Inspect existing code before implementing new functionality.**
3. **Do not add mock data** to hide backend problems. The application uses REAL data.
4. **Preserve Complete Extracted Content**: Do not discard the raw `.txt` payload. The Q&A depends on it.
5. **Zero Hallucinations**: Q&A must remain grounded in the selected document. Never hook up an LLM that hallucinates answers.
6. **Preserve Abstraction Boundaries**: Continue building using interfaces (`DocumentRepository`, `StorageProvider`) so the eventual AWS migration is seamless.
7. **Do not commit secrets**.

---

## 27. Important Files for Future Agents

| File | Purpose | Important Notes |
|---|---|---|
| `backend/src/processing/processor.ts` | Processing Pipeline | Core orchestrator for extraction and classification. |
| `backend/src/controllers/question.controller.ts` | Q&A Engine | Contains the custom scoring algorithm for grounded Q&A. |
| `src/pages/DocumentDetails/DocumentDetailsPage.tsx` | UI Inspector | Renders the actual image via API token. |
| `backend/src/processing/field_extractor.ts` | Structured Data | Regex patterns for tables and generic fields. |

---

## 28. Current Status

**Project Status:** Local MVP fully functional.
- **Frontend:** Completed (React + Vite)
- **Backend:** Completed (Express + Node.js)
- **Database:** Completed (SQLite)
- **Document Upload:** Completed (Multer)
- **PDF Extraction:** Completed (pdf-parse)
- **Image OCR:** Completed (Tesseract.js)
- **Q&A:** Completed (Custom Scoring Engine)
- **AWS:** Not Started (Future Phase)
- **Terraform/CI-CD:** Not Started (Future Phase)
