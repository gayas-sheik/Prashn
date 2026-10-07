import { DocumentType } from '../types';

export interface ClassificationResult {
  type: DocumentType;
  confidence: number;
}

export interface DocumentClassifier {
  classify(text: string): ClassificationResult;
}
