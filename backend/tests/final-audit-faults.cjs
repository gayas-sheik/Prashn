// Adversarial audit: assertions express acceptance expectations, not existing behavior.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { pdf } = require('./fixtures.cjs');
let run, server, base, token, db, doc;
const observations = {};
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const request = (endpoint, options = {}) => fetch(base + endpoint, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
async function upload(name) {
  const body = new FormData(); body.append('file', new Blob([pdf([{ rows: ['INVOICE', 'Invoice Number: FAULT-123', 'Vendor: Fault Test Ltd', 'Total: USD 27.50'] }])], { type: 'application/pdf' }), name);
  return request('/documents/upload', { method: 'POST', body });
}
async function wait(id) {
  for (let i = 0; i < 100; i++) { const doc = (await (await request(`/documents/${id}`)).json()).document; if (['Completed','Failed'].includes(doc.status)) return doc; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Processing timeout');
}
before(async () => {
  run = await fs.mkdtemp(path.resolve(__dirname, '../.test-output/final-audit-faults-'));
  process.env.DB_FILE = path.join(run, 'audit.db'); process.env.UPLOAD_DIR = path.join(run, 'uploads'); process.env.PROCESSED_DIR = path.join(run, 'processed'); process.env.JWT_SECRET = randomBytes(48).toString('hex'); process.env.OLLAMA_MODEL = '';
  const app = require('../dist/app').default;
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); }); base = `http://127.0.0.1:${server.address().port}/api`;
  await request('/auth/register', json({ email: 'fault@example.invalid', password: 'FaultOnly-2026!', fullName: 'Fault Audit' }));
  token = (await (await request('/auth/login', json({ email: 'fault@example.invalid', password: 'FaultOnly-2026!' }))).json()).token;
  db = await require('../dist/database/db').getDb(); doc = await wait((await (await upload('fault.pdf')).json()).document.id);
});
test('No configured JWT secret must fail closed in development and production', () => {
  const statuses = {};
  for (const mode of ['development','production']) {
    const result = spawnSync(process.execPath, ['-e', "require('./dist/config/env')"], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, NODE_ENV: mode, JWT_SECRET: '' }, encoding: 'utf8', windowsHide: true }); statuses[mode] = result.status;
  }
  observations.missingSecret = statuses; assert.notEqual(statuses.development, 0); assert.notEqual(statuses.production, 0);
});
test('Concurrent duplicate registration returns one 201 and conflicts, never 500', async () => {
  const requests = await Promise.all(Array.from({ length: 5 }, () => request('/auth/register', json({ email: 'race@example.invalid', password: 'FaultOnly-2026!', fullName: 'Registration Race' }))));
  const statuses = requests.map(r => r.status); observations.registrationRace = statuses;
  assert.equal(statuses.filter(s => s === 201).length, 1); assert.ok(statuses.every(s => [201,409].includes(s)));
});
test('Concurrent retry accepts one job and logs exactly one accepted retry', async () => {
  const before = (await db.get("SELECT count(*) AS n FROM activity_events WHERE documentId = ? AND event = 'Retry Initiated'", doc.id)).n;
  const requests = await Promise.all(Array.from({ length: 5 }, () => request(`/documents/${doc.id}/retry`, { method: 'POST' })));
  await wait(doc.id);
  const after = (await db.get("SELECT count(*) AS n FROM activity_events WHERE documentId = ? AND event = 'Retry Initiated'", doc.id)).n;
  observations.retryRace = { statuses: requests.map(r => r.status), eventsAdded: after - before };
  assert.equal(after - before, 1); assert.equal(requests.filter(r => r.status === 200).length, 1);
});
test('Missing Vendor value must not absorb an unrelated labelled note', async () => {
  const fields = new (require('../dist/processing/field_extractor').StructuredFieldExtractor)().extractFields('INVOICE\nVendor:\nNotes: Deliver tomorrow\nTotal: USD 27.50', 'Invoice').extractedFields;
  observations.emptyVendor = fields;
  assert.ok(!fields.some(f => f.label === 'Vendor / Seller'));
  const body = new FormData(); body.append('file', new Blob([pdf([{ rows: ['INVOICE', 'Vendor:', 'Notes: Deliver tomorrow', 'Total: USD 27.50'] }])], { type: 'application/pdf' }), 'missing-vendor.pdf');
  const uploaded = await wait((await (await request('/documents/upload', { method: 'POST', body })).json()).document.id);
  const answer = await (await request(`/documents/${uploaded.id}/questions`, json({ question: 'Who is the vendor?' }))).json();
  assert.equal(answer.message.text, "I couldn't find that information in this document."); assert.deepEqual(answer.message.citations, []);
  const payment = new (require('../dist/processing/field_extractor').StructuredFieldExtractor)().extractFields('INVOICE\nYou Paid Using\nCash\tUSD 27.50', 'Invoice').extractedFields;
  assert.equal(payment.find(f => f.label === 'Payment Method')?.value, 'Cash');
  assert.equal(payment.find(f => f.label === 'Amount Paid')?.value, 'USD 27.50');
});
test('Metadata creation failure must not leave an inaccessible original file', async () => {
  const proto = require('../dist/repositories/document.repository').DocumentRepository.prototype;
  const original = proto.createDocument; const before = await fs.readdir(process.env.UPLOAD_DIR);
  let result;
  try { proto.createDocument = async () => { throw new Error('AUDIT_INJECTED_DATABASE_FAILURE'); }; result = await upload('database-failure.pdf'); }
  finally { proto.createDocument = original; }
  assert.equal(result.status, 500); const after = await fs.readdir(process.env.UPLOAD_DIR);
  observations.uploadFailure = { http: result.status, filesBefore: before.length, filesAfter: after.length };
  assert.equal(after.length, before.length);
});
test('Parallel columns and printed template placeholders must not produce false customer/date fields', async () => {
  const text = 'INVOICE\nBILL TO\nInvoice No.: INV-0001\nClient Name\tDate: [date]\nClient Company Inc.\tDue: [date]\nTotal: USD 1800.00\nhttps://example.invalid/template';
  const pages = [{ page: 1, text, extractionMethod: 'text' }];
  const fields = new (require('../dist/processing/field_extractor').StructuredFieldExtractor)().extractFields(text, 'Invoice', pages).extractedFields;
  assert.ok(!fields.some(f => ['Bill To','Client Name','Client Company Inc.','https'].includes(f.label)));
  assert.ok(!fields.some(f => /^\[.+\]$/.test(f.value)));
  const answer = await new (require('../dist/processing/document.answerer').ExtractiveDocumentAnswerer)().answer('What is the invoice date?', { originalFileName: 'blank-template.pdf', documentType: 'Invoice', pagesCount: 1, pages, extractedFields: fields, lineItems: [] });
  assert.equal(answer.text, "I couldn't find that information in this document.");
  observations.templateColumns = { fields, dateAnswer: answer.text };
});
test('Processed-text cleanup failure must retain the record and original so deletion is retryable', async () => {
  const target = path.join(process.env.PROCESSED_DIR, doc.id + '.txt'); const originalText = await fs.readFile(target);
  // Inject failure only at the processed-text cleanup call; all other fs calls stay real.
  const originalRm = fs.rm;
  let response;
  try { fs.rm = async (file, ...args) => { if (path.resolve(file) === target) throw new Error('AUDIT_INJECTED_CLEANUP_FAILURE'); return originalRm(file, ...args); }; response = await request(`/documents/${doc.id}`, { method: 'DELETE' }); }
  finally { fs.rm = originalRm; }
  const row = await db.get('SELECT * FROM documents WHERE id = ?', doc.id);
  const originalExists = await fs.stat(path.join(process.env.UPLOAD_DIR, doc.storageKey)).then(() => true, () => false);
  const textExists = await fs.stat(target).then(() => true, () => false);
  observations.deletionFailure = { http: response.status, recordExists: !!row, originalExists, textExists };
  assert.equal(response.status, 500); assert.ok(row); assert.ok(originalExists); assert.deepEqual(await fs.readFile(target), originalText);
});
test('MIME-spoofed PDF fails processing rather than being falsely completed', async () => {
  const form = new FormData(); form.append('file', new Blob(['plain-text payload masquerading as PDF'], { type: 'application/pdf' }), 'spoof.pdf');
  const result = await request('/documents/upload', { method: 'POST', body: form }); assert.equal(result.status, 201);
  const failed = await wait((await result.json()).document.id); assert.equal(failed.status, 'Failed'); assert.ok(failed.failureReason);
  observations.mimeSpoof = { upload: 201, processing: failed.status, failureReason: failed.failureReason };
});
after(async () => {
  await fs.writeFile(path.join(run, 'observations.json'), JSON.stringify(observations, null, 2));
  await fs.writeFile(path.resolve(__dirname, '../.test-output/final-audit-faults-latest.json'), JSON.stringify({ run, observations }, null, 2));
  await new Promise(resolve => server.close(resolve)); await require('../dist/database/db').closeDb(); console.log('FAULT_EVIDENCE', run);
});
