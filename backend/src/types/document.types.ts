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
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface LineItem {
  id: string;
  description: string;
  serviceUsage: string;
  quantity: string | number;
  unitPrice: string;
  amount: string;
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
  failureReason?: string;
  extractedFields?: ExtractedField[];
  lineItems?: LineItem[];
  createdAt: string;
  updatedAt: string;
}
