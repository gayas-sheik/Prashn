import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
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
      let best = (await worker.recognize(image)).data;
      const quality = (data: typeof best) => data.confidence * Math.min(1, clean(data.text).replace(/[^\p{L}\p{N}]/gu, '').length / 80);
      // Sideways scans can produce nonempty gibberish. Retry quarter turns only
      // when initial OCR is weak, retaining the most readable candidate.
      if (best.confidence < 50) {
        const source = await loadImage(typeof image === 'string' ? await fs.promises.readFile(image) : image);
        for (const quarterTurns of [1, 2, 3]) {
          // Expand the canvas so turning a portrait page never crops its labels.
          const canvas = createCanvas(quarterTurns % 2 ? source.height : source.width, quarterTurns % 2 ? source.width : source.height);
          const context = canvas.getContext('2d');
          context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate(quarterTurns * Math.PI / 2);
          context.drawImage(source, -source.width / 2, -source.height / 2);
          const candidate = (await worker.recognize(canvas.toBuffer('image/png'))).data;
          if (quality(candidate) > quality(best)) best = candidate;
          if (best.confidence >= 85 && quality(best) >= 85) break;
        }
      }
      return { text: clean(best.text), confidence: best.confidence };
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
