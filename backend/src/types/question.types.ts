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
  documentId: string;
  userId: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citations?: QACitation[];
  createdAt: string;
}
