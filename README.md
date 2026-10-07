# Prashn

**Prashn** is a cloud-native, intelligent document processing platform designed to extract, classify, and interact with your unstructured files. With advanced local PDF extraction and heuristically driven structured data parsing, Prashn automatically transforms your invoices, receipts, and forms into actionable, queryable insights.

---

## 🌟 Key Features

* **Intelligent Document Ingestion:** Upload multiple PDFs or images concurrently.
* **Automated Classification:** Automatically detects if a document is an Invoice, Receipt, or Form.
* **Structured Data Extraction:** Pulls essential fields like Total, Tax, Dates, and Vendor names natively without external dependencies.
* **Document-Grounded Q&A:** Chat dynamically with your document. Ask context-aware questions (e.g., "What is the total amount?") and get answers grounded directly in the extracted text.
* **Resilient Async Pipeline:** A simulated background event-driven queue processes documents robustly, maintaining decoupled architecture for future scalability (AWS EventBridge/SQS ready).
* **Comprehensive Audit Trail:** Track every document transition and query via a persistent activity log.

---

## 🏗️ Architecture & Technology Stack

The application strictly adheres to the **Clean Architecture** pattern, providing scalable service abstractions designed for an eventual migration to AWS.

### Frontend
- **React 18** with **Vite**
- **TypeScript**
- **Tailwind CSS**
- Modern, dynamic UI mapping securely to backend REST APIs.

### Backend
- **Node.js / Express** (TypeScript)
- **SQLite3** for zero-config persistence, abstracted through the Repository Pattern.
- **Multer** for multipart file handling.
- **PDF-Parse** for raw binary extraction.
- JWT-based **stateless Authentication** middleware.

---

## 🚀 Getting Started

To run **Prashn** locally, you will need Node.js installed. The environment is designed as a fully functional Local MVP requiring zero external cloud services.

### 1. Clone the Repository
```bash
git clone https://github.com/gayas-sheik/Prashn.git
cd Prashn
```

### 2. Start the Backend API
Navigate to the `backend` directory, install dependencies, and start the daemon.
```bash
cd backend
npm install
npm run dev
```
*The backend will initialize the SQLite database (`docflow.db`), set up storage directories, and listen on `http://localhost:5000`.*

### 3. Start the Frontend Application
Open a new terminal, navigate to the root directory, and launch the Vite development server.
```bash
# From the root directory (Prashn)
npm install
npm run dev
```
*The frontend will compile and become available at `http://localhost:5173`. The UI automatically provisions a session and securely integrates with the backend API.*

---

## 🛠️ Testing the Workflow

1. Navigate to the web application interface.
2. Select **Upload Documents** and select one or more PDF files (e.g., invoices).
3. Monitor the background pipeline queue as your documents are read, classified, and finalized.
4. Click into the processed document to review the **Extracted Structured Data**.
5. Switch to the **Q&A Workspace** tab and ask queries like *"Who is the vendor?"* to interact with the locally-parsed data representation.

---

## ☁️ Future AWS Migration Path

Prashn's backend is intentionally abstracted:
- `LocalStorageProvider` can be cleanly swapped with an `S3StorageProvider`.
- SQLite interfaces in the `DocumentRepository` map 1-to-1 with a future `DynamoDBRepository`.
- The local background processing queue (`DocumentProcessor`) represents a future **SQS Queue / EventBridge** pipeline driving AWS Lambda functions and **Textract**.

No business logic or frontend controllers will require rewrites during cloud migration.
