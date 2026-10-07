import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { DocumentExtractor, ExtractionResult } from './extractor.interface';

export class LocalExtractor implements DocumentExtractor {
  async extractText(filePath: string, mimeType: string): Promise<ExtractionResult> {
    if (mimeType === 'application/pdf') {
      const dataBuffer = await fs.promises.readFile(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const textResult = await parser.getText();
      return {
        text: textResult.text,
        pagesCount: textResult.total || 1
      };
    } else if (mimeType.startsWith('text/')) {
      const text = await fs.promises.readFile(filePath, 'utf-8');
      return {
        text,
        pagesCount: 1
      };
    } else {
      // Mock for images or unsupported files locally
      // Real AWS Textract would handle images as well.
      console.warn(`LocalExtractor: Mocking text for unsupported mimeType ${mimeType}. Use Textract later.`);
      return {
        text: `Extracted mock text for ${mimeType}. No actual OCR ran because this is a local MVP without an OCR engine. Invoice Number: INV-999. Total: $500.00. Vendor: ImageCorp.`,
        pagesCount: 1
      };
    }
  }
}
