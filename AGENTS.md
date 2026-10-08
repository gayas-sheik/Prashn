# Agent / AI Contributor Instructions

Welcome to Prashn. If you are an AI coding assistant, agent, or developer assigned to work on this repository, you **MUST** read and adhere to these guidelines.

## 1. Project Context
- **Current State**: Local MVP (Node.js, Express, React, SQLite, Local File System, Tesseract.js).
- **Future State**: AWS Cloud (Lambda, API Gateway, DynamoDB, S3, Textract, SQS, EventBridge).
- Do **NOT** assume AWS services are configured unless explicitly verifiable in the codebase.
- The UI is designed in a specific dark-theme aesthetic (Stitch). **Do not redesign the UI** unless strictly requested.

## 2. Core Architectural Rules
1. **Never Discard Full Text**: When parsing documents, always ensure the complete OCR/text payload is preserved (currently saved to `storage/processed/[id].txt`). Do not throw away raw text just because structured fields were extracted.
2. **Zero Hallucination Q&A**: The Q&A feature (`question.controller.ts`) MUST remain strictly document-grounded. If you enhance the Q&A logic (e.g., adding an LLM), you must strictly prompt the LLM to refuse answers that are not present in the document.
3. **Data Isolation**: Always enforce `userId` checks on document and activity lookups. A user must NEVER see another user's documents.
4. **Preserve Interfaces**: Features like `DocumentRepository` and `StorageProvider` are built using interfaces to make the AWS migration seamless. Maintain this boundary.

## 3. What NOT To Do
- **Do not mock backend data**: The frontend is fully connected to the backend API. Do not hardcode static arrays to bypass missing API functionality. Fix the API instead.
- **Do not commit secrets**: Never commit `.env` files, JWT secrets, or future AWS credentials.
- **Do not overcomplicate local search**: The local Q&A is a scoring-based keyword engine. Do not attempt to spin up a complex Vector Database (like Pinecone) for the local MVP unless explicitly asked. 

## 4. Where to Start
- **Frontend Entry**: `src/App.tsx` and `src/routes/AppRoutes.tsx`
- **Backend Entry**: `backend/src/server.ts`
- **Processing Logic**: `backend/src/processing/processor.ts`
- **Q&A Engine**: `backend/src/controllers/question.controller.ts`

Always check `README.md` to understand the overarching project structure before beginning a task.
