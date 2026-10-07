export interface ActivityEvent {
  id: string;
  userId: string;
  timestamp: string;
  event: string;
  documentName: string;
  documentId?: string;
  actor: string;
  status: 'Success' | 'Processing' | 'Failed' | 'Warning';
  details: string;
  logJson?: Record<string, any>;
  createdAt: string;
}
