import type { PDFPageProxy } from 'pdfjs-dist';
import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface Run { text: string; x: number; y: number; width: number; height: number; }

/** Rebuild visual rows instead of trusting the order of PDF drawing instructions. */
export async function getLayoutText(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const runs: Run[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const transformed = Util.transform(viewport.transform, item.transform);
    runs.push({ text: item.str, x: transformed[4], y: transformed[5], width: item.width, height: item.height || 10 });
  }
  runs.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; height: number; runs: Run[] }[] = [];
  for (const run of runs) {
    const previous = rows[rows.length - 1];
    const tolerance = previous ? Math.max(2, Math.min(previous.height, run.height) * 0.25) : 2;
    if (previous && Math.abs(previous.y - run.y) <= tolerance) previous.runs.push(run);
    else rows.push({ y: run.y, height: run.height, runs: [run] });
  }
  return rows.map(row => {
    row.runs.sort((a, b) => a.x - b.x);
    let line = '';
    let previous: Run | undefined;
    for (const run of row.runs) {
      if (previous && run.text === previous.text && Math.abs(run.x - previous.x) < 0.5) continue;
      const gap = previous ? run.x - (previous.x + previous.width) : 0;
      const separator = !previous || /\s$/.test(line) || /^\s/.test(run.text) || gap < 1 ? '' : gap > Math.max(10, Math.min(previous.height, run.height) * 1.2) ? '\t' : ' ';
      line += separator + run.text;
      previous = run;
    }
    return line.trim();
  }).join('\n').trim();
}
