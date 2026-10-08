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
}

export interface DocumentItem {
  originalFileName: string;
  documentType: DocumentType;
  uploaderName: string;
  mimeType: string;
  pages?: { page: number; text: string; extractionMethod: 'text' | 'ocr'; confidence?: number }[];
  id: string;
  name: string;
  type: DocumentType;
  status: DocumentStatus;
  uploadDate: string;
  uploader: string;
  fileSize: string;
  processingDuration: string;
  confidence: number;
  extractedSummary: string;
  s3Uri: string;
  sha256: string;
  pagesCount: number;
  failureReason?: string;
  extractedFields: ExtractedField[];
  lineItems?: LineItem[];
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  event: string;
  documentName: string;
  documentId?: string;
  actor: string;
  status: 'Success' | 'Processing' | 'Failed' | 'Warning';
  details: string;
  logJson?: Record<string, any>;
}

export interface QACitation {
  id: string;
  source: string;
  page: number;
  section: string;
  snippet: string;
  confidence: number;
}

export interface QAMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citations?: QACitation[];
  isLoading?: boolean;
}

export interface StagedUploadFile {
  id: string;
  file?: File;
  name: string;
  size: number;
  formattedSize: string;
  mimeType: string;
  detectedType: DocumentType;
  status: 'Ready' | 'Uploading' | 'Uploaded' | 'Processing' | 'Completed' | 'Failed';
  progress: number;
  speed?: string;
  error?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserSettings {
  profile: {
    fullName: string;
    email: string;
    organization: string;
    role: string;
    timezone: string;
    defaultCurrency: string;
  };
  appearance: {
    theme: ThemeMode;
    density: 'compact' | 'comfortable';
    language: string;
  };
  ocrPipeline: {
    autoDetectClassification: boolean;
    ocrEngine: string;
    confidenceThreshold: number;
    extractInvoiceTotals: boolean;
    extractTaxRates: boolean;
    vendorMatching: boolean;
  };
  notifications: {
    ingestionCompleteEmail: boolean;
    ingestionCompleteInApp: boolean;
    failureAlerts: boolean;
    weeklyDigest: boolean;
    slackWebhookUrl: string;
  };
  security: {
    twoFactorEnabled: boolean;
  };
  storage: {
    s3Bucket: string;
    usedGb: number;
    totalGb: number;
    retentionDays: number;
  };
}
