import { DocumentRepository } from '../repositories/document.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { getStorageProvider } from '../storage/storage.factory';
import { randomUUID } from 'crypto';
import { DocumentStatus } from '../types';
import { config } from '../config/env';
import { analyzeDocument } from './pipeline';
import { CloudDocumentDispatcher } from './sqs.processor';

const documents = new DocumentRepository();
const activity = new ActivityRepository();
const storage = getStorageProvider();

export class DocumentProcessor {
  private queued: { id: string; userId: string }[] = [];
  private pending = new Set<string>();
  private active = new Map<string, Promise<void>>();
  private cancelled = new Set<string>();

  async triggerPipeline(id: string, userId: string): Promise<boolean> {
    if (this.pending.has(id)) return false;
    this.pending.add(id);
    try {
      await documents.updateDocument({ id, status: 'Queued', failureReason: null });
      this.queued.push({ id, userId }); this.drain();
      return true;
    } catch (error) { this.pending.delete(id); throw error; }
  }

  async recover(): Promise<void> {
    for (const doc of await documents.findPending()) await this.triggerPipeline(doc.id, doc.userId);
  }

  async cancel(id: string): Promise<void> {
    this.cancelled.add(id);
    this.queued = this.queued.filter(job => job.id !== id);
    await this.active.get(id);
    this.pending.delete(id); this.cancelled.delete(id);
  }

  private drain(): void {
    while (this.queued.length && this.active.size < config.processingConcurrency) {
      const job = this.queued.shift()!;
      const task = this.process(job.id, job.userId).catch(error => console.error('Processing failed:', error)).finally(() => {
        this.active.delete(job.id); this.pending.delete(job.id); this.drain();
      });
      this.active.set(job.id, task);
    }
  }

  private async status(id: string, userId: string, status: DocumentStatus, reason?: string): Promise<void> {
    if (this.cancelled.has(id)) throw new Error('Processing cancelled');
    const doc = await documents.findByIdAndUserId(id, userId);
    if (!doc) throw new Error('Document no longer exists');
    await documents.updateDocument({ id, status, failureReason: reason || null });
    await activity.createEvent({
      id: randomUUID(), userId, timestamp: new Date().toISOString(), event: `Document ${status}`,
      documentName: doc.originalFileName, documentId: id, actor: 'System',
      status: status === 'Failed' ? 'Failed' : status === 'Completed' ? 'Success' : 'Processing',
      details: reason || `Document status changed to ${status}`, createdAt: new Date().toISOString(),
    });
  }

  private async process(id: string, userId: string): Promise<void> {
    const doc = await documents.findByIdAndUserId(id, userId);
    if (!doc || this.cancelled.has(id)) return;
    try {
      await this.status(id, userId, 'Processing');
      await storage.withLocalFile(doc.storageKey, async filePath => {
        const result = await analyzeDocument(filePath, doc, status => this.status(id, userId, status));
        await storage.saveProcessedText(id, result.text);
        const { text: _text, ...content } = result.content;
        await documents.updateDocument({ id, ...result.metadata, ...content });
      });
      await this.status(id, userId, 'Completed');
    } catch (error: any) {
      if (!this.cancelled.has(id)) await this.status(id, userId, 'Failed', error?.message || String(error));
    }
  }
}

export const documentProcessor = config.processingMode === 'sqs' ? new CloudDocumentDispatcher() : new DocumentProcessor();
