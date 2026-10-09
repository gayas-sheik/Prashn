const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { pdf } = require('./fixtures.cjs');
let emulator, server, apiPort, base, run, a, b, clients, jobs, Worker, dispatcher, documentId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const s = net.createServer(); await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p; }
async function request(route, options = {}) {
  const response = await fetch(base + route, options);
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, bytes: Buffer.from(text) };
}
const json = (method, token, body) => ({ method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
async function startApi() {
  server = spawn(process.execPath, ['dist/server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => fs.appendFile(path.join(run, 'api.log'), data).catch(() => {}));
  server.stderr.on('data', data => fs.appendFile(path.join(run, 'api.log'), data).catch(() => {}));
  for (let i = 0; i < 100; i++) { try { if ((await request('/api/health')).status === 200) return; } catch {} await pause(100); }
  throw new Error('AWS-mode API did not start; inspect ignored api.log');
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise(resolve => child.once('exit', resolve)); child.kill();
  await Promise.race([done, pause(5000)]);
}
async function upload(token, content, name = 'invoice.pdf') {
  const form = new FormData(); form.append('file', new Blob([content], { type: 'application/pdf' }), name);
  return request('/api/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}
async function getDoc(id = documentId, token = a) { return request(`/api/documents/${id}`, json('GET', token)); }
async function drainUntil(id) {
  for (let i = 0; i < 20; i++) {
    await new Worker().runOnce(); const doc = (await getDoc(id)).body.document;
    if (['Completed', 'Failed'].includes(doc?.status)) return doc;
  }
  throw new Error('Document did not reach terminal status');
}
before(async () => {
  run = await fs.mkdtemp(path.join(path.resolve(__dirname, '../.test-output'), 'aws-'));
  const emulatorPort = await port(); apiPort = await port(); base = `http://127.0.0.1:${apiPort}`;
  const python = process.env.MOTO_PYTHON || path.resolve(__dirname, '../.test-output/aws-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  emulator = spawn(python, ['-m', 'moto.server', '-H', '127.0.0.1', '-p', String(emulatorPort)], { stdio: ['ignore', 'pipe', 'pipe'] });
  emulator.on('error', () => {});
  emulator.stdout.on('data', data => fs.appendFile(path.join(run, 'emulator.log'), data).catch(() => {}));
  emulator.stderr.on('data', data => fs.appendFile(path.join(run, 'emulator.log'), data).catch(() => {}));
  process.env.AWS_ENDPOINT_URL = `http://127.0.0.1:${emulatorPort}`;
  Object.assign(process.env, { AWS_ALLOW_LOCAL_ENDPOINT: 'true', AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'emulator-only', AWS_SECRET_ACCESS_KEY: 'emulator-only', AWS_EC2_METADATA_DISABLED: 'true',
    STORAGE_MODE: 's3', DATABASE_MODE: 'dynamodb', PROCESSING_MODE: 'sqs', JWT_SECRET: crypto.randomBytes(48).toString('hex'), NODE_ENV: 'test',
    DOCUMENT_BUCKET: 'prashn-integration', DYNAMODB_TABLE: 'prashn-integration', PROCESSING_QUEUE_URL: 'http://placeholder.invalid', OLLAMA_MODEL: '' });
  delete process.env.AWS_SESSION_TOKEN;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(process.env.AWS_ENDPOINT_URL)).ok) break; } catch {} if (i === 99) throw new Error('Install Moto using tests/aws-test-requirements.txt'); await pause(100); }
  const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
  await new DynamoDBClient({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL }).send(new CreateTableCommand({ TableName: process.env.DYNAMODB_TABLE, BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'dispatchPK', 'dispatchSK'].map(AttributeName => ({ AttributeName, AttributeType: 'S' })),
    KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
    GlobalSecondaryIndexes: [ ['OwnerIndex','GSI1PK','GSI1SK'], ['DispatchIndex','dispatchPK','dispatchSK'] ].map(([IndexName, pk, sk]) => ({ IndexName, KeySchema: [{ AttributeName: pk, KeyType: 'HASH' }, { AttributeName: sk, KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } })) }));
  const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
  await new S3Client({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true }).send(new CreateBucketCommand({ Bucket: process.env.DOCUMENT_BUCKET }));
  const { SQSClient, CreateQueueCommand } = require('@aws-sdk/client-sqs');
  process.env.PROCESSING_QUEUE_URL = (await new SQSClient({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL }).send(new CreateQueueCommand({ QueueName: 'prashn-test', Attributes: { VisibilityTimeout: '1' } }))).QueueUrl;
  clients = require('../dist/aws/clients'); jobs = new (require('../dist/repositories/dynamodb.repositories').CloudJobs)();
  ({ CloudDocumentWorker: Worker } = require('../dist/processing/sqs.processor'));
  dispatcher = new (require('../dist/processing/sqs.processor').CloudDocumentDispatcher)();
  await startApi();
  for (const [i, email] of ['owner@example.test','other@example.test'].entries()) {
    assert.equal((await request('/api/auth/register', json('POST', null, { email, password: 'TestPassword123!', fullName: 'Test Owner' }))).status, 201);
    const result = await request('/api/auth/login', json('POST', null, { email, password: 'TestPassword123!' }));
    assert.equal(result.status, 200); if (i === 0) a = result.body.token; else b = result.body.token;
  }
});
after(async () => { await stop(server); await stop(emulator); });

test('AWS mode health, missing-token protection and atomic duplicate registration', async () => {
  const health = await request('/api/health'); assert.equal(health.body.processingMode, 'sqs'); assert.equal(health.body.databaseMode, 'dynamodb');
  assert.equal((await request('/api/documents')).status, 401);
  const oversizedEmail='a'.repeat(2100)+'@example.test';
  for(const route of ['/api/auth/register','/api/auth/login']) assert.equal((await request(route,json('POST',null,{email:oversizedEmail,password:'TestPassword123!',fullName:'Invalid'}))).status,400);
  for(const token of ['invalid-token',require('jsonwebtoken').sign({userId:'missing'},process.env.JWT_SECRET,{expiresIn:-1}),require('jsonwebtoken').sign({userId:'missing'},'wrong-signing-secret')]) {
    assert.equal((await request('/api/documents',json('GET',token))).status,401);
  }
  const results = await Promise.all(Array.from({ length: 4 }, () => request('/api/auth/register', json('POST', null, { email: 'race@example.test', password: 'TestPassword123!', fullName: 'Race' }))));
  assert.deepEqual(results.map(r => r.status).sort(), [201,409,409,409]);
});
test('S3 upload, real worker extraction, scoped Q&A and preserved original bytes', async () => {
  const bytes = pdf([{ rows: ['INVOICE', 'Vendor: Northwind Supplies', 'Invoice Number: NW-1', 'Subtotal: USD 100.00', 'Tax: USD 10.00', 'Total: USD 110.00'] }]);
  const result = await upload(a, bytes); assert.equal(result.status, 201); documentId = result.body.document.id;
  const document = await drainUntil(documentId); assert.equal(document.status, 'Completed'); assert.match(document.storageKey, /^originals\//);
  assert.equal(document.extractedFields.find(f => f.label === 'Total').value, 'USD 110.00'); assert.match(document.pages[0].text, /Northwind/);
  const original = await fetch(base + `/api/documents/${documentId}/file`, { headers: { Authorization: `Bearer ${a}` } });
  assert.equal(original.status, 200); assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  const reply = await request(`/api/documents/${documentId}/questions`, json('POST', a, { question: 'What is the total?' }));
  assert.equal(reply.status, 201); assert.match(reply.body.message.text, /110\.00/); assert.equal(reply.body.message.citations[0].page, 1);
  const absent = await request(`/api/documents/${documentId}/questions`, json('POST', a, { question: 'What is the passport number?' }));
  assert.match(absent.body.message.text, /couldn't find/);
  for (const [route, method] of [[`/${documentId}`,'GET'],[`/${documentId}/file`,'GET'],[`/${documentId}/questions`,'GET'],[`/${documentId}/retry`,'POST'],[`/${documentId}`,'DELETE']]) {
    assert.equal((await request('/api/documents' + route, json(method,b))).status, 404);
  }
  assert.equal((await request('/api/documents', json('GET', b))).body.documents.length, 0);
});
test('question history and documents survive an actual API process restart', async () => {
  const route = `/api/documents/${documentId}/questions`;
  const history = (await request(route, json('GET', a))).body.conversation;
  assert.equal(history.length, 4); await stop(server); await startApi();
  assert.deepEqual((await request(route, json('GET', a))).body.conversation, history);
  assert.equal((await getDoc()).body.document.status, 'Completed');
});
test('concurrent independent uploads retain different vendors and totals', async () => {
  const expected=Array.from({length:4},(_,i)=>({vendor:`Supplier-${i}`,total:`USD ${20+i}.00`}));
  const uploaded=await Promise.all(expected.map(f=>upload(a,pdf([{rows:['INVOICE',`Vendor: ${f.vendor}`,`Total: ${f.total}`]}]))));
  await Promise.all([new Worker().runOnce(),new Worker().runOnce()]);
  await Promise.all([new Worker().runOnce(),new Worker().runOnce()]);
  for(let i=0;i<uploaded.length;i++) {
    assert.equal(uploaded[i].status,201);
    const document=(await getDoc(uploaded[i].body.document.id)).body.document;
    assert.equal(document.status,'Completed');
    assert.equal(document.extractedFields.find(f=>f.label==='Total').value,expected[i].total);
    assert.equal(document.extractedFields.find(f=>f.label==='Vendor / Seller').value,expected[i].vendor);
  }
});
test('duplicate queue delivery and concurrent retries produce one accepted generation', async () => {
  const { SendMessageCommand } = require('@aws-sdk/client-sqs');
  await clients.sqs.send(new SendMessageCommand({ QueueUrl: process.env.PROCESSING_QUEUE_URL, MessageBody: JSON.stringify({ id: documentId, userId: (await getDoc()).body.document.userId, generation: 1 }) }));
  await new Worker().runOnce();
  const replies = await Promise.all(Array.from({ length: 5 }, () => request(`/api/documents/${documentId}/retry`, json('POST', a))));
  assert.deepEqual(replies.map(r => r.status).sort(), [200,409,409,409,409]);
  await drainUntil(documentId);
  const activity = (await request('/api/activity', json('GET', a))).body;
  const events = activity.events || activity.activities || activity.activity;
  assert.equal(events.filter(e => e.documentId === documentId && e.event === 'Document Completed').length, 2);
});
test('DynamoDB lease excludes other workers and fences expired worker results', async () => {
  const owner = (await getDoc()).body.document.userId;
  const job = await jobs.schedule(documentId, owner); assert.ok(job);
  const first = await jobs.claim(job, 'first'); assert.ok(first);
  assert.equal(await jobs.claim(job, 'second'), null);
  const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  await clients.dynamo.send(new UpdateCommand({ TableName: process.env.DYNAMODB_TABLE, Key: { PK: `DOC#${documentId}`, SK: 'META' }, UpdateExpression: 'SET leaseUntil = :old', ExpressionAttributeValues: { ':old': Date.now() - 1 } }));
  assert.ok(await jobs.claim(job, 'second'));
  assert.equal(await jobs.change(job, 'first', { status: 'Completed' }, true), false);
  assert.equal(await jobs.change(job, 'second', { status: 'Queued' }, true), true);
  await dispatcher.recover(); await drainUntil(documentId);
});
test('outbox recovers a committed document when SQS dispatch fails', async () => {
  const { DynamoDocumentRepository, getCloudDocument } = require('../dist/repositories/dynamodb.repositories');
  const source = (await getDoc()).body.document;
  const fresh = { ...source, id: 'DOC-outbox-test', status: 'Uploaded', pages: undefined, extractedFields: undefined, lineItems: undefined };
  await new DynamoDocumentRepository().createDocument(fresh);
  const send = clients.sqs.send.bind(clients.sqs); clients.sqs.send = async command => { if (command.constructor.name === 'SendMessageCommand') throw new Error('Simulated outage'); return send(command); };
  try { assert.equal(await dispatcher.triggerPipeline(fresh.id, fresh.userId), true); } finally { clients.sqs.send = send; }
  assert.equal((await getCloudDocument(fresh.id)).dispatchPK, 'PENDING');
  await dispatcher.recover(); assert.equal((await drainUntil(fresh.id)).status, 'Completed');
});
test('full extracted content larger than DynamoDB item limit is retained in S3', async () => {
  const { DynamoDocumentRepository } = require('../dist/repositories/dynamodb.repositories');
  const source = (await getDoc()).body.document;
  const text = 'Complete document evidence. '.repeat(25000);
  const document = { ...source, id: 'DOC-large-output', pages: [{ page: 1, text, extractionMethod: 'text' }] };
  await new DynamoDocumentRepository().createDocument(document);
  assert.equal((await getDoc(document.id)).body.document.pages[0].text, text);
});
test('direct signed S3 upload verifies ownership, file signature, size and immutable acceptance', async () => {
  const bytes = pdf([{ rows:['INVOICE','Vendor: Direct Upload Vendor','Total: USD 234.00'] }]);
  const intent = await request('/api/documents/upload-intent',json('POST',a,{fileName:'direct.pdf',mimeType:'application/pdf',fileSize:bytes.length}));
  assert.equal(intent.status,201);
  const form = new FormData(); for (const [key,value] of Object.entries(intent.body.upload.fields)) form.append(key,value);
  form.append('file',new Blob([bytes],{type:'application/pdf'}),'direct.pdf');
  assert.equal((await fetch(intent.body.upload.url,{method:'POST',body:form})).status,204);
  const id=intent.body.documentId;
  assert.equal((await request(`/api/documents/${id}/finalize`,json('POST',b))).status,404);
  const accepted=await request(`/api/documents/${id}/finalize`,json('POST',a)); assert.equal(accepted.status,201);
  assert.match(accepted.body.document.storageKey,/^originals\//);
  // A still-valid signed POST can only overwrite staging, never the accepted original.
  const {PutObjectCommand}=require('@aws-sdk/client-s3');
  await clients.s3.send(new PutObjectCommand({Bucket:process.env.DOCUMENT_BUCKET,Key:intent.body.upload.fields.key,Body:'Changed staging',ContentType:'application/pdf'}));
  const doc=await drainUntil(id); assert.equal(doc.status,'Completed'); assert.equal(doc.extractedFields.find(f=>f.label==='Total').value,'USD 234.00');
  assert.equal((await request('/api/documents/upload-intent',json('POST',a,{fileName:'../invalid.pdf',mimeType:'application/pdf',fileSize:bytes.length}))).status,400);
  assert.equal((await request('/api/documents/upload-intent',json('POST',a,{fileName:'oversized.pdf',mimeType:'application/pdf',fileSize:10*1024*1024+1}))).status,400);
});
test('signed upload accepts the full 10 MiB boundary and rejects spoofed content', async () => {
  const bytes=Buffer.alloc(10*1024*1024,32);pdf([{rows:['INVOICE','Total: USD 1.00']}]).copy(bytes);
  async function signed(body,size,name) {
    const intent=await request('/api/documents/upload-intent',json('POST',a,{fileName:name,mimeType:'application/pdf',fileSize:size}));
    assert.equal(intent.status,201);
    const policy=JSON.parse(Buffer.from(intent.body.upload.fields.Policy,'base64').toString());
    assert.ok(policy.conditions.some(c=>Array.isArray(c)&&c[0]==='content-length-range'&&c[1]===size&&c[2]===size));
    const form=new FormData();for(const[k,v]of Object.entries(intent.body.upload.fields))form.append(k,v);
    form.append('file',new Blob([body],{type:'application/pdf'}),name);
    assert.equal((await fetch(intent.body.upload.url,{method:'POST',body:form})).status,204);
    return intent.body.documentId;
  }
  const id=await signed(bytes,bytes.length,'boundary.pdf');
  assert.equal((await request(`/api/documents/${id}/finalize`,json('POST',a))).status,201);
  assert.equal((await request(`/api/documents/${id}`,json('DELETE',a))).status,200);
  const bad=await signed(Buffer.from('not a PDF'),9,'spoof.pdf');
  assert.equal((await request(`/api/documents/${bad}/finalize`,json('POST',a))).status,400);
  assert.equal((await request(`/api/documents/${bad}`,json('DELETE',a))).status,200);
});
test('transient storage failure is retried without losing the queued job', async () => {
  const result=await upload(a,pdf([{rows:['INVOICE','Vendor: Retry Supplier','Total: USD 321.00']} ])); const id=result.body.document.id;
  const send=clients.s3.send.bind(clients.s3); let injected=false;
  clients.s3.send=async command=>{if(command.constructor.name==='GetObjectCommand'&&command.input.Key===result.body.document.storageKey&&!injected){injected=true;throw new Error('Simulated storage outage');}return send(command);};
  try {for(let i=0;i<20&&!injected;i++)await new Worker().runOnce();assert.equal(injected,true);} finally {clients.s3.send=send;}
  const {getCloudDocument}=require('../dist/repositories/dynamodb.repositories');
  assert.equal((await getCloudDocument(id)).status,'Queued');
  assert.equal((await getCloudDocument(id)).attempts,1);
  // Shorten the test visibility interval without changing production defaults.
  await pause(1300);
  // The worker receipt used a 120-second visibility timeout; find it through a
  // test-only queue reset instead of waiting two minutes.
  const {SendMessageCommand}=require('@aws-sdk/client-sqs'); const row=await getCloudDocument(id);
  await clients.sqs.send(new SendMessageCommand({QueueUrl:process.env.PROCESSING_QUEUE_URL,MessageBody:JSON.stringify({id,userId:row.userId,generation:row.generation})}));
  assert.equal((await drainUntil(id)).status,'Completed');
  assert.equal((await getCloudDocument(id)).attempts,2);
});
test('long-running worker renews the database lease and SQS visibility before committing', {timeout:45000}, async () => {
  const uploaded=await upload(a,pdf([{rows:['INVOICE','Vendor: Heartbeat Supplier','Total: USD 88.00']} ])); const id=uploaded.body.document.id;
  const Storage=require('../dist/storage/s3.storage').S3StorageProvider;
  const original=Storage.prototype.withLocalFile;
  let entered; const gate=new Promise(resolve=>{entered=resolve;});let release;const ready=new Promise(resolve=>{release=resolve;});
  Storage.prototype.withLocalFile=function(key,consume){return original.call(this,key,async file=>{if(key===uploaded.body.document.storageKey){entered();await ready;}return consume(file);});};
  const send=clients.sqs.send.bind(clients.sqs);let renewals=0;
  clients.sqs.send=async command=>{if(command.constructor.name==='ChangeMessageVisibilityCommand')renewals++;return send(command);};
  const working=(async()=>{for(let i=0;i<20;i++)await new Worker().runOnce();})();
  try {
    await gate;const {getCloudDocument}=require('../dist/repositories/dynamodb.repositories');const before=(await getCloudDocument(id)).leaseUntil;
    await pause(31500);assert.ok(renewals>=1);assert.ok((await getCloudDocument(id)).leaseUntil>before);
    release();await working;assert.equal((await getDoc(id)).body.document.status,'Completed');
  } finally {release();Storage.prototype.withLocalFile=original;clients.sqs.send=send;}
});
test('corrupt PDF records failure; retry stays scoped and creates a new generation', async () => {
  const result = await upload(a, Buffer.from('%PDF-1.7\ncorrupt'), 'corrupt.pdf'); assert.equal(result.status,201);
  const id = result.body.document.id; assert.equal((await drainUntil(id)).status,'Failed');
  assert.equal((await request(`/api/documents/${id}/retry`, json('POST',b))).status,404);
  assert.equal((await request(`/api/documents/${id}/retry`, json('POST',a))).status,200);
  assert.equal((await drainUntil(id)).status,'Failed');
});
test('expired signed-upload intents and interrupted deletions are recovered', async () => {
  const intent=await request('/api/documents/upload-intent',json('POST',a,{fileName:'expired.pdf',mimeType:'application/pdf',fileSize:12}));
  assert.equal(intent.status,201);
  const {UpdateCommand}=require('@aws-sdk/lib-dynamodb');
  await clients.dynamo.send(new UpdateCommand({TableName:process.env.DYNAMODB_TABLE,Key:{PK:`DOC#${intent.body.documentId}`,SK:'META'},UpdateExpression:'SET uploadExpiresAt = :old',ExpressionAttributeValues:{':old':Date.now()-1}}));
  await dispatcher.recover(); assert.equal((await getDoc(intent.body.documentId)).status,404);
  const staged=await upload(a,pdf([{rows:['INVOICE','Total: USD 9.00']}])); const id=staged.body.document.id;
  const {DynamoDocumentRepository}=require('../dist/repositories/dynamodb.repositories');
  await new DynamoDocumentRepository().beginDelete(id,staged.body.document.userId);
  await dispatcher.recover(); assert.equal((await getDoc(id)).status,404);
});
test('migration validates read-only and preserves account IDs, bytes, text and history', async () => {
  const snapshot=path.join(run,'snapshot'); await fs.mkdir(path.join(snapshot,'uploads'),{recursive:true}); await fs.mkdir(path.join(snapshot,'processed'));
  const id='DOC-migration-test'; const userId=crypto.randomUUID();
  const bytes=pdf([{rows:['INVOICE','Vendor: Archive Supplier','Total: USD 555.00']}]);
  await fs.writeFile(path.join(snapshot,'uploads','migration.pdf'),bytes);
  const extracted=await new (require('../dist/processing/local.extractor').LocalExtractor)().extractText(path.join(snapshot,'uploads','migration.pdf'),'application/pdf');
  const fields=new (require('../dist/processing/field_extractor').StructuredFieldExtractor)().extractFields(extracted.text,'Invoice',extracted.pages);
  const stamp=new Date().toISOString();
  const owner={id:userId,email:'migration@example.test',passwordHash:await require('bcrypt').hash('TestPassword123!',10),fullName:'Archive Owner',role:'user',createdAt:stamp,updatedAt:stamp};
  const source={id,userId,fileName:'migration.pdf',originalFileName:'migration.pdf',mimeType:'application/pdf',fileSize:bytes.length,formattedSize:'1 KB',storageKey:'migration.pdf',status:'Completed',documentType:'Invoice',pagesCount:1,uploadDate:stamp,createdAt:stamp,updatedAt:stamp,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),pages:JSON.stringify(extracted.pages),extractedFields:JSON.stringify(fields.extractedFields),lineItems:JSON.stringify(fields.lineItems)};
  await fs.writeFile(path.join(snapshot,'processed',`${id}.txt`),extracted.text);
  const db=await require('sqlite').open({filename:path.join(snapshot,'prashn.db'),driver:require('sqlite3').Database});
  await db.exec('CREATE TABLE users(id,email,passwordHash,fullName,role,createdAt,updatedAt); CREATE TABLE documents('+Object.keys(source).join(',')+'); CREATE TABLE qa_messages(id,documentId,userId,sender,text,timestamp,createdAt,citations); CREATE TABLE activity_events(id,userId,timestamp,event,documentName,documentId,actor,status,details,createdAt,logJson)');
  await db.run('INSERT INTO users VALUES(?,?,?,?,?,?,?)',Object.values(owner));
  await db.run('INSERT INTO documents VALUES('+Object.keys(source).map(()=>'?').join(',')+')',Object.values(source));
  await db.run('INSERT INTO qa_messages VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),id,userId,'user','What is the total?',stamp,stamp,null]);
  await db.run('INSERT INTO qa_messages VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),id,userId,'assistant','USD 555.00',stamp,stamp,JSON.stringify([{page:1,snippet:'Total: USD 555.00',source:'migration.pdf'}])]);
  await db.close(); const dbBytes=await fs.readFile(path.join(snapshot,'prashn.db'));
  async function migrate(apply) {
    const child=spawn(process.execPath,['dist/migrate.js','--snapshot',snapshot,...(apply?['--apply']:[])],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:['ignore','pipe','pipe']});
    let output=''; child.stdout.on('data',data=>{output+=data;}); child.stderr.on('data',data=>{output+=data;});
    const code=await new Promise(resolve=>child.once('exit',resolve)); assert.equal(code,0,output);
  }
  await migrate(false); assert.equal(await require('../dist/repositories/dynamodb.repositories').getCloudDocument(id),null);
  await migrate(true); await migrate(true);
  assert.deepEqual(await fs.readFile(path.join(snapshot,'prashn.db')),dbBytes); assert.deepEqual(await fs.readFile(path.join(snapshot,'uploads','migration.pdf')),bytes);
  const login=await request('/api/auth/login',json('POST',null,{email:owner.email,password:'TestPassword123!'})); assert.equal(login.status,200);
  const token=login.body.token; const document=(await getDoc(id,token)).body.document;
  assert.equal(document.userId,userId); assert.equal(document.pages[0].text,extracted.pages[0].text);
  assert.equal((await request(`/api/documents/${id}/questions`,json('GET',token))).body.conversation.length,2);
  const answer=await request(`/api/documents/${id}/questions`,json('POST',token,{question:'What is the total?'})); assert.match(answer.body.message.text,/555\.00/);
  assert.equal((await getDoc(id,a)).status,404);
});
test('delete during processing prevents late publication and cleans history/storage', { timeout:20000 }, async () => {
  const result = await upload(a, pdf([{ rows: ['INVOICE','Vendor: Delete Test','Total: USD 77.00'] }]));
  const id = result.body.document.id;
  const Storage = require('../dist/storage/s3.storage').S3StorageProvider;
  const original = Storage.prototype.withLocalFile;
  let enter; const entered = new Promise(resolve => { enter = resolve; }); let release; const ready = new Promise(resolve => { release = resolve; });
  Storage.prototype.withLocalFile = function(key, consume) { return original.call(this, key, async file => { enter(); await ready; return consume(file); }); };
  const working = (async()=>{for(let i=0;i<20;i++) await new Worker().runOnce();})();
  try {
    await entered; assert.equal((await request(`/api/documents/${id}`,json('DELETE',a))).status,200); release(); await working;
  } finally { release(); Storage.prototype.withLocalFile = original; }
  assert.equal((await getDoc(id)).status,404);
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  assert.equal((await clients.s3.send(new ListObjectsV2Command({ Bucket: process.env.DOCUMENT_BUCKET, Prefix: `results/${id}/` }))).KeyCount,0);
  assert.equal((await request(`/api/documents/${documentId}`,json('DELETE',a))).status,200);
  assert.equal((await request(`/api/documents/${documentId}/questions`,json('GET',a))).status,404);
  assert.equal((await request(`/api/documents/${documentId}/file`,json('GET',a))).status,404);
});
test('repeated worker interruptions become a recorded failure and a user retry succeeds', async () => {
  const uploaded=await upload(a,pdf([{rows:['INVOICE','Vendor: Recovery Supplier','Total: USD 66.00']} ]));const id=uploaded.body.document.id;
  const {getCloudDocument}=require('../dist/repositories/dynamodb.repositories');const row=await getCloudDocument(id);
  const job={id,userId:row.userId,generation:row.generation};const {UpdateCommand}=require('@aws-sdk/lib-dynamodb');
  for(let attempt=0;attempt<5;attempt++) {
    assert.ok(await jobs.claim(job,`interrupted-${attempt}`));
    await clients.dynamo.send(new UpdateCommand({TableName:process.env.DYNAMODB_TABLE,Key:{PK:`DOC#${id}`,SK:'META'},UpdateExpression:'SET leaseUntil = :old',ExpressionAttributeValues:{':old':Date.now()-1}}));
  }
  for(let i=0;i<20&&(await getCloudDocument(id)).status!=='Failed';i++)await new Worker().runOnce();
  const failed=await getCloudDocument(id);assert.equal(failed.status,'Failed');assert.match(failed.failureReason,/worker interruptions/);
  assert.equal((await request(`/api/documents/${id}/retry`,json('POST',a))).status,200);
  const completed=await drainUntil(id);assert.equal(completed.status,'Completed');assert.equal(completed.extractedFields.find(f=>f.label==='Total').value,'USD 66.00');
});
test('sent outbox recovers a missing queue message without changing its generation', async () => {
  const uploaded=await upload(a,pdf([{rows:['INVOICE','Vendor: Outage Supplier','Total: USD 77.00']} ]));const id=uploaded.body.document.id;
  const {ReceiveMessageCommand,DeleteMessageCommand}=require('@aws-sdk/client-sqs');
  let removed=false;
  for(let i=0;i<20&&!removed;i++) {
    const result=await clients.sqs.send(new ReceiveMessageCommand({QueueUrl:process.env.PROCESSING_QUEUE_URL,MaxNumberOfMessages:10,WaitTimeSeconds:0}));
    for(const message of result.Messages || []) {
      if(JSON.parse(message.Body).id===id) removed=true;
      await clients.sqs.send(new DeleteMessageCommand({QueueUrl:process.env.PROCESSING_QUEUE_URL,ReceiptHandle:message.ReceiptHandle}));
    }
  }
  assert.equal(removed,true);
  const {UpdateCommand}=require('@aws-sdk/lib-dynamodb');
  await clients.dynamo.send(new UpdateCommand({TableName:process.env.DYNAMODB_TABLE,Key:{PK:`DOC#${id}`,SK:'META'},UpdateExpression:'SET dispatchSentAt = :old',ExpressionAttributeValues:{':old':Date.now()-16*60*1000}}));
  await dispatcher.recover();const complete=await drainUntil(id);assert.equal(complete.status,'Completed');
  assert.equal(complete.generation,1);assert.equal(complete.extractedFields.find(f=>f.label==='Total').value,'USD 77.00');
});
