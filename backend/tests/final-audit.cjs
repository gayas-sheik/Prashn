// Independent local acceptance audit. Uses only disposable, isolated records.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { pdf } = require('./fixtures.cjs');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evidence = { date: '2026-10-09', checks: [], requests: [], documents: [], observations: {} };
let run, server, frontend, db, token, otherToken, env;
const base = 'http://127.0.0.1:5177/api';
async function check(name, fn) {
  try { const detail = await fn(); evidence.checks.push({ name, status: 'VERIFIED', detail }); console.log('PASS', name); }
  catch (error) { evidence.checks.push({ name, status: 'FAILED', error: error.message }); console.log('FAIL', name, error.message); }
}
function launch(args, cwd, log) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => fs.appendFile(path.join(run, log), data).catch(() => {}));
  child.stderr.on('data', data => fs.appendFile(path.join(run, log), data).catch(() => {}));
  return child;
}
async function ready(url) {
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(100);
  }
  throw new Error(`Startup timeout: ${url}`);
}
const json = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
async function request(endpoint, options = {}, auth = token) {
  const response = await fetch(base + endpoint, { ...options, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...options.headers }, signal: AbortSignal.timeout(30000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  let body; try { body = JSON.parse(bytes.toString()); } catch { body = null; }
  evidence.requests.push({ method: options.method || 'GET', endpoint, account: auth === token ? 'A' : auth === otherToken ? 'B' : auth ? 'invalid/test' : 'anonymous', status: response.status, error: body?.error, bytes: bytes.length });
  return { status: response.status, body, bytes, headers: response.headers };
}
async function upload(name, data, mime = 'application/pdf', auth = token) {
  const form = new FormData(); form.append('file', new Blob([data], { type: mime }), name);
  const result = await request('/documents/upload', { method: 'POST', body: form }, auth);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.document;
}
async function wait(id) {
  for (let i = 0; i < 300; i++) {
    const result = await request(`/documents/${id}`); assert.equal(result.status, 200);
    if (['Completed', 'Failed'].includes(result.body.document.status)) return result.body.document;
    await delay(100);
  }
  throw new Error(`Processing timeout: ${id}`);
}
async function question(doc, text, expected) {
  const answer = await request(`/documents/${doc.id}/questions`, json({ question: text }));
  assert.equal(answer.status, 201, JSON.stringify(answer.body));
  if (expected) assert.match(answer.body.message.text, expected);
  for (const citation of answer.body.message.citations || []) assert.ok(doc.pages.find(page => page.page === citation.page)?.text.includes(citation.snippet), 'Citation must quote its stated page');
  return answer.body.message;
}
async function main() {
  await fs.mkdir(path.join(backend, '.test-output'), { recursive: true });
  run = await fs.mkdtemp(path.join(backend, '.test-output/final-audit-'));
  console.log('EVIDENCE', run);
  env = { ...process.env, NODE_ENV: 'development', PORT: '5057', JWT_SECRET: randomBytes(48).toString('hex'), DB_FILE: path.join(run, 'audit.db'), UPLOAD_DIR: path.join(run, 'uploads'), PROCESSED_DIR: path.join(run, 'processed'), CORS_ORIGIN: 'http://127.0.0.1:5177', OLLAMA_MODEL: '', PRASHN_API_TARGET: 'http://127.0.0.1:5057', PROCESSING_CONCURRENCY: '2' };
  // Run the documented backend development build/server path, without a watcher.
  server = launch([npm, 'run', 'dev:server'], backend, 'backend-start.log');
  frontend = launch(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5177', '--strictPort'], root, 'frontend-start.log');
  await ready('http://127.0.0.1:5057/api/health'); await ready(base + '/health');
  db = await require('sqlite').open({ filename: env.DB_FILE, driver: require('sqlite3').Database });
  await check('Frontend startup and backend health through Vite proxy', async () => {
    const html = await fetch('http://127.0.0.1:5177/login'); assert.equal(html.status, 200); assert.match(await html.text(), /src\/main.tsx/);
    const health = await request('/health', {}, ''); assert.equal(health.status, 200); assert.equal(health.body.workspace, 'Prashn-latest'); assert.equal(health.body.qaMode, 'extractive'); return health.body;
  });
  await check('Registration, normalized duplicate, input validation, login and account lookup', async () => {
    for (const [email, fullName] of [['audit-a@example.invalid', 'Audit A'], ['audit-b@example.invalid', 'Audit B']]) {
      assert.equal((await request('/auth/register', json({ email, fullName, password: 'AuditOnly-2026!' }), '')).status, 201);
      const result = await request('/auth/login', json({ email, password: 'AuditOnly-2026!' }), ''); assert.equal(result.status, 200);
      if (!token) token = result.body.token; else otherToken = result.body.token;
    }
    assert.equal((await request('/auth/register', json({ email: ' AUDIT-A@EXAMPLE.INVALID ', fullName: 'Duplicate', password: 'AuditOnly-2026!' }), '')).status, 409);
    assert.equal((await request('/auth/register', json({ email: 'bad', fullName: '', password: 'short' }), '')).status, 400);
    assert.equal((await request('/auth/login', json({ email: 'audit-a@example.invalid', password: 'incorrect' }), '')).status, 401);
    const me = await request('/auth/me'); assert.equal(me.status, 200); assert.equal(me.body.user.fullName, 'Audit A'); assert.ok(!('passwordHash' in me.body.user));
    const hashes = await db.all('SELECT passwordHash FROM users'); assert.equal(hashes.length, 2); for (const row of hashes) { assert.match(row.passwordHash, /^\$2[ab]\$10\$/); assert.ok(await require('bcrypt').compare('AuditOnly-2026!', row.passwordHash)); }
    return { accounts: 2, bcryptCost: 10 };
  });
  await check('Protected route families reject missing, malformed, expired, wrong-signature and unsigned tokens', async () => {
    const jwt = require('jsonwebtoken');
    const payload = jwt.decode(token);
    const expired = jwt.sign({ userId: payload.userId, email: payload.email }, env.JWT_SECRET, { expiresIn: -1 });
    const wrong = jwt.sign({ userId: payload.userId }, 'different-secret');
    const unsigned = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.';
    for (const auth of ['', 'malformed', expired, wrong, unsigned]) for (const endpoint of ['/auth/me', '/documents', '/activity', '/documents/missing/questions']) assert.equal((await request(endpoint, {}, auth)).status, 401);
    assert.equal((await request('/documents?token=' + token, {}, '')).status, 401);
    // Do not preserve a token in the evidence URL.
    evidence.requests.at(-1).endpoint = '/documents?token=[redacted]';
  });
  const fixtures = [
    { name: 'audit-invoice-a.pdf', type: 'Invoice', vendor: 'Juniper Systems', total: 'USD 517.25', rows: ['iNvOiCe', ['INVOICE NO.', 'AUD-A-391'], ['Vendor Name', 'Juniper Systems'], ['Invoice Date', '2026-10-08'], ['Due Date', '2026-11-07'], ['Tax', 'USD 17.25'], ['Sub Total', 'USD 500.00'], ['Grand Total', 'USD 517.25']] },
    { name: 'audit-invoice-b.pdf', type: 'Invoice', vendor: 'Harbor Engineering', total: 'EUR 943.60', rows: ['INVOICE', 'Total: EUR 943.60', 'Vendor: Harbor Engineering', 'Invoice Number: AUD-B-852', 'Invoice Date: 09/10/2026', 'Tax: EUR 43.60', 'Subtotal: EUR 900.00'] },
    { name: 'audit-receipt.pdf', type: 'Receipt', total: 'INR 89.50', rows: ['RECEIPT', 'Store: Saffron Corner', 'Date: 2026-10-09', 'Subtotal: INR 85.00', 'Tax: INR 4.50', 'Total: INR 89.50', 'Cash: INR 100.00', 'Change: INR 10.50'] },
    { name: 'audit-form.pdf', type: 'Form', rows: ['APPLICATION FORM', ['Name', 'Morgan Example'], ['Date of Birth', '1997-04-23'], ['Address', '19 Fictional Lane'], ['Signature', 'Morgan Example']] },
    { name: 'audit-unknown.pdf', type: 'Unknown', rows: ['FIELD NOTE', 'Tracking Code: TRK-AUD-778', 'Storage Condition: Keep upright', 'Observation: The enclosure is blue.'] },
  ];
  for (const fixture of fixtures) { fixture.bytes = pdf([{ rows: fixture.rows, valuesFirst: fixture.name.includes('-a.') }]); await fs.writeFile(path.join(run, fixture.name), fixture.bytes); }
  let first, batchDocs, corrupt;
  await check('Single upload persists source bytes, independent metadata, pages, complete text and checksum', async () => {
    first = await wait((await upload(fixtures[0].name, fixtures[0].bytes)).id); assert.equal(first.status, 'Completed', first.failureReason);
    assert.equal(first.documentType, 'Invoice'); assert.equal(first.fileSize, fixtures[0].bytes.length);
    const row = await db.get('SELECT * FROM documents WHERE id = ?', first.id); assert.equal(row.userId, require('jsonwebtoken').decode(token).userId); assert.equal(row.status, 'Completed');
    assert.deepEqual(await fs.readFile(path.join(env.UPLOAD_DIR, row.storageKey)), fixtures[0].bytes);
    assert.equal(first.sha256, createHash('sha256').update(fixtures[0].bytes).digest('hex'));
    assert.equal(await fs.readFile(path.join(env.PROCESSED_DIR, first.id + '.txt'), 'utf8'), first.pages.map(p => p.text).join('\n\f\n'));
    assert.deepEqual(JSON.parse(row.pages), first.pages); evidence.documents.push(first); return { id: first.id, bytes: first.fileSize, type: first.documentType };
  });
  await check('Mixed batch: invoice, receipt, form, unknown and corrupt PDF finish independently', async () => {
    const form = new FormData();
    for (const fixture of fixtures.slice(1)) form.append('files', new Blob([fixture.bytes], { type: 'application/pdf' }), fixture.name);
    form.append('files', new Blob(['%PDF-1.7\ncorrupt audit bytes'], { type: 'application/pdf' }), 'audit-corrupt.pdf');
    const response = await request('/documents/upload-multiple', { method: 'POST', body: form }); assert.equal(response.status, 201); assert.equal(response.body.documents.length, 5);
    assert.equal(new Set(response.body.documents.map(d => d.id)).size, 5);
    batchDocs = await Promise.all(response.body.documents.map(d => wait(d.id)));
    for (const [index, fixture] of fixtures.slice(1).entries()) { assert.equal(batchDocs[index].status, 'Completed', batchDocs[index].failureReason); assert.equal(batchDocs[index].documentType, fixture.type); assert.deepEqual(await fs.readFile(path.join(env.UPLOAD_DIR, batchDocs[index].storageKey)), fixture.bytes); }
    corrupt = batchDocs[4]; assert.equal(corrupt.status, 'Failed'); assert.ok(corrupt.failureReason); evidence.documents.push(...batchDocs); return batchDocs.map(d => ({ id: d.id, type: d.documentType, status: d.status, failureReason: d.failureReason }));
  });
  await check('Fields match independently specified vendors, currencies, dates, totals, receipt and form values', async () => {
    const fields = (doc, label) => doc.extractedFields.find(f => f.label === label)?.value;
    assert.equal(fields(first, 'Vendor / Seller'), fixtures[0].vendor); assert.equal(fields(first, 'Total'), fixtures[0].total);
    assert.equal(fields(first, 'Invoice Date'), '2026-10-08'); assert.equal(fields(first, 'Due Date'), '2026-11-07');
    assert.equal(fields(batchDocs[0], 'Vendor / Seller'), fixtures[1].vendor); assert.equal(fields(batchDocs[0], 'Total'), fixtures[1].total);
    assert.equal(fields(batchDocs[1], 'Total'), fixtures[2].total); assert.equal(fields(batchDocs[2], 'Name'), 'Morgan Example'); assert.equal(fields(batchDocs[2], 'Date of Birth'), '1997-04-23');
    assert.ok(!batchDocs[3].extractedFields.some(f => ['Total','Tax','Vendor / Seller'].includes(f.label)));
  });
  await check('Account B cannot list, read, download, ask, clear, retry or delete account A documents', async () => {
    assert.equal((await request('/documents', {}, otherToken)).body.documents.length, 0);
    for (const [endpoint, options] of [[`/documents/${first.id}`, {}], [`/documents/${first.id}/file`, {}], [`/documents/${first.id}/questions`, {}], [`/documents/${first.id}/questions`, json({ question: 'What is the total?' })], [`/documents/${first.id}/questions`, { method: 'DELETE' }], [`/documents/${first.id}/retry`, { method: 'POST' }], [`/documents/${first.id}`, { method: 'DELETE' }]]) assert.equal((await request(endpoint, options, otherToken)).status, 404);
    assert.equal((await request(`/documents/${first.id}`)).status, 200); assert.equal((await request('/activity', {}, otherToken)).body.events.length, 0);
  });
  await check('Document-specific Q&A and refusal: no cross-document total/vendor leakage; persisted pairs', async () => {
    await question(first, 'What is the total amount?', /USD 517\.25/); await question(batchDocs[0], 'What is the total amount?', /EUR 943\.60/);
    await question(first, 'Who is the vendor?', /Juniper Systems/); await question(batchDocs[0], 'Who is the vendor?', /Harbor Engineering/);
    await question(first, 'What is the invoice date?', /2026-10-08/); await question(first, 'What is the tax amount?', /USD 17\.25/);
    const absent = await question(first, "What is the customer's phone number?"); assert.equal(absent.text, "I couldn't find that information in this document."); assert.equal(absent.citations.length, 0);
    const history = (await request(`/documents/${first.id}/questions`)).body.conversation; assert.equal(history.length, 10);
    assert.equal((await db.get('SELECT count(*) AS n FROM qa_messages WHERE documentId = ?', first.id)).n, 10);
    assert.equal((await request(`/documents/${batchDocs[0].id}/questions`)).body.conversation.length, 4); return { firstHistory: 10, secondHistory: 4 };
  });
  await check('Validation: no file, unsupported type, zero-byte PDF, question limits and malformed JSON', async () => {
    assert.equal((await request('/documents/upload', { method: 'POST', body: new FormData() })).status, 400);
    const bad = new FormData(); bad.append('file', new Blob(['plain text'], { type: 'text/plain' }), 'unsupported.txt'); assert.equal((await request('/documents/upload', { method: 'POST', body: bad })).status, 415);
    const empty = await wait((await upload('empty.pdf', Buffer.alloc(0))).id); assert.equal(empty.status, 'Failed'); assert.ok(empty.failureReason);
    for (const value of ['', ' '.repeat(5), 'q'.repeat(4001), {}, null]) assert.equal((await request(`/documents/${first.id}/questions`, json({ question: value }))).status, 400);
    assert.equal((await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad-json' }, '')).status, 400);
    assert.equal((await request(`/documents/${corrupt.id}/questions`, json({ question: 'What is the total?' }))).status, 409); evidence.documents.push(empty);
  });
  await check('Download returns byte-identical original with nosniff/private cache policy', async () => {
    const download = await request(`/documents/${first.id}/file`); assert.equal(download.status, 200); assert.deepEqual(download.bytes, fixtures[0].bytes); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.match(download.headers.get('cache-control'), /no-store/);
  });
  await check('Failed retry reaches Failed again; replacing only disposable corrupt source makes retry complete', async () => {
    assert.equal((await request(`/documents/${corrupt.id}/retry`, { method: 'POST' })).status, 200); assert.equal((await wait(corrupt.id)).status, 'Failed');
    await fs.writeFile(path.join(env.UPLOAD_DIR, corrupt.storageKey), fixtures[1].bytes);
    assert.equal((await request(`/documents/${corrupt.id}/retry`, { method: 'POST' })).status, 200); const repaired = await wait(corrupt.id); assert.equal(repaired.status, 'Completed'); assert.equal(repaired.extractedFields.find(f => f.label === 'Total').value, fixtures[1].total);
    // Test repair changes source bytes deliberately; not an automatic repair capability.
    return { repairedDocument: corrupt.id, intervention: 'Replaced source bytes in isolated storage only' };
  });
  await check('Concurrent distinct uploads and duplicate retry do not mix results', async () => {
    const uploads = await Promise.all(Array.from({ length: 6 }, (_, index) => upload(`concurrent-${index}.pdf`, pdf([{ rows: ['INVOICE', `Invoice Number: CON-${index}`, `Vendor: Audit Vendor ${index}`, `Total: USD ${index + 20}.00`] }]))));
    const docs = await Promise.all(uploads.map(d => wait(d.id))); assert.equal(new Set(docs.map(d => d.id)).size, 6);
    for (const [index, doc] of docs.entries()) { assert.equal(doc.status, 'Completed'); assert.equal(doc.extractedFields.find(f => f.label === 'Total').value, `USD ${index + 20}.00`); assert.equal(doc.extractedFields.find(f => f.label === 'Vendor / Seller').value, `Audit Vendor ${index}`); }
    const before = await db.get("SELECT count(*) AS n FROM activity_events WHERE documentId = ? AND event = 'Document Completed'", first.id);
    const retries = await Promise.all(Array.from({ length: 5 }, () => request(`/documents/${first.id}/retry`, { method: 'POST' })));
    await wait(first.id); const after = await db.get("SELECT count(*) AS n FROM activity_events WHERE documentId = ? AND event = 'Document Completed'", first.id);
    assert.equal(after.n - before.n, 1); evidence.observations.concurrentRetry = { statuses: retries.map(r => r.status), retryEvents: (await db.get("SELECT count(*) AS n FROM activity_events WHERE documentId = ? AND event = 'Retry Initiated'", first.id)).n, completionsAdded: after.n - before.n };
    assert.equal(retries.filter(r => r.status === 200).length, 1);
    assert.equal(evidence.observations.concurrentRetry.retryEvents, 1);
    evidence.documents.push(...docs); return evidence.observations.concurrentRetry;
  });
  await check('Document list and live metrics agree with persisted owned records', async () => {
    const list = (await request('/documents')).body.documents;
    const result = await request('/documents/metrics'); assert.equal(result.status, 200);
    const metrics = result.body.metrics;
    assert.equal(metrics.total, list.length);
    assert.equal(metrics.completed, list.filter(d => d.status === 'Completed').length);
    assert.equal(metrics.failed, list.filter(d => d.status === 'Failed').length);
    assert.equal(metrics.totalBytes, list.reduce((sum, d) => sum + d.fileSize, 0));
    assert.equal((await request('/documents/metrics', {}, otherToken)).body.metrics.total, 0);
    return metrics;
  });
  await check('Lifecycle activity reflects upload, work, completion, failure, retry and ownership', async () => {
    const events = (await request('/activity')).body.events;
    for (const event of ['Document Uploaded','Document Processing','Document Classifying','Document Extracting information','Document Completed','Document Failed','Retry Initiated']) assert.ok(events.some(e => e.event === event), event);
    assert.ok(events.every(e => e.userId === require('jsonwebtoken').decode(token).userId));
    evidence.observations.lifecycle = events.filter(e => e.documentId === first.id).map(e => ({ event: e.event, status: e.status })); return { eventCount: events.length };
  });
  await check('History survives actual backend stop/start and persisted pending work recovers', async () => {
    const historicalCount = (await db.get('SELECT count(*) AS n FROM qa_messages WHERE documentId = ?', first.id)).n;
    // Stop only the child audit server; leave existing user servers running.
    await stopTree(server); server = null;
    await db.run("UPDATE documents SET status = 'Processing' WHERE id = ?", batchDocs[0].id);
    server = launch(['dist/server.js'], backend, 'backend-restart.log'); await ready('http://127.0.0.1:5057/api/health');
    assert.equal((await wait(batchDocs[0].id)).status, 'Completed'); assert.equal((await request(`/documents/${first.id}/questions`)).body.conversation.length, historicalCount);
    return { restoredMessages: historicalCount, recoveredDocument: batchDocs[0].id };
  });
  await check('Logout acknowledgement is stateless: existing JWT remains valid as documented', async () => {
    assert.equal((await request('/auth/logout', { method: 'POST' })).status, 200); assert.equal((await request('/auth/me')).status, 200); assert.equal((await request('/auth/logout', { method: 'POST' }, '')).status, 200);
    return 'Server does not revoke tokens; frontend logout clears local storage (source inspected, browser blocked).';
  });
  await check('Question clearing persists; deletion removes document, original, extracted text and questions; retains audit events', async () => {
    assert.equal((await request(`/documents/${batchDocs[0].id}/questions`, { method: 'DELETE' })).status, 200); assert.equal((await request(`/documents/${batchDocs[0].id}/questions`)).body.conversation.length, 0);
    const key = first.storageKey; assert.equal((await request(`/documents/${first.id}`, { method: 'DELETE' })).status, 200); assert.equal((await request(`/documents/${first.id}`)).status, 404);
    assert.equal((await db.get('SELECT count(*) AS n FROM documents WHERE id = ?', first.id)).n, 0); assert.equal((await db.get('SELECT count(*) AS n FROM qa_messages WHERE documentId = ?', first.id)).n, 0);
    await assert.rejects(fs.stat(path.join(env.UPLOAD_DIR, key))); await assert.rejects(fs.stat(path.join(env.PROCESSED_DIR, first.id + '.txt')));
    assert.ok((await db.get("SELECT count(*) AS n FROM activity_events WHERE documentId = ? AND event = 'Document Deleted'", first.id)).n > 0);
    assert.equal((await request(`/documents/${batchDocs[0].id}`)).status, 200); return 'Activity events intentionally retained after deletion.';
  });
  evidence.observations.schema = { integrity: await db.all('PRAGMA integrity_check'), foreignKeys: await db.all('PRAGMA foreign_key_check'), tables: await db.all("SELECT name, sql FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%'") };
  evidence.observations.finalCounts = await db.get('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM documents) AS documents, (SELECT count(*) FROM qa_messages) AS messages, (SELECT count(*) FROM activity_events) AS events');
}
async function stopTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') await new Promise(resolve => { const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.on('exit', resolve); });
  else child.kill('SIGTERM');
}
main().catch(error => { evidence.fatal = error.stack; console.error(error); }).finally(async () => {
  await db?.close(); await stopTree(server); await stopTree(frontend);
  if (run) { await fs.writeFile(path.join(run, 'evidence.json'), JSON.stringify(evidence, null, 2)); await fs.writeFile(path.join(backend, '.test-output/final-audit-latest.json'), JSON.stringify({ run, checks: evidence.checks, fatal: evidence.fatal }, null, 2)); }
  console.log('RESULT', evidence.checks.filter(c => c.status === 'VERIFIED').length, 'passed;', evidence.checks.filter(c => c.status === 'FAILED').length, 'failed');
  process.exitCode = evidence.fatal || evidence.checks.some(c => c.status === 'FAILED') ? 1 : 0;
});
