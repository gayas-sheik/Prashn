import type { ActivityEvent } from '../types';

export const mockActivityEvents: ActivityEvent[] = [
  {
    id: 'evt-001',
    timestamp: 'Just now (14:32:10 UTC)',
    event: 'OCR Extraction Completed',
    documentName: 'invoice_2024-88492_AWS_Cloud.pdf',
    documentId: 'DOC-88492',
    actor: 'worker-lambda-03 (Auto)',
    status: 'Success',
    details: 'Extracted 14 line items, 99.82% confidence across 4 pages',
    logJson: {
      traceId: 'trace-aws-88492-991',
      engine: 'AWS Textract + Prashn LayoutLMv3',
      pages: 4,
      latencyMs: 1840,
      confidence: 0.9982,
      fieldsExtracted: 10,
      tablesParsed: 1,
      s3Destination: 's3://prashn-vault-east1/parsed/DOC-88492.json'
    }
  },
  {
    id: 'evt-002',
    timestamp: '3 mins ago (14:29:05 UTC)',
    event: 'Document Q&A Query',
    documentName: 'invoice_2024-88492_AWS_Cloud.pdf',
    documentId: 'DOC-88492',
    actor: 'Alex Parker (User)',
    status: 'Success',
    details: 'Query: "What is the total payable amount?" -> Answered in 420ms with citation [P1, H1]',
    logJson: {
      query: 'What is the total payable amount?',
      responseLatencyMs: 420,
      vectorScore: 0.994,
      citedPages: [1],
      model: 'Prashn RAG Engine v2.1'
    }
  },
  {
    id: 'evt-003',
    timestamp: '12 mins ago (14:20:18 UTC)',
    event: 'Batch Ingestion Queued',
    documentName: 'Batch #4109 (3 files: store_014.jpg, form_102.pdf, invoice_01.pdf)',
    actor: 'API Webhook / S3 Drop',
    status: 'Processing',
    details: 'Dispatched to prashn-high-prio SQS queue (visibility 30s)',
    logJson: {
      batchId: 'BATCH-4109',
      sqsQueue: 'arn:aws:sqs:us-east-1:109283948:prashn-high-prio',
      filesCount: 3,
      totalBytes: 4440280
    }
  },
  {
    id: 'evt-004',
    timestamp: '28 mins ago (14:04:12 UTC)',
    event: 'Classification Completed',
    documentName: 'Target_Procurement_Store_489.jpeg',
    documentId: 'DOC-30812',
    actor: 'Classification Engine v2.4',
    status: 'Success',
    details: 'Classified as Receipt (Confidence 98.4%) based on layout and store geometry',
    logJson: {
      predictedClass: 'Receipt',
      confidence: 0.984,
      secondaryClass: 'Invoice',
      secondaryConfidence: 0.012
    }
  },
  {
    id: 'evt-005',
    timestamp: '45 mins ago (13:47:00 UTC)',
    event: 'Extraction Warning',
    documentName: 'Corrupt_Scanned_Voucher_99.png',
    documentId: 'DOC-44810',
    actor: 'Textract Worker #08',
    status: 'Failed',
    details: 'DPI below threshold (72 DPI). Unreadable text segments routed to DLQ',
    logJson: {
      error: 'LowResolutionException',
      detectedDpi: 72,
      minimumRequiredDpi: 150,
      retryCount: 3,
      deadLetterQueue: 'prashn-dlq-failed-jobs'
    }
  },
  {
    id: 'evt-006',
    timestamp: '1 hr ago (13:32:00 UTC)',
    event: 'Document Deleted',
    documentName: 'draft_vendor_agreement_deprecated.pdf',
    actor: 'Alex Parker (User)',
    status: 'Success',
    details: 'Soft-deleted and purged from active Elasticsearch & S3 index',
    logJson: {
      purgedBy: 'alex.parker@enterprise.internal',
      documentId: 'DOC-99120',
      retentionAction: 'soft_delete'
    }
  },
  {
    id: 'evt-007',
    timestamp: '2 hrs ago (12:30:15 UTC)',
    event: 'API Key Generated',
    documentName: 'System / Integration',
    actor: 'Alex Parker (User)',
    status: 'Success',
    details: 'Created scoped key "prod-lambda-ingest-key-2" with write:documents scope',
    logJson: {
      keyPrefix: 'df_live_****',
      scopes: ['write:documents', 'read:status'],
      expiresAt: '2027-10-08T00:00:00Z'
    }
  }
];
