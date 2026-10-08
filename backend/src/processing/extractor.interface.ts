import { DocumentPage } from '../types';
export interface ExtractionResult {
  text: string;
  pagesCount: number;
  pages: DocumentPage[];
}

export interface DocumentExtractor {
  extractText(filePath: string, mimeType: string): Promise<ExtractionResult>;
}
