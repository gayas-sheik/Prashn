import { DocumentRepository } from '../repositories/document.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { getStorageProvider } from '../storage/storage.factory';
import { randomUUID, createHash } from 'crypto';
import { DocumentStatus } from '../types';
import { LocalExtractor } from './local.extractor';
import { LocalClassifier } from './local.classifier';
import { StructuredFieldExtractor } from './field_extractor';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

const documents = new DocumentRepository();
const activity = new ActivityRepository();
const storage = getStorageProvider();

export class DocumentProcessor {
  private queued: { id: string; userId: string }[] = [];
  private pending = new Set<string>();
  private active = new Map<string, Promise<void>>();
  private cancelled = new Set<string>();

  async triggerPipeline(id: string, userId: string): Promise<void> {
    if (this.pending.has(id)) return;
    this.pending.add(id);
    try {
      await documents.updateDocument({ id, status: 'Queued', failureReason: null });
      this.queued.push({ id, userId }); this.drain();
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
    const started = Date.now();
    try {
      await this.status(id, userId, 'Processing');
      const filePath = await storage.getFileUrl(doc.storageKey);
      const extracted = await new LocalExtractor().extractText(filePath, doc.mimeType);
      await this.status(id, userId, 'Classifying');
      const classified = new LocalClassifier().classify(extracted.text);
      await this.status(id, userId, 'Extracting information');
      const structured = new StructuredFieldExtractor().extractFields(extracted.text, classified.type, extracted.pages);
      // Retain the complete original extraction for inspection and later cloud migration.
      await fs.promises.mkdir(config.processedDir, { recursive: true });
      await fs.promises.writeFile(path.join(config.processedDir, `${id}.txt`), extracted.text, 'utf8');
      const sha256 = createHash('sha256').update(await fs.promises.readFile(filePath)).digest('hex');
      await documents.updateDocument({ id, ...structured, pages: extracted.pages, pagesCount: extracted.pagesCount,
        documentType: classified.type, confidence: Math.round(classified.confidence * 100), sha256,
        extractedSummary: structured.extractedFields.length ? structured.extractedFields.slice(0, 3).map(field => `${field.label}: ${field.value}`).join(' · ') : extracted.text.replace(/\s+/g, ' ').slice(0, 250),
        processingDuration: `${((Date.now() - started) / 1000).toFixed(1)}s`,
      });
      await this.status(id, userId, 'Completed');
    } catch (error: any) {
      if (!this.cancelled.has(id)) await this.status(id, userId, 'Failed', error?.message || String(error));
    }
  }
}

export const documentProcessor = new DocumentProcessor();
