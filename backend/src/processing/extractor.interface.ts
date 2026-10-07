export interface ExtractionResult {
  text: string;
  pagesCount: number;
}

export interface DocumentExtractor {
  extractText(filePath: string, mimeType: string): Promise<ExtractionResult>;
}
