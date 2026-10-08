const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pdf, invoicePages, image } = require('./fixtures.cjs');
const output = path.resolve(__dirname, '../.test-output');
let run;
let extractor;
let structured;
let answerer;
let invoice;
let server;
let base;
let token;
let otherToken;
let uploadedId;
let scan;

before(async () => {
  await fs.mkdir(output, { recursive: true });
  run = await fs.mkdtemp(path.join(output, 'run-'));
  process.env.DB_FILE = path.join(run, 'test.db');
  process.env.UPLOAD_DIR = path.join(run, 'uploads');
  process.env.PROCESSED_DIR = path.join(run, 'processed');
  process.env.OLLAMA_MODEL = '';
  extractor = new (require('../dist/processing/local.extractor').LocalExtractor)();
  structured = new (require('../dist/processing/field_extractor').StructuredFieldExtractor)();
  answerer = new (require('../dist/processing/document.answerer').ExtractiveDocumentAnswerer)();
  const digital = path.join(run, 'invoice.pdf');
  await fs.writeFile(digital, pdf(invoicePages));
  const result = await extractor.extractText(digital, 'application/pdf');
  invoice = { id: 'fixture', originalFileName: 'invoice.pdf', documentType: 'Invoice', pages: result.pages, pagesCount: result.pagesCount, ...structured.extractFields(result.text, 'Invoice', result.pages) };
  scan = image();
});

test('digital multipage PDF preserves text, columns, fields, currency and line items', () => {
  assert.equal(invoice.pagesCount, 2);
  assert.equal(invoice.pages[1].page, 2);
  assert.match(invoice.pages[1].text, /Warranty covers/);
  assert.ok(!invoice.pages[0].text.includes('-- 1 of'));
  const field = label => invoice.extractedFields.find(field => field.label === label);
  assert.equal(field('Invoice Number').value, 'INV-2026-001');
  assert.equal(field('Total').value, 'USD 1,210.00');
  assert.equal(field('Subtotal').value, 'USD 1,100.00');
  assert.equal(field('Tax').page, 2);
  assert.equal(invoice.lineItems.length, 2);
  assert.equal(invoice.lineItems[0].quantity, '2');
});

test('structured extraction never invents amounts, OCR corrections, or currency', () => {
  const missing = structured.extractFields('INVOICE\nTout sco\nGrand Total:\nXYZ Seller', 'Invoice');
  assert.ok(!missing.extractedFields.some(field => field.label === 'Total'));
  const inr = structured.extractFields('INVOICE\nInvoice #: INV-4\nVendor: भारतीय कंपनी\nSubtotal: ₹10,000\nTax (18%): ₹1,800\nTotal: ₹11,800\nDiscount: 0', 'Invoice');
  assert.equal(inr.extractedFields.find(field => field.label === 'Total').value, '₹11,800');
  assert.equal(inr.extractedFields.find(field => field.label === 'Discount').value, '0');
  assert.equal(inr.extractedFields.find(field => field.label === 'Tax Rate').value, '18%');
  const named = structured.extractFields('INVOICE\nVendor Name: Example Technologies\nCustomer Name: Jane Smith\nInvoice No.: A-1', 'Invoice');
  assert.equal(named.extractedFields.find(field => field.label === 'Vendor / Seller').value, 'Example Technologies');
  assert.equal(named.extractedFields.find(field => field.label === 'Bill To').value, 'Jane Smith');
  const form = structured.extractFields('Name: Jane Doe\nAddress: 10 Main Road\nDOB: 1990-01-01', 'Form');
  assert.equal(form.extractedFields.find(field => field.label === 'Name').value, 'Jane Doe');
});

test('Q&A keeps invoice date distinct from due date and answers form names', async () => {
  const pages = [{ page: 1, text: 'INVOICE\nInvoice Date: 2026-10-09\nDue Date: 2026-11-09\nSubtotal: INR 100\nEmail Address: vendor@example.com', extractionMethod: 'text' }];
  const doc = { originalFileName: 'dates.pdf', documentType: 'Invoice', pages, pagesCount: 1, ...structured.extractFields(pages[0].text, 'Invoice', pages) };
  assert.match((await answerer.answer('What is the date?', doc)).text, /2026-10-09/);
  assert.match((await answerer.answer('What is the due date?', doc)).text, /2026-11-09/);
  assert.match((await answerer.answer('How much before tax?', doc)).text, /INR 100/);
  assert.match((await answerer.answer('What is the email address?', doc)).text, /vendor@example.com/);
  const formPages = [{ page: 1, text: 'Name: Jane Doe\nDOB: 1990-01-01', extractionMethod: 'text' }];
  const form = { originalFileName: 'form.pdf', documentType: 'Form', pages: formPages, pagesCount: 1, ...structured.extractFields(formPages[0].text, 'Form', formPages) };
  assert.match((await answerer.answer('What is the name on this form?', form)).text, /Jane Doe/);
});

test('Q&A answers fields, named and ordinal items, full text and absent questions', async () => {
  const cases = [
    ['What is the total amount?', /1,210\.00/], ['What is the subtotal?', /1,100\.00/],
    ['What is the tax amount?', /110\.00/], ['Who issued this invoice?', /ABC Technologies/],
    ['How many laptops were purchased?', /2 Laptops/], ["What is the second item's price?", /100\.00/],
    ['What products are listed?', /Laptops[\s\S]*Monitor/], ['What does the warranty cover?', /manufacturing defects/],
  ];
  for (const [question, expected] of cases) {
    const result = await answerer.answer(question, invoice);
    assert.match(result.text, expected, question);
    assert.ok(result.citations.length, `Missing citation: ${question}`);
    for (const citation of result.citations) assert.ok(invoice.pages.find(page => page.page === citation.page)?.text.includes(citation.snippet));
  }
  const tax = await answerer.answer('What is the tax?', invoice);
  assert.equal(tax.citations[0].page, 2);
  for (const question of ["What is the vendor's age?", 'What is the favourite color of the vendor?', 'What is the fourth item price?', 'How many printers were purchased?']) {
    assert.equal((await answerer.answer(question, invoice)).text, require('../dist/processing/document.answerer').NOT_FOUND, question);
  }
});

test('PNG and JPEG use real offline OCR; mixed scanned PDF is OCRed page by page', async () => {
  for (const [name, data, mime] of [['scan.png', scan.png, 'image/png'], ['scan.jpg', scan.jpeg, 'image/jpeg']]) {
    const file = path.join(run, name); await fs.writeFile(file, data);
    const result = await extractor.extractText(file, mime);
    assert.match(result.text, /SCAN-123/); assert.match(result.text, /110\.00/);
    assert.equal(result.pages[0].extractionMethod, 'ocr');
  }
  const mixed = path.join(run, 'mixed.pdf');
  await fs.writeFile(mixed, pdf([invoicePages[0], scan]));
  const result = await extractor.extractText(mixed, 'application/pdf');
  assert.equal(result.pagesCount, 2); assert.equal(result.pages[0].extractionMethod, 'text');
  assert.equal(result.pages[1].extractionMethod, 'ocr'); assert.match(result.pages[1].text, /SCAN-123/);
});

test('blank images, corrupt PDFs and unsupported formats report failures', async () => {
  const blank = path.join(run, 'blank.png'); await fs.writeFile(blank, image(true).png);
  await assert.rejects(extractor.extractText(blank, 'image/png'), /No readable text/);
  const corrupt = path.join(run, 'corrupt.pdf'); await fs.writeFile(corrupt, 'not a PDF');
  await assert.rejects(extractor.extractText(corrupt, 'application/pdf'));
  await assert.rejects(extractor.extractText(corrupt, 'application/msword'), /Unsupported/);
});

test('API upload, processing, auth isolation, original bytes, Q&A, retry and delete', async () => {
  const app = require('../dist/app').default;
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.workspace, path.basename(path.resolve(__dirname, '../..')));
  assert.equal(health.extractionVersion, 'layout-fields-v2');
  assert.equal(health.qaMode, 'extractive');
  const request = async (endpoint, options = {}, auth = token) => {
    const headers = { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...options.headers };
    return fetch(base + endpoint, { ...options, headers });
  };
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const email of ['one@example.com', 'two@example.com']) {
    assert.equal((await request('/auth/register', json({ email, password: 'testpass123', fullName: email }), '')).status, 201);
    const login = await (await request('/auth/login', json({ email, password: 'testpass123' }), '')).json();
    if (!token) token = login.token; else otherToken = login.token;
  }
  const body = new FormData(); body.append('file', new Blob([pdf(invoicePages)], { type: 'application/pdf' }), 'invoice.pdf');
  const response = await request('/documents/upload', { method: 'POST', body });
  assert.equal(response.status, 201); const uploaded = await response.json(); uploadedId = uploaded.document.id;
  let doc;
  for (let attempt = 0; attempt < 100; attempt++) {
    doc = (await (await request(`/documents/${uploadedId}`)).json()).document;
    if (['Completed','Failed'].includes(doc.status)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(doc.status, 'Completed', doc.failureReason);
  assert.equal(doc.pages.length, 2); assert.equal(doc.lineItems.length, 2); assert.equal(doc.sha256.length, 64);
  assert.match(await fs.readFile(path.join(run, 'processed', `${uploadedId}.txt`), 'utf8'), /Warranty covers/);
  for (const endpoint of [`/documents/${uploadedId}`, `/documents/${uploadedId}/file`, `/documents/${uploadedId}/questions`]) assert.equal((await request(endpoint, {}, otherToken)).status, 404);
  const original = await request(`/documents/${uploadedId}/file`);
  assert.equal(original.status, 200);
  assert.equal(original.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), pdf(invoicePages));
  const answer = await (await request(`/documents/${uploadedId}/questions`, json({ question: 'What is the tax?' }))).json();
  assert.equal(answer.message.citations[0].page, 2);
  assert.equal((await request(`/documents/${uploadedId}/questions`, json({ question: ['bad'] }))).status, 400);
  assert.equal((await request(`/documents/${uploadedId}/questions`, { method: 'DELETE' })).status, 200);
  assert.equal((await (await request(`/documents/${uploadedId}/questions`)).json()).conversation.length, 0);
  assert.equal((await request(`/documents/${uploadedId}/retry`, { method: 'POST' })).status, 200);
  assert.equal((await request(`/documents/${uploadedId}/retry`, { method: 'POST' })).status, 409);
  assert.equal((await request(`/documents/${uploadedId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request(`/documents/${uploadedId}`)).status, 404);
  await assert.rejects(fs.stat(path.join(run, 'processed', `${uploadedId}.txt`)));
  const db = await require('../dist/database/db').getDb();
  assert.equal((await db.get('SELECT count(*) AS n FROM qa_messages WHERE documentId = ?', uploadedId)).n, 0);
  const bad = new FormData(); bad.append('file', new Blob(['bad'], { type: 'text/plain' }), 'bad.txt');
  assert.equal((await request('/documents/upload', { method: 'POST', body: bad })).status, 415);
  const metrics = await (await request('/documents/metrics', {}, otherToken)).json();
  assert.equal(metrics.metrics.total, 0);
  assert.equal((await request('/auth/register', json({ email: ['invalid'], password: 123, fullName: {} }), '')).status, 400);
});

test('API batch uploads, extraction failures, pending recovery and page limits', async () => {
  const repo = new (require('../dist/repositories/document.repository').DocumentRepository)();
  const processor = require('../dist/processing/processor').documentProcessor;
  const request = (endpoint, options = {}) => fetch(base + endpoint, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const batch = new FormData();
  batch.append('files', new Blob([pdf(invoicePages)], { type: 'application/pdf' }), 'one.pdf');
  batch.append('files', new Blob([pdf(invoicePages)], { type: 'application/pdf' }), 'two.pdf');
  const response = await request('/documents/upload-multiple', { method: 'POST', body: batch });
  assert.equal(response.status, 201);
  const docs = (await response.json()).documents;
  assert.equal(docs.length, 2); assert.notEqual(docs[0].id, docs[1].id);
  const wait = async id => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const doc = (await (await request(`/documents/${id}`)).json()).document;
      if (['Completed','Failed'].includes(doc.status)) return doc;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Processing timed out');
  };
  for (const doc of docs) assert.equal((await wait(doc.id)).status, 'Completed');
  // Simulate an interrupted worker using its existing persisted upload.
  await processor.cancel(docs[0].id);
  await repo.updateDocument({ id: docs[0].id, status: 'Processing' });
  const blocked = await request(`/documents/${docs[0].id}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is the total?' }) });
  assert.equal(blocked.status, 409);
  await processor.recover();
  assert.equal((await wait(docs[0].id)).status, 'Completed');
  const corrupt = new FormData(); corrupt.append('file', new Blob(['invalid PDF'], { type: 'application/pdf' }), 'broken.pdf');
  const broken = (await (await request('/documents/upload', { method: 'POST', body: corrupt })).json()).document;
  const failed = await wait(broken.id);
  assert.equal(failed.status, 'Failed'); assert.ok(failed.failureReason);
  const config = require('../dist/config/env').config;
  const previousLimit = config.maxPages; config.maxPages = 1;
  try { await assert.rejects(extractor.extractText(path.join(run, 'invoice.pdf'), 'application/pdf'), /page limit/); }
  finally { config.maxPages = previousLimit; }
  for (const doc of [...docs, broken]) assert.equal((await request(`/documents/${doc.id}`, { method: 'DELETE' })).status, 200);
});

test('API rejects invalid sessions, oversized batches and files, and restores legacy page content', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const request = (endpoint, options = {}, auth = headers) => fetch(base + endpoint, { ...options, headers: { ...auth, ...options.headers } });
  assert.equal((await request('/documents', {}, {})).status, 401);
  assert.equal((await request('/documents', {}, { Authorization: 'Bearer invalid-token' })).status, 401);
  assert.equal((await request(`/documents?token=${token}`, {}, {})).status, 401);
  const oversized = new FormData();
  oversized.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  const tooLarge = await request('/documents/upload', { method: 'POST', body: oversized });
  assert.equal(tooLarge.status, 413); assert.match((await tooLarge.json()).error, /10 MB/);
  const crowded = new FormData();
  for (let index = 0; index < 21; index++) crowded.append('files', new Blob([pdf(invoicePages)], { type: 'application/pdf' }), `file-${index}.pdf`);
  assert.equal((await request('/documents/upload-multiple', { method: 'POST', body: crowded })).status, 400);
  const fresh = new FormData(); fresh.append('file', new Blob([pdf(invoicePages)], { type: 'application/pdf' }), 'legacy.pdf');
  const id = (await (await request('/documents/upload', { method: 'POST', body: fresh })).json()).document.id;
  const wait = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const doc = (await (await request(`/documents/${id}`)).json()).document;
      if (doc.status === 'Completed') return doc;
      if (doc.status === 'Failed') throw new Error(doc.failureReason);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Processing timed out');
  };
  await wait();
  const db = await require('../dist/database/db').getDb();
  await db.run('UPDATE documents SET pages = NULL WHERE id = ?', id);
  const question = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is the total?' }) };
  const missingContent = await request(`/documents/${id}/questions`, question);
  assert.equal(missingContent.status, 409); assert.match((await missingContent.json()).error, /Reprocess/);
  assert.equal((await request(`/documents/${id}/retry`, { method: 'POST' })).status, 200);
  assert.equal((await wait()).pages.length, 2);
  assert.equal((await request(`/documents/${id}/questions`, question)).status, 201);
  assert.equal((await request(`/documents/${id}`, { method: 'DELETE' }, { Authorization: `Bearer ${otherToken}` })).status, 404);
  assert.equal((await (await request('/activity', {}, { Authorization: `Bearer ${otherToken}` })).json()).events.length, 0);
  assert.equal((await request(`/documents/${id}`, { method: 'DELETE' })).status, 200);
});

test('PDF drawing order does not corrupt side-by-side invoice fields or ordinary cost questions', async () => {
  const file = path.join(run, 'values-before-labels.pdf');
  await fs.writeFile(file, pdf([{ valuesFirst: true, rows: ['Tax Invoice', ['Invoice No.', 'TEST-90210'], ['Invoice Date', 'Aug 25th 2026, 8:21 PM'], ['State', 'Example State'], ['Customer Name', 'Example Customer'], 'Customer Pick Up Address', '10 Test Street', ['Total Amount', 'USD 36.00']] }]));
  const result = await extractor.extractText(file, 'application/pdf');
  const doc = { originalFileName: 'values-before-labels.pdf', documentType: 'Invoice', pages: result.pages, pagesCount: result.pagesCount, ...structured.extractFields(result.text, 'Invoice', result.pages) };
  assert.equal(doc.extractedFields.find(field => field.label === 'Invoice Number').value, 'TEST-90210');
  assert.equal(doc.extractedFields.find(field => field.label === 'Invoice Date').value, 'Aug 25th 2026, 8:21 PM');
  assert.equal(doc.extractedFields.find(field => field.label === 'Bill To').value, 'Example Customer');
  for (const question of ['What is the cost?', 'What is the amount?', 'How much is it?', 'What is the total amount?']) {
    const answer = await answerer.answer(question, doc);
    assert.match(answer.text, /USD 36\.00/, question); assert.equal(answer.citations[0].page, 1);
  }
  assert.match((await answerer.answer('What is the date provided?', doc)).text, /Aug 25th 2026/);
  const headingsOnly = structured.extractFields('INVOICE\nInvoice No.\nInvoice Date\nState\nCustomer Name\nCustomer Pick Up Address', 'Invoice');
  assert.ok(!headingsOnly.extractedFields.some(field => ['Invoice Number','Invoice Date','Bill To'].includes(field.label)));
});

test('payment status, paid amounts, tax rates and phone numbers stay distinct', async () => {
  const asDocument = text => {
    const pages = [{ page: 1, text, extractionMethod: 'text' }];
    return { originalFileName: 'attributes.pdf', documentType: 'Invoice', pages, pagesCount: 1, ...structured.extractFields(text, 'Invoice', pages) };
  };
  const due = asDocument('INVOICE\nInvoice Number: TEST-1\nPhone: +91 9876543210\nTax: 18%\nTotal: INR 118');
  assert.ok(!due.extractedFields.some(field => field.label === 'Tax'));
  assert.equal(due.extractedFields.find(field => field.label === 'Tax Rate').value, '18%');
  assert.match((await answerer.answer('What is the phone number?', due)).text, /^The phone is.*9876543210/);
  assert.match((await answerer.answer('What is the tax percentage?', due)).text, /18%/);
  for (const question of ['What is the tax amount?', 'How much tax?', 'Was this invoice paid?', 'Has this invoice already been paid?', 'How much was paid?', 'Who paid this invoice?', 'When was this invoice paid?', 'How was this invoice paid?']) {
    assert.equal((await answerer.answer(question, due)).text, require('../dist/processing/document.answerer').NOT_FOUND, question);
  }
  const paid = asDocument('INVOICE\nTotal: USD 200\nPayment Status: Partially paid\nAmount Paid: USD 50\nPayment Method: Cash\nPayer: Jane Doe\nPayment Date: 2026-10-09');
  assert.match((await answerer.answer('Was this invoice paid?', paid)).text, /Partially paid/);
  assert.match((await answerer.answer('How much was paid?', paid)).text, /USD 50/);
  assert.match((await answerer.answer('What is the total?', paid)).text, /USD 200/);
  assert.match((await answerer.answer('Who paid this invoice?', paid)).text, /Jane Doe/);
  assert.match((await answerer.answer('When was this invoice paid?', paid)).text, /2026-10-09/);
  assert.match((await answerer.answer('How was this invoice paid?', paid)).text, /Cash/);
});

test('rotated clear scans preserve invoice identifiers', async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const source = await loadImage(scan.png);
  const canvas = createCanvas(source.height, source.width);
  const context = canvas.getContext('2d');
  context.translate(canvas.width, 0); context.rotate(Math.PI / 2); context.drawImage(source, 0, 0);
  const file = path.join(run, 'rotated.png');
  await fs.writeFile(file, canvas.toBuffer('image/png'));
  const result = await extractor.extractText(file, 'image/png');
  assert.match(result.text, /SCAN-123/);
  assert.equal(result.pages[0].extractionMethod, 'ocr');
});

test('column fields preserve payment, addresses, GST identifiers and distinct page values', async () => {
  const pages = [
    { page: 1, extractionMethod: 'text', text: 'Payment Summary\nRide ID\tRIDE-123\nTotal\tINR 36.00\nYou Paid Using\nCash\tINR 36.00\nInvoice No.\tINV-1\nCustomer Pick Up Address\n10 Test Street\nExample City, 500001\nBill Details\nRide Charge\tINR 34.34' },
    { page: 2, extractionMethod: 'text', text: 'Tax Invoice\nInvoice No.\tINV-2\nGST\t36AAHCR1710J1ZH\nTax Category\tLocal transport services of\npassengers\nCGST (2.5%)\tINR 0.82\nSGST (2.5%)\tINR 0.82' },
  ];
  const doc = { originalFileName: 'columns.pdf', documentType: 'Invoice', pages, pagesCount: 2, ...structured.extractFields(pages.map(page => page.text).join('\n'), 'Invoice', pages) };
  assert.equal(doc.extractedFields.find(field => field.label === 'Customer Address').value, '10 Test Street\nExample City, 500001');
  assert.equal(doc.extractedFields.find(field => field.label === 'GST Number').value, '36AAHCR1710J1ZH');
  assert.ok(!doc.extractedFields.some(field => field.label === 'Tax' && /AAHCR/.test(field.value)));
  assert.equal(doc.extractedFields.find(field => field.label === 'Tax Category').value, 'Local transport services of\npassengers');
  for (const [question, expected] of [['What is the cost?', /INR 36\.00/], ['What is the ride charge?', /INR 34\.34/], ['What is the ride id?', /RIDE-123/], ['How was this invoice paid?', /Cash/], ['How much was paid?', /INR 36\.00/], ['What is the GST number?', /36AAHCR1710J1ZH/]]) {
    const result = await answerer.answer(question, doc);
    assert.match(result.text, expected, question); assert.ok(result.citations.length, question);
    assert.ok(result.citations.every(source => pages.find(page => page.page === source.page).text.includes(source.snippet)));
  }
  const numbers = await answerer.answer('What is the invoice number?', doc);
  assert.match(numbers.text, /INV-1/); assert.match(numbers.text, /INV-2/);
  assert.deepEqual(numbers.citations.map(source => source.page), [1, 2]);
});

test('classification uses complete words rather than incidental substrings', () => {
  const classifier = new (require('../dist/processing/local.classifier').LocalClassifier)();
  for (const [text, type] of [['INVOICE\nBill To: Example', 'Invoice'], ['RECEIPT\nCash', 'Receipt'], ['Full Name\nSignature\nDate of Birth', 'Form'], ['Service Agreement\nParties and termination clause', 'Contract'], ['Username: example\nExchange restoration cashmere', 'Unknown']]) assert.equal(classifier.classify(text).type, type);
});

test('all invoice fields survive varying page counts, layouts and repeated values', async () => {
  for (const count of [1, 2, 4, 7]) {
    const fixture = Array.from({ length: count }, (_, index) => ({ valuesFirst: index % 2 === 0, rows: ['INVOICE', ['Invoice No.', `MULTI-${index + 1}`], ['Vendor', `Seller ${index + 1}`], ['Invoice Date', '2026-10-09'], ['Due Date', '2026-11-09'], ['Tax', 'USD 2.00'], ['Total', 'USD 20.00']] }));
    const file = path.join(run, `multi-${count}.pdf`);
    await fs.writeFile(file, pdf(fixture));
    const result = await extractor.extractText(file, 'application/pdf');
    const doc = { originalFileName: 'multiple.pdf', documentType: 'Invoice', pages: result.pages, pagesCount: count, ...structured.extractFields(result.text, 'Invoice', result.pages) };
    for (const label of ['Invoice Number', 'Vendor / Seller', 'Invoice Date', 'Due Date', 'Tax', 'Total']) assert.equal(doc.extractedFields.filter(field => field.label === label).length, count, `${count}: ${label}`);
    for (const question of ['what is the invoice', 'What is the invoice number?', 'Show all invoices', 'Whatt is the date', 'What are the invoice dates?', 'What is the amount?', 'What is the tax amount?', 'When is the due date?']) {
      const answer = await answerer.answer(question, doc);
      assert.notEqual(answer.text, require('../dist/processing/document.answerer').NOT_FOUND, question);
      assert.equal(answer.citations.length, count, `${count}: ${question}`);
      assert.deepEqual(answer.citations.map(source => source.page).sort((a,b) => a-b), Array.from({length:count}, (_,i)=>i+1));
    }
    const scoped = await answerer.answer(`What is the date on page ${count}?`, doc);
    assert.equal(scoped.citations.length, 1); assert.equal(scoped.citations[0].page, count);
    assert.equal((await answerer.answer(`What is the date on page: ${count}?`, doc)).citations[0].page, count);
    assert.match((await answerer.answer('How many invoices are there?', doc)).text, new RegExp(`\\*\\*${count} distinct invoice`));
    assert.equal((await answerer.answer('What is the date on page 99?', doc)).text, require('../dist/processing/document.answerer').NOT_FOUND);
  }
});

test('repeated receipt, form and generic fields retain page provenance', async () => {
  for (const [type, text, label, question] of [
    ['Receipt', 'RECEIPT\nReceipt No.\nR-100\nDate\n2026-10-09\nTotal\nEUR 10.00', 'Receipt Number', 'What is the receipt?'],
    ['Form', 'Full Name: Example Person\nDate: 2026-10-09\nDate of Birth: 2000-01-01', 'Name', 'What is the name?'],
    ['Unknown', 'Reference: EXAMPLE\nDate: 2026-10-09\nDepartment: Accounts', 'Department', 'What is the department?'],
  ]) {
    const pages = Array.from({length:3}, (_,i) => ({page:i+1, extractionMethod:'text', text}));
    const doc = {originalFileName:'repeated.pdf', documentType:type, pages, pagesCount:3, ...structured.extractFields(text, type, pages)};
    assert.equal(doc.extractedFields.filter(field => field.label === label).length, 3, type);
    assert.equal((await answerer.answer(question, doc)).citations.length, 3, type);
    assert.equal((await answerer.answer('Whatt is the date', doc)).citations.length, 3, type);
  }
  const text = 'INVOICE\nInvoice Number: SAME-PAGE-1\nTotal: USD 10.00\nINVOICE\nInvoice Number: SAME-PAGE-2\nTotal: USD 20.00';
  const pages = [{page:1, text, extractionMethod:'text'}];
  const doc = {originalFileName:'same-page.pdf', documentType:'Invoice', pages, pagesCount:1, ...structured.extractFields(text, 'Invoice', pages)};
  assert.equal(doc.extractedFields.filter(field => field.label === 'Invoice Number').length, 2);
  assert.equal((await answerer.answer('What is the total?', doc)).citations.length, 2);
});

test('API persists and answers every invoice page and retains results after retry', async () => {
  const request = (endpoint, options = {}) => fetch(base + endpoint, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const payload = pdf(Array.from({length:5}, (_,i) => ({rows:['INVOICE', `Invoice Number: API-${i+1}`, 'Date: 2026-10-09', `Total: USD ${(i+1)*10}.00`]})));
  const body = new FormData(); body.append('file', new Blob([payload], {type:'application/pdf'}), 'multiple-invoices.pdf');
  const upload = await request('/documents/upload', {method:'POST', body});
  assert.equal(upload.status, 201); const id = (await upload.json()).document.id;
  const wait = async () => {
    for (let attempt=0; attempt<100; attempt++) {
      const doc = (await (await request(`/documents/${id}`)).json()).document;
      if (doc.status === 'Completed') return doc;
      assert.notEqual(doc.status, 'Failed', doc.failureReason);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Processing timed out');
  };
  try {
    for (let pass=0; pass<2; pass++) {
      const doc = await wait(); assert.equal(doc.pages.length, 5);
      assert.equal(doc.extractedFields.filter(field=>field.label==='Invoice Number').length, 5);
      for (const question of ['what is the invoice', 'Whatt is the date', 'What are the totals?']) {
        const result = await request(`/documents/${id}/questions`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question})});
        assert.equal(result.status, 201); const answer = (await result.json()).message;
        assert.deepEqual(answer.citations.map(source => source.page).sort(), [1,2,3,4,5]);
      }
      if (pass===0) assert.equal((await request(`/documents/${id}/retry`, {method:'POST'})).status, 200);
    }
    assert.equal((await (await request(`/documents/${id}/questions`)).json()).conversation.length, 12);
    assert.deepEqual(Buffer.from(await (await request(`/documents/${id}/file`)).arrayBuffer()), payload);
  } finally { assert.equal((await request(`/documents/${id}`, {method:'DELETE'})).status, 200); }
});

test('optional model provider refuses ungrounded or invalid citations', async () => {
  const originalFetch = global.fetch;
  const Model = require('../dist/processing/document.answerer').OllamaDocumentAnswerer;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ answer: 'A fictional total', sources: [{ page: 2, quote: 'Total: 999999' }] }) } }) });
    assert.equal((await new Model().answer('What is the total?', invoice)).text, require('../dist/processing/document.answerer').NOT_FOUND);
    global.fetch = async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ answer: 'Tax is USD 110.00.', sources: [{ page: 2, quote: 'Tax: USD 110.00' }] }) } }) });
    assert.equal((await new Model().answer('What is the tax?', invoice)).citations[0].page, 2);
  } finally { global.fetch = originalFetch; }
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (run) await require('../dist/database/db').closeDb();
});
