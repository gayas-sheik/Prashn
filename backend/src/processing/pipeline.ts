import fs from 'fs';
import { createHash } from 'crypto';
import { Document, DocumentStatus } from '../types';
import { LocalExtractor } from './local.extractor';
import { LocalClassifier } from './local.classifier';
import { StructuredFieldExtractor } from './field_extractor';

export class DocumentInputError extends Error { constructor(message:string) {super(message);this.name='DocumentInputError';} }
export async function analyzeDocument(filePath: string, document: Document, stage: (status: DocumentStatus) => Promise<void>) {
  const started = Date.now();
  let extracted;
  try { extracted = await new LocalExtractor().extractText(filePath, document.mimeType); }
  catch (error: any) {
    const message=error?.message || '';
    const safe=/^PDF exceeds the \d+ page limit$/.test(message) || ['PDF is password protected. Upload an unlocked copy.',
      'No readable text was found. Upload a clearer scan or a PDF with selectable text.',
      'Unsupported document format. Upload a PDF, PNG or JPEG.'].includes(message);
    throw new DocumentInputError(safe ? message : 'The document could not be read. Upload a valid PDF, PNG or JPEG and retry.');
  }
  await stage('Classifying');
  const classified = new LocalClassifier().classify(extracted.text);
  await stage('Extracting information');
  const structured = new StructuredFieldExtractor().extractFields(extracted.text, classified.type, extracted.pages);
  return {
    text: extracted.text,
    metadata: { documentType: classified.type, confidence: Math.round(classified.confidence * 100),
      sha256: createHash('sha256').update(await fs.promises.readFile(filePath)).digest('hex'),
      pagesCount: extracted.pagesCount,
      extractedSummary: structured.extractedFields.length ? structured.extractedFields.slice(0, 3).map(field => `${field.label}: ${field.value}`).join(' · ').slice(0, 2000) : extracted.text.replace(/\s+/g, ' ').slice(0, 250),
      processingDuration: `${((Date.now() - started) / 1000).toFixed(1)}s` },
    content: { ...structured, pages: extracted.pages, text: extracted.text },
  };
}
