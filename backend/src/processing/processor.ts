import { DocumentRepository } from '../repositories/document.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { getStorageProvider } from '../storage/storage.factory';
import { v4 as uuidv4 } from 'uuid';
import { DocumentStatus } from '../types';
import { LocalExtractor } from './local.extractor';
import { LocalClassifier } from './local.classifier';
import { StructuredFieldExtractor } from './field_extractor';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

const docRepo = new DocumentRepository();
const activityRepo = new ActivityRepository();
const storage = getStorageProvider();
const extractor = new LocalExtractor();
const classifier = new LocalClassifier();
const fieldExtractor = new StructuredFieldExtractor();

export class DocumentProcessor {
  async triggerPipeline(documentId: string, userId: string): Promise<void> {
    this.process(documentId, userId).catch(err => {
      console.error('Processing error for doc', documentId, err);
      this.updateStatus(documentId, userId, 'Failed', 'system', err.message);
    });
  }

  private async updateStatus(id: string, userId: string, status: DocumentStatus, uploaderEmail: string, reason?: string) {
    await docRepo.updateDocument({ id, status, failureReason: reason });
    await activityRepo.createEvent({
      id: uuidv4(),
      userId,
      timestamp: new Date().toISOString(),
      event: 'Status Updated',
      documentName: `Doc ${id}`,
      documentId: id,
      actor: 'System',
      status: status === 'Failed' ? 'Failed' : 'Processing',
      details: reason ? `Failed: ${reason}` : `Document status changed to ${status}`,
      createdAt: new Date().toISOString()
    });
  }

  private async process(documentId: string, userId: string) {
    const doc = await docRepo.findByIdAndUserId(documentId, userId);
    if (!doc) return;

    const email = doc.uploaderName || 'system';
    const startTime = Date.now();

    try {
      // 1. Queued
      await this.updateStatus(documentId, userId, 'Queued', email);
      const filePath = await storage.getFileUrl(doc.storageKey);

      // 2. Processing (Reading / Extracting Text)
      await this.updateStatus(documentId, userId, 'Processing', email);
      const { text, pagesCount } = await extractor.extractText(filePath, doc.mimeType);
      
      // Save raw text to disk for Q&A
      if (!fs.existsSync(config.processedDir)) {
        fs.mkdirSync(config.processedDir, { recursive: true });
      }
      const textPath = path.join(config.processedDir, `${doc.id}.txt`);
      await fs.promises.writeFile(textPath, text);

      await docRepo.updateDocument({ id: documentId, pagesCount });

      // 3. Classifying
      await this.updateStatus(documentId, userId, 'Classifying', email);
      const { type, confidence } = classifier.classify(text);
      
      await docRepo.updateDocument({
        id: documentId,
        documentType: type,
        confidence: confidence * 100
      });

      // 4. Extracting information
      await this.updateStatus(documentId, userId, 'Extracting information', email);
      const { extractedFields, lineItems } = fieldExtractor.extractFields(text, type);

      await docRepo.updateDocument({
        id: documentId,
        extractedFields,
        lineItems
      });

      // 5. Completed
      const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      await this.updateStatus(documentId, userId, 'Completed', email);
      await docRepo.updateDocument({
        id: documentId,
        processingDuration: duration
      });

      await activityRepo.createEvent({
        id: uuidv4(),
        userId,
        timestamp: new Date().toISOString(),
        event: 'Document Processed',
        documentName: doc.originalFileName,
        documentId: documentId,
        actor: 'System',
        status: 'Success',
        details: `Processing completed in ${duration}. Type: ${type}.`,
        createdAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error(error);
      await this.updateStatus(documentId, userId, 'Failed', email, error.message);
    }
  }
}
