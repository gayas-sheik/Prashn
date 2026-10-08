import type { DocumentItem, QAMessage, StagedUploadFile, ActivityEvent } from '../../types';
import { apiClient, apiResponse, ApiError } from './apiClient';

// Map backend Document shape to frontend DocumentItem shape
function mapDocument(d: any): DocumentItem {
  return {
    ...d,
    name: d.name || d.originalFileName || d.fileName || 'Untitled',
    type: d.type || d.documentType || 'Unknown',
    uploader: d.uploader || d.uploaderName || 'System',
    fileSize: d.fileSize ? (typeof d.fileSize === 'number' ? formatBytes(d.fileSize) : d.fileSize) : d.formattedSize || '—',
    extractedSummary: d.extractedSummary || '',
    confidence: d.confidence || 0,
    processingDuration: d.processingDuration || '',
    s3Uri: d.s3Uri || `local://storage/${d.storageKey || d.id}`,
    sha256: d.sha256 || '',
    pagesCount: d.pagesCount || 1,
    extractedFields: d.extractedFields || [],
    lineItems: d.lineItems || [],
  };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function getDocuments(): Promise<DocumentItem[]> {
  const data = await apiClient('/documents');
  return (data.documents || []).map(mapDocument);
}

export async function getDocument(id: string, signal?: AbortSignal): Promise<DocumentItem | null> {
  try {
    const data = await apiClient(`/documents/${id}`, { signal });
    return mapDocument(data.document);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getDocumentStatus(id: string): Promise<string | null> {
  const doc = await getDocument(id);
  return doc ? doc.status : null;
}

export async function deleteDocument(id: string): Promise<boolean> {
  await apiClient(`/documents/${id}`, { method: 'DELETE' });
  return true;
}

export async function retryDocument(id: string): Promise<DocumentItem | null> {
    await apiClient(`/documents/${id}/retry`, { method: 'POST' });
    return await getDocument(id);
}

export async function uploadDocuments(
  stagedFiles: StagedUploadFile[],
  onProgress?: (fileId: string, progress: number, status: StagedUploadFile['status'], error?: string) => void
): Promise<DocumentItem[]> {
  const newCreatedDocs: DocumentItem[] = [];

  for (const f of stagedFiles) {
    if (!f.file || ['Uploaded', 'Completed'].includes(f.status)) continue;
    
    onProgress?.(f.id, 0, 'Uploading');
    
    const formData = new FormData();
    formData.append('file', f.file);

    try {
      const data = await apiClient('/documents/upload', { method: 'POST', body: formData });
      onProgress?.(f.id, 100, 'Uploaded');
      newCreatedDocs.push(mapDocument(data.document));
    } catch (error) {
      console.error('Upload failed for', f.name, error);
      onProgress?.(f.id, 0, 'Failed', error instanceof Error ? error.message : 'Upload failed');
    }
  }

  return newCreatedDocs;
}

export async function getConversation(documentId: string): Promise<QAMessage[]> {
  const data = await apiClient(`/documents/${documentId}/questions`);
  return data.conversation;
}

export async function askQuestion(documentId: string, question: string): Promise<QAMessage> {
  const data = await apiClient(`/documents/${documentId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ question })
  });
  return data.message;
}

export async function getSuggestedPrompts(documentId: string): Promise<string[]> {
  const doc = await getDocument(documentId);
  if (!doc) return [];
  const prompts = ['Summarize this document', ...doc.extractedFields.slice(0, 4).map(field => `What is the ${field.label.toLowerCase()}?`)];
  if (doc.lineItems?.length) prompts.push('What products are listed?');
  return [...new Set(prompts)];
}

export async function getActivityEvents(): Promise<ActivityEvent[]> {
  const data = await apiClient('/activity');
  return data.events;
}

export const getOriginalBlob = async (id: string): Promise<Blob> => (await apiResponse(`/documents/${id}/file`)).blob();
export async function clearConversation(id: string): Promise<void> {
  await apiClient(`/documents/${id}/questions`, { method: 'DELETE' });
}
