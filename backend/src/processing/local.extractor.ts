import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { getDocument, PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getLayoutText } from './pdf.layout';
import { createWorker, PSM, Worker } from 'tesseract.js';
import { DocumentExtractor, ExtractionResult } from './extractor.interface';
import { DocumentPage } from '../types';
import { config } from '../config/env';

const clean = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();

export class LocalExtractor implements DocumentExtractor {
  async extractText(filePath: string, mimeType: string): Promise<ExtractionResult> {
    let parser: PDFParse | undefined;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let worker: Worker | undefined;
    const ocr = async (image: string | Buffer) => {
      if (!worker) {
        const english = require('@tesseract.js-data/eng');
        worker = await createWorker(config.ocrLanguage, 1, {
          langPath: config.ocrLangPath || english.langPath,
          cacheMethod: 'none', errorHandler: () => {},
        });
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      }
      const { data } = await worker.recognize(image);
      return { text: clean(data.text), confidence: data.confidence };
    };
    try {
      const pages: DocumentPage[] = [];
      if (mimeType === 'application/pdf') {
        const bytes = await fs.promises.readFile(filePath);
        parser = new PDFParse({ data: bytes });
        loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
        const pdf = await loadingTask.promise;
        if (pdf.numPages > config.maxPages) throw new Error(`PDF exceeds the ${config.maxPages} page limit`);
        for (let page = 1; page <= pdf.numPages; page++) {
          const pdfPage = await pdf.getPage(page);
          const text = clean(await getLayoutText(pdfPage));
          let useOcr = config.forceOcr || text.replace(/[^\p{L}\p{N}]/gu, '').length < 24;
          // Also catch scans with a short selectable title/header over a full-page image.
          if (!useOcr && text.length < 250) {
            const images = await parser.getImage({ partial: [page], imageThreshold: 400, imageDataUrl: false });
            useOcr = images.pages.some(imagePage => imagePage.images.length > 0);
          }
          if (useOcr) {
            const rendered = await parser.getScreenshot({ partial: [page], desiredWidth: 2000, imageDataUrl: false });
            const recognized = await ocr(Buffer.from(rendered.pages[0].data));
            pages.push({ page, text: recognized.text || text, confidence: recognized.confidence, extractionMethod: recognized.text ? 'ocr' : 'text' });
          } else pages.push({ page, text, extractionMethod: 'text' });
          pdfPage.cleanup();
        }
      } else if (['image/png', 'image/jpeg'].includes(mimeType)) {
        pages.push({ page: 1, ...await ocr(filePath), extractionMethod: 'ocr' });
      } else throw new Error('Unsupported document format. Upload a PDF, PNG or JPEG.');
      if (!pages.some(page => /[\p{L}\p{N}]/u.test(page.text))) throw new Error('No readable text was found. Upload a clearer scan or a PDF with selectable text.');
      return { text: pages.map(page => page.text).join('\n\f\n'), pagesCount: pages.length, pages };
    } catch (error: any) {
      if (error?.name === 'PasswordException') throw new Error('PDF is password protected. Upload an unlocked copy.');
      throw new Error(error?.message || String(error));
    } finally {
      try { await parser?.destroy(); } finally {
        try { await loadingTask?.destroy(); } finally { await worker?.terminate(); }
      }
    }
  }
}
