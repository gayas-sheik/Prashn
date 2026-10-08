export type DocumentType = 'Invoice' | 'Receipt' | 'Form' | 'Contract' | 'Unknown';

export type DocumentStatus = 
  | 'Ready'
  | 'Uploading'
  | 'Uploaded'
  | 'Queued'
  | 'Processing'
  | 'Classifying'
  | 'Extracting information'
  | 'Completed'
  | 'Failed';

export interface ExtractedField {
  label: string;
  value: string;
  confidence?: number;
  page?: number;
  snippet?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface LineItem {
  id: string;
  description: string;
  serviceUsage: string;
  quantity: string | number;
  unitPrice: string;
  amount: string;
  page?: number;
  snippet?: string;
}

export interface DocumentPage {
  page: number;
  text: string;
  extractionMethod: 'text' | 'ocr';
  confidence?: number;
}

export interface Document {
  id: string;
  userId: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  formattedSize: string;
  storageKey: string;
  documentType: DocumentType;
  status: DocumentStatus;
  uploadDate: string;
  uploaderName?: string;
  processingDuration?: string;
  confidence?: number;
  extractedSummary?: string;
  s3Uri?: string;
  sha256?: string;
  pagesCount: number;
  failureReason?: string | null;
  extractedFields?: ExtractedField[];
  lineItems?: LineItem[];
  pages?: DocumentPage[];
  createdAt: string;
  updatedAt: string;
}
