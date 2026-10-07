import type { DocumentItem } from '../types';

export const mockDocuments: DocumentItem[] = [
  {
    id: 'DOC-88492',
    name: 'INV-2024-88492_AWS_Cloud.pdf',
    type: 'Invoice',
    status: 'Completed',
    uploadDate: 'Oct 8, 2026, 14:22 UTC',
    uploader: 'Alex Parker',
    fileSize: '4.2 MB',
    processingDuration: '1.8s',
    confidence: 99.82,
    extractedSummary: '$12,840.50 · Amazon Web Services',
    s3Uri: 's3://prashn-vault-east1/invoices/2024/10/INV-2024-88492.pdf',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    pagesCount: 4,
    extractedFields: [
      { label: 'Vendor Name', value: 'Amazon Web Services, Inc.', confidence: 99.9, boundingBox: { x: 45, y: 80, width: 220, height: 24 } },
      { label: 'Invoice Number', value: 'INV-88492-US', confidence: 99.8, boundingBox: { x: 420, y: 80, width: 140, height: 24 } },
      { label: 'Billing Period', value: 'Oct 1 - Oct 31, 2026', confidence: 99.5, boundingBox: { x: 420, y: 110, width: 160, height: 20 } },
      { label: 'Issue Date', value: 'Oct 24, 2026', confidence: 99.7, boundingBox: { x: 420, y: 135, width: 110, height: 20 } },
      { label: 'Payment Due Date', value: 'Nov 23, 2026', confidence: 99.6, boundingBox: { x: 420, y: 160, width: 120, height: 20 } },
      { label: 'Total Amount', value: '$12,840.50 USD', confidence: 99.9, boundingBox: { x: 430, y: 460, width: 130, height: 28 } },
      { label: 'Tax (GST/VAT)', value: '$1,155.65 USD', confidence: 99.4, boundingBox: { x: 430, y: 435, width: 120, height: 20 } },
      { label: 'Currency', value: 'USD ($)', confidence: 100.0, boundingBox: { x: 45, y: 460, width: 90, height: 20 } },
      { label: 'Account ID', value: '1092-4820-9921', confidence: 99.2, boundingBox: { x: 45, y: 110, width: 140, height: 20 } },
      { label: 'Tax ID / EIN', value: 'WA-91-1829401', confidence: 98.9, boundingBox: { x: 45, y: 135, width: 130, height: 20 } }
    ],
    lineItems: [
      {
        id: 'li-1',
        description: 'Amazon Elastic Compute Cloud (EC2)',
        serviceUsage: 'us-east-1 compute instances (c6i.4xlarge)',
        quantity: '744 Hrs',
        unitPrice: '$4.25',
        amount: '$3,162.00'
      },
      {
        id: 'li-2',
        description: 'Amazon Relational Database Service (RDS)',
        serviceUsage: 'Multi-AZ PostgreSQL cluster (db.r6g.2xlarge)',
        quantity: '744 Hrs',
        unitPrice: '$2.80',
        amount: '$2,083.20'
      },
      {
        id: 'li-3',
        description: 'Amazon Simple Storage Service (S3)',
        serviceUsage: 'Standard storage tier & API ingestion requests',
        quantity: '48.2 TB',
        unitPrice: '$0.023/GB',
        amount: '$1,108.60'
      },
      {
        id: 'li-4',
        description: 'AWS Lambda Ingestion Workers',
        serviceUsage: 'Serverless document OCR trigger functions',
        quantity: '14,200,000',
        unitPrice: '$0.000016',
        amount: '$227.20'
      },
      {
        id: 'li-5',
        description: 'Amazon Textract Document API',
        serviceUsage: 'Layout Analysis & Key-Value extraction API',
        quantity: '128,400 pages',
        unitPrice: '$0.05',
        amount: '$6,420.00'
      }
    ]
  },
  {
    id: 'DOC-10450',
    name: 'invoice_oct_01.pdf',
    type: 'Invoice',
    status: 'Completed',
    uploadDate: 'Oct 8, 2026, 14:22 UTC',
    uploader: 'Alex Parker',
    fileSize: '2.4 MB',
    processingDuration: '1.8s',
    confidence: 99.6,
    extractedSummary: '₹48,500 · ABC Technologies (INV-1045)',
    s3Uri: 's3://prashn-vault-east1/invoices/2024/10/invoice_oct_01.pdf',
    sha256: '4a6b29d9e847123984ab182e01a884d84c19203948571829034871928374aefb',
    pagesCount: 2,
    extractedFields: [
      { label: 'Vendor Name', value: 'ABC Technologies Pvt Ltd', confidence: 99.8 },
      { label: 'Invoice Number', value: 'INV-1045', confidence: 99.7 },
      { label: 'Issue Date', value: 'Oct 01, 2026', confidence: 99.4 },
      { label: 'Total Amount', value: '₹48,500 INR', confidence: 99.9 },
      { label: 'GST Number', value: '29ABCDE1234F1Z5', confidence: 98.7 }
    ]
  },
  {
    id: 'DOC-30812',
    name: 'receipt_store_08.jpg',
    type: 'Receipt',
    status: 'Processing',
    uploadDate: 'Oct 8, 2026, 14:18 UTC',
    uploader: 'Alex Parker',
    fileSize: '1.2 MB',
    processingDuration: '3.1s active',
    confidence: 94.2,
    extractedSummary: 'Extracting lines... (Target Store #489)',
    s3Uri: 's3://prashn-vault-east1/receipts/2024/10/receipt_store_08.jpg',
    sha256: 'c984920485920394857102948571029348571029384750192834759102938475',
    pagesCount: 1,
    extractedFields: [
      { label: 'Store Name', value: 'Target Procurement Store #489', confidence: 97.4 },
      { label: 'Date', value: 'Oct 08, 2026', confidence: 95.1 }
    ]
  },
  {
    id: 'DOC-91823',
    name: 'vendor_agreement_rev2.pdf',
    type: 'Form',
    status: 'Completed',
    uploadDate: 'Oct 8, 2026, 11:05 UTC',
    uploader: 'Alex Parker',
    fileSize: '3.8 MB',
    processingDuration: '2.4s',
    confidence: 98.4,
    extractedSummary: '18 fields parsed · CloudTech Master Services',
    s3Uri: 's3://prashn-vault-east1/contracts/2024/10/vendor_agreement_rev2.pdf',
    sha256: '7102938475910293847591029384759102938475910293847591029384759102',
    pagesCount: 8,
    extractedFields: [
      { label: 'Document Title', value: 'Master Services Agreement', confidence: 99.1 },
      { label: 'Party A', value: 'CloudTech Solutions Ltd.', confidence: 99.5 },
      { label: 'Party B', value: 'Apex Enterprise Infrastructure Inc.', confidence: 99.3 },
      { label: 'Effective Date', value: 'Nov 01, 2026', confidence: 98.9 },
      { label: 'Governing Law', value: 'State of Delaware, USA', confidence: 97.8 }
    ]
  },
  {
    id: 'DOC-44810',
    name: 'application_form_claim.pdf',
    type: 'Form',
    status: 'Failed',
    uploadDate: 'Oct 7, 2026, 19:40 UTC',
    uploader: 'Alex Parker',
    fileSize: '840 KB',
    processingDuration: '4.2s',
    confidence: 62.1,
    extractedSummary: 'Unreadable resolution (< 72 DPI)',
    failureReason: 'DPI below minimum threshold (72 DPI detected, 150 DPI required). Unreadable characters routed to DLQ.',
    s3Uri: 's3://prashn-vault-east1/forms/2024/10/application_form_claim.pdf',
    sha256: '1829384756102938475610293847561029384756102938475610293847561029',
    pagesCount: 1,
    extractedFields: []
  },
  {
    id: 'DOC-88210',
    name: 'purchase_order_8821.pdf',
    type: 'Invoice',
    status: 'Completed',
    uploadDate: 'Oct 7, 2026, 16:15 UTC',
    uploader: 'Alex Parker',
    fileSize: '1.9 MB',
    processingDuration: '1.6s',
    confidence: 99.1,
    extractedSummary: '$12,490.00 · Dell Enterprise Servers',
    s3Uri: 's3://prashn-vault-east1/invoices/2024/10/purchase_order_8821.pdf',
    sha256: '8475910293847591029384759102938475910293847591029384759102938475',
    pagesCount: 3,
    extractedFields: [
      { label: 'Vendor Name', value: 'Dell Technologies Enterprise', confidence: 99.8 },
      { label: 'PO Number', value: 'PO-8821-DEL', confidence: 99.5 },
      { label: 'Total Amount', value: '$12,490.00 USD', confidence: 99.7 }
    ]
  },
  {
    id: 'DOC-55918',
    name: 'receipt_supermarket.jpg',
    type: 'Receipt',
    status: 'Completed',
    uploadDate: 'Oct 7, 2026, 12:30 UTC',
    uploader: 'Alex Parker',
    fileSize: '950 KB',
    processingDuration: '1.2s',
    confidence: 98.0,
    extractedSummary: '$240.50 · Whole Foods Market',
    s3Uri: 's3://prashn-vault-east1/receipts/2024/10/receipt_supermarket.jpg',
    sha256: '9384750192837495019283749501928374950192837495019283749501928374',
    pagesCount: 1,
    extractedFields: [
      { label: 'Merchant', value: 'Whole Foods Market #1029', confidence: 98.9 },
      { label: 'Total', value: '$240.50 USD', confidence: 99.2 }
    ]
  },
  {
    id: 'DOC-77291',
    name: 'tax_statement_q3.pdf',
    type: 'Form',
    status: 'Queued',
    uploadDate: 'Oct 7, 2026, 09:12 UTC',
    uploader: 'Alex Parker',
    fileSize: '5.1 MB',
    processingDuration: 'Queued',
    confidence: 0,
    extractedSummary: 'Waiting in SQS prashn-standard-queue',
    s3Uri: 's3://prashn-vault-east1/forms/2024/10/tax_statement_q3.pdf',
    sha256: '0192837465019283746501928374650192837465019283746501928374650192',
    pagesCount: 6,
    extractedFields: []
  }
];
