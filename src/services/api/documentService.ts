import type { DocumentItem, QAMessage, StagedUploadFile, ActivityEvent } from '../../types';
import { apiClient, getAuthToken } from './apiClient';

export async function getDocuments(): Promise<DocumentItem[]> {
  const data = await apiClient('/documents');
  return data.documents;
}

export async function getDocument(id: string): Promise<DocumentItem | null> {
  try {
    const data = await apiClient(`/documents/${id}`);
    return data.document;
  } catch (error) {
    return null;
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
  try {
    await apiClient(`/documents/${id}/retry`, { method: 'POST' });
    return await getDocument(id);
  } catch (error) {
    return null;
  }
}

export async function uploadDocuments(
  stagedFiles: StagedUploadFile[],
  onProgress?: (fileId: string, progress: number, status: StagedUploadFile['status']) => void
): Promise<DocumentItem[]> {
  const newCreatedDocs: DocumentItem[] = [];

  for (const f of stagedFiles) {
    if (!f.file) continue;
    
    onProgress?.(f.id, 25, 'Uploading');
    
    const formData = new FormData();
    formData.append('file', f.file);

    try {
      const token = await getAuthToken();
      // Using raw XHR or fetch doesn't give fine-grained progress easily without custom hook,
      // We will simulate the progress events for UX, then await fetch.
      onProgress?.(f.id, 65, 'Uploading');
      
      const response = await fetch('http://localhost:5000/api/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      
      onProgress?.(f.id, 100, 'Completed');
      newCreatedDocs.push(data.document);
    } catch (error) {
      console.error('Upload failed for', f.name, error);
      onProgress?.(f.id, 0, 'Failed');
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
  return [
    "What is the total amount?",
    "Who is the vendor?",
    "Extract all line items."
  ];
}

export async function getActivityEvents(): Promise<ActivityEvent[]> {
  const data = await apiClient('/activity');
  return data.events;
}
