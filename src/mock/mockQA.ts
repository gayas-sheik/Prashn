import type { QACitation, QAMessage } from '../types';

export const mockCitations: Record<string, QACitation[]> = {
  'DOC-88492': [
    {
      id: 'cit-1',
      source: 'INV-2024-88492_AWS_Cloud.pdf',
      page: 1,
      section: 'Header Block — Billing Period & Invoice ID',
      snippet: 'Invoice Number: INV-88492-US | Billing Period: Oct 1 - Oct 31, 2026 | Due Date: Nov 23, 2026 | Total Amount: $12,840.50 USD',
      confidence: 99.8
    },
    {
      id: 'cit-2',
      source: 'INV-2024-88492_AWS_Cloud.pdf',
      page: 2,
      section: 'Line Item 5 — Amazon Textract Ingestion pricing',
      snippet: 'Amazon Textract Document API | Layout Analysis API | 128,400 pages @ $0.05/page = $6,420.00 USD (50.0% of total)',
      confidence: 99.7
    },
    {
      id: 'cit-3',
      source: 'INV-2024-88492_AWS_Cloud.pdf',
      page: 4,
      section: 'Remittance Instructions & Bank Wire details',
      snippet: 'Remittance to JPMorgan Chase Bank, N.A., Routing: 021000021, Account: ****-9921-AWS, Ref: INV-88492-US',
      confidence: 99.9
    }
  ],
  'DOC-10450': [
    {
      id: 'cit-10',
      source: 'invoice_oct_01.pdf',
      page: 1,
      section: 'Header Summary',
      snippet: 'Vendor: ABC Technologies Pvt Ltd | Invoice No: INV-1045 | Payable: ₹48,500 INR | Due Date: Oct 15, 2026',
      confidence: 99.9
    }
  ]
};

export const mockInitialMessages: Record<string, QAMessage[]> = {
  'DOC-88492': [
    {
      id: 'msg-1',
      sender: 'user',
      text: 'What is the total amount due and who is the vendor?',
      timestamp: '14:24 UTC'
    },
    {
      id: 'msg-2',
      sender: 'assistant',
      text: 'The total amount due is **$12,840.50 USD**, payable to **Amazon Web Services, Inc.** by **November 23, 2026**.',
      timestamp: '14:24 UTC',
      citations: [
        {
          id: 'cit-1',
          source: 'INV-2024-88492_AWS_Cloud.pdf',
          page: 1,
          section: 'Header Key-Values',
          snippet: 'Total Amount: $12,840.50 USD | Remit to: Amazon Web Services, Inc. | Due Date: Nov 23, 2026',
          confidence: 99.8
        }
      ]
    },
    {
      id: 'msg-3',
      sender: 'user',
      text: 'What was the single largest expense in the line items?',
      timestamp: '14:26 UTC'
    },
    {
      id: 'msg-4',
      sender: 'assistant',
      text: 'The largest single expense is **Amazon Textract Document API** layout analysis at **$6,420.00 USD** (128,400 pages processed at $0.05/page), accounting for 50.0% of the total bill.',
      timestamp: '14:26 UTC',
      citations: [
        {
          id: 'cit-2',
          source: 'INV-2024-88492_AWS_Cloud.pdf',
          page: 2,
          section: 'Line Items Table',
          snippet: 'Amazon Textract Document API: 128,400 pages @ $0.05 = $6,420.00 USD',
          confidence: 99.7
        }
      ]
    },
    {
      id: 'msg-5',
      sender: 'user',
      text: 'Are there bank remittance instructions provided?',
      timestamp: '14:28 UTC'
    },
    {
      id: 'msg-6',
      sender: 'assistant',
      text: 'Yes. Remittance details specify ACH / Wire transfer to **JPMorgan Chase Bank, N.A.**, Account Routing `021000021`, Account No. `****-9921-AWS`. Reference ID `INV-88492-US`.',
      timestamp: '14:28 UTC',
      citations: [
        {
          id: 'cit-3',
          source: 'INV-2024-88492_AWS_Cloud.pdf',
          page: 4,
          section: 'Payment Section',
          snippet: 'ACH/Wire: JPMorgan Chase Bank, N.A. | Routing 021000021 | Acct ****-9921-AWS | Ref INV-88492-US',
          confidence: 99.9
        }
      ]
    }
  ],
  'DOC-10450': [
    {
      id: 'msg-101',
      sender: 'user',
      text: 'What is the total amount?',
      timestamp: '14:22 UTC'
    },
    {
      id: 'msg-102',
      sender: 'assistant',
      text: 'The total amount is **₹48,500 INR**.',
      timestamp: '14:22 UTC',
      citations: [
        {
          id: 'cit-10',
          source: 'invoice_oct_01.pdf',
          page: 1,
          section: 'Summary Header',
          snippet: 'Invoice Total: ₹48,500 INR',
          confidence: 99.9
        }
      ]
    },
    {
      id: 'msg-103',
      sender: 'user',
      text: 'Who is the vendor?',
      timestamp: '14:23 UTC'
    },
    {
      id: 'msg-104',
      sender: 'assistant',
      text: 'The vendor is **ABC Technologies Pvt Ltd**.',
      timestamp: '14:23 UTC',
      citations: [
        {
          id: 'cit-10',
          source: 'invoice_oct_01.pdf',
          page: 1,
          section: 'Vendor Details',
          snippet: 'Vendor: ABC Technologies Pvt Ltd',
          confidence: 99.8
        }
      ]
    }
  ]
};

export const mockSuggestedPrompts: Record<string, string[]> = {
  'DOC-88492': [
    'What is the total amount payable and due date?',
    'Break down the top 3 highest AWS cost items.',
    'What are the wire transfer payment instructions?',
    'Does this invoice include any late fees or tax discrepancies?'
  ],
  'DOC-10450': [
    'What is the total amount and due date?',
    'Who is the vendor and what is their GST number?',
    'Are there any terms and conditions specified?'
  ],
  'default': [
    'What is the main purpose of this document?',
    'Summarize all extracted key-value pairs.',
    'Are there any validation warnings or errors in this document?'
  ]
};
