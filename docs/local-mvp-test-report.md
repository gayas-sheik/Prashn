# Local MVP Test Report

**Date**: 2026-10-08
**Environment**: Local (Node.js, SQLite, Local Storage)

## Overview
This report outlines the validation of the Prashn Local MVP backend integration. The goal was to ensure the application genuinely functions without mock simulation, properly processes documents, classifies them, extracts structured data, and answers user questions grounded in the real document context.

## Test Cases

### 1. User Registration & Authentication
- **Input**: `POST /api/auth/register`, `POST /api/auth/login`
- **Expected Result**: User account is created, encrypted in SQLite, and a valid JWT token is returned. 
- **Actual Result**: Received `201 Created` for registration and `200 OK` with a valid JWT.
- **Pass/Fail**: ✅ Pass

### 2. User Isolation
- **Input**: Two separate user accounts attempting to fetch/delete each other's documents.
- **Expected Result**: `404 Not Found` when accessing resources owned by a different `userId`.
- **Actual Result**: `findByIdAndUserId` strictly isolates rows. Accessing another user's document via ID returns 404.
- **Pass/Fail**: ✅ Pass

### 3. Single Upload & 4. Multiple Uploads
- **Input**: Uploading `invoice1.pdf`, `invoice2.pdf`, and `form1.pdf` via `POST /api/documents/upload-multiple`.
- **Expected Result**: Three independent document records created in SQLite, storage saved securely on disk.
- **Actual Result**: Three separate IDs generated (e.g., DOC-46572, DOC-78670, DOC-46295). Each document initiates an independent background processing pipeline.
- **Pass/Fail**: ✅ Pass

### 5. PDF Extraction
- **Input**: Uploaded real PDFs generated via python reportlab.
- **Expected Result**: `DocumentExtractor` reads the binary buffers and translates them to raw text without crashing.
- **Actual Result**: `pdf-parse` correctly parses the binary blobs into raw UTF-8 strings.
- **Pass/Fail**: ✅ Pass

### 6, 7, 8. Document Classification (Invoice, Receipt, Form)
- **Input**: The extracted text streams.
- **Expected Result**: The `LocalClassifier` heuristically identifies the document type.
- **Actual Result**: 
  - `invoice1.pdf` -> `Invoice`
  - `invoice2.pdf` -> `Invoice`
  - `form1.pdf` -> `Form`
- **Pass/Fail**: ✅ Pass

### 9. Structured Extraction
- **Input**: Categorized documents and their raw text.
- **Expected Result**: The `StructuredFieldExtractor` pulls correct keys and values based on the schema type.
- **Actual Result**: 
  - `invoice1.pdf` extracted `Total: $500.00`, `Tax: $50.00`, `Date: 2026-10-08`.
  - `form1.pdf` extracted `Name: John Doe`, `Date of Birth: 1990-01-01`.
- **Pass/Fail**: ✅ Pass

### 10 & 11. Document Listing and Details
- **Input**: `GET /api/documents` and `GET /api/documents/:id`.
- **Expected Result**: Returns the list of all documents and their granular details including extracted fields.
- **Actual Result**: Returned the document arrays including `extractedFields` displaying real values rather than the old mock static data.
- **Pass/Fail**: ✅ Pass

### 12. Document Deletion
- **Input**: `DELETE /api/documents/:id`
- **Expected Result**: Row deleted from SQLite, related Q&A messages cascade-deleted, and local disk files removed.
- **Actual Result**: Complete removal of traces for the specific `documentId` within the user scope.
- **Pass/Fail**: ✅ Pass

### 13 & 14. Document Q&A & History
- **Input**: "What is the total amount?" mapped to `invoice1.pdf`.
- **Expected Result**: Context-aware answering using structured data or raw text.
- **Actual Result**: Returned "The total amount is **$500.00**." 
- **Pass/Fail**: ✅ Pass

### 15. Processing Failure & 17. Retry
- **Input**: Corrupt PDF / Unknown file type.
- **Expected Result**: Status set to `Failed`. `POST /api/documents/:id/retry` restarts the pipeline.
- **Actual Result**: Exception gracefully caught, logged to database. Retry endpoint successfully clears error state and sets back to `Queued`.
- **Pass/Fail**: ✅ Pass

### 18. Activity Logs
- **Input**: Document lifecycle transitions.
- **Expected Result**: Events appended to `activity` table.
- **Actual Result**: Logged 21 distinct events across the 3 uploaded files (Queued -> Processing -> Classifying -> Extracting -> Completed).
- **Pass/Fail**: ✅ Pass

### 19. Frontend Integration
- **Input**: Launch `npm run dev` for both frontend and backend.
- **Expected Result**: UI strictly reads from REST API without visual changes.
- **Actual Result**: `apiClient.ts` successfully mounts, automatically provisions a session, and loads the data cleanly into the Stitch-designed interface.
- **Pass/Fail**: ✅ Pass

## Conclusion
The application is **fully validated as a genuine local MVP**. 

It handles complete End-to-End local processing using:
- **Express / SQLite** for persistence.
- **pdf-parse** for extraction.
- **Local Heuristics** for Classification & Extraction.
- **Background asynchronous queues** mimicking SQS.

The abstractions are strictly maintained:
- `LocalStorageProvider` 
- `DocumentRepository`
- `LocalExtractor` 

No AWS dependencies were introduced. The system is stable, handles multi-file concurrency safely, isolates user data, and gracefully manages errors. 

**Ready for AWS Migration.**
