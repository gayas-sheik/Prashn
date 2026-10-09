// Read-only inspection of a user-provided/local real PDF. Private output is ignored.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFParse } = require('pdf-parse');
(async () => {
  const source = path.resolve(process.argv[2]);
  const run = await fs.mkdtemp(path.resolve(__dirname, '../.test-output/final-audit-real-'));
  const bytes = await fs.readFile(source); const checksum = createHash('sha256').update(bytes).digest('hex');
  const parser = new PDFParse({ data: bytes });
  try { const rendered = await parser.getScreenshot({ desiredWidth: 1224, imageDataUrl: false }); for (const page of rendered.pages) await fs.writeFile(path.join(run, `page-${page.pageNumber}.png`), page.data); }
  finally { await parser.destroy(); }
  process.env.OLLAMA_MODEL = '';
  process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('hex');
  const result = await new (require('../dist/processing/local.extractor').LocalExtractor)().extractText(source, 'application/pdf');
  const classification = new (require('../dist/processing/local.classifier').LocalClassifier)().classify(result.text);
  const doc = { originalFileName: 'private-real-document.pdf', documentType: classification.type, pagesCount: result.pagesCount, pages: result.pages, ...new (require('../dist/processing/field_extractor').StructuredFieldExtractor)().extractFields(result.text, classification.type, result.pages) };
  const answers = [];
  for (const question of ['What is the invoice number?', 'What is the total?', 'What is the date?', 'Who is the vendor?', 'What is the customer phone number?']) answers.push({ question, ...await new (require('../dist/processing/document.answerer').ExtractiveDocumentAnswerer)().answer(question, doc) });
  await fs.writeFile(path.join(run, 'private-evidence.json'), JSON.stringify({ checksum, doc, answers }, null, 2));
  if (createHash('sha256').update(await fs.readFile(source)).digest('hex') !== checksum) throw new Error('Source changed');
  console.log(JSON.stringify({ run, pages: result.pagesCount, methods: result.pages.map(p => p.extractionMethod), classification, fields: doc.extractedFields.length, originalUnchanged: true }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
