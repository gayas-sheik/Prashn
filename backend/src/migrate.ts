import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createHash } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { s3, dynamo, sqs } from './aws/clients';
import { config } from './config/env';
import { DynamoUserRepository, DynamoDocumentRepository, DynamoActivityRepository, getCloudDocument, isConditional } from './repositories/dynamodb.repositories';
import { Document, User } from './types';

async function main() {
  if (config.databaseMode !== 'dynamodb') throw new Error('Migration requires explicit AWS mode and authenticated operator credentials');
  const position = process.argv.indexOf('--snapshot');
  if (position < 0 || !process.argv[position+1]) throw new Error('Use --snapshot /private/consistent-snapshot [--apply]');
  const snapshot = await fs.promises.realpath(process.argv[position+1]);
  const uploadRoot = await fs.promises.realpath(path.join(snapshot,'uploads'));
  const db = await open({ filename:path.join(snapshot,'prashn.db'),driver:sqlite3.Database,mode:sqlite3.OPEN_READONLY });
  const users: User[] = await db.all('SELECT * FROM users');
  const rows: any[] = await db.all('SELECT * FROM documents');
  const messages: any[] = await db.all('SELECT rowid AS sourceOrder, * FROM qa_messages ORDER BY rowid');
  const events: any[] = await db.all('SELECT * FROM activity_events');
  await db.close();
  const owners = new Set(users.map(user=>user.id));
  const sourceDocuments = new Map(rows.map(row=>[row.id,row]));
  const usersRepo = new DynamoUserRepository();
  for (const user of users) {
    const current = await usersRepo.findByEmail(user.email);
    if (current && (current.id !== user.id || current.passwordHash !== user.passwordHash)) throw new Error('Target user collision; ownership cannot be merged by email');
    const profile=await usersRepo.findById(user.id);
    if(profile && (profile.email!==user.email || profile.passwordHash!==user.passwordHash)) throw new Error('Target account identifier collision');
  }
  const files = new Map<string,string>();
  const hashes = new Map<string,string>();
  for (const row of rows) {
    if (!owners.has(row.userId) || !/^DOC-[A-Za-z0-9-]{1,80}$/.test(row.id)) throw new Error('Invalid source document ownership or identifier');
    for(const field of ['pages','extractedFields','lineItems']) if(row[field]) {
      let value; try {value=JSON.parse(row[field]);} catch {throw new Error('Invalid source extraction JSON');}
      if(!Array.isArray(value)) throw new Error('Invalid source extraction arrays');
      if(field==='pages' && value.some(page=>typeof page.text!=='string' || !Number.isInteger(page.page))) throw new Error('Invalid source page evidence');
    }
    const file = await fs.promises.realpath(path.resolve(uploadRoot,row.storageKey));
    const relative = path.relative(uploadRoot,file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Source original is outside snapshot upload directory');
    const hash = createHash('sha256').update(await fs.promises.readFile(file)).digest('hex');
    if (row.sha256 && row.sha256 !== hash) throw new Error('Source original checksum mismatch; migration stopped');
    const current = await getCloudDocument(row.id);
    if (current && (current.userId !== row.userId || current.deletedAt || (current.sha256 && current.sha256 !== hash))) throw new Error('Target document collision; migration stopped');
    files.set(row.id,file); hashes.set(row.id,hash);
  }
  for (const message of messages) {
    if (sourceDocuments.get(message.documentId)?.userId !== message.userId) throw new Error('Source question ownership mismatch');
    if(message.citations) try {JSON.parse(message.citations);} catch {throw new Error('Invalid source citations JSON');}
  }
  for (const event of events) {
    if (!owners.has(event.userId)) throw new Error('Source activity ownership mismatch');
    if(event.logJson) try {JSON.parse(event.logJson);} catch {throw new Error('Invalid source activity JSON');}
  }
  const summary = { users:users.length,documents:rows.length,messages:messages.length,activity:events.length };
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ mode:'read-only validation',...summary })); return; }
  for (const user of users) if (!await usersRepo.findById(user.id)) await usersRepo.createUser(user);
  const documentsRepo = new DynamoDocumentRepository();
  for (const row of rows) {
    if (await getCloudDocument(row.id)) continue;
    const storageKey = `originals/migrated-${row.id}`;
    const file=files.get(row.id)!;
    await s3.send(new PutObjectCommand({Bucket:config.documentBucket,Key:storageKey,Body:fs.createReadStream(file),
      ContentLength:(await fs.promises.stat(file)).size,ContentType:row.mimeType,ServerSideEncryption:'AES256'}));
    const parsed = {...row,storageKey,sha256:hashes.get(row.id),s3Uri:`s3://${config.documentBucket}/${storageKey}`,
      pages:row.pages ? JSON.parse(row.pages) : undefined,extractedFields:row.extractedFields ? JSON.parse(row.extractedFields) : undefined,lineItems:row.lineItems ? JSON.parse(row.lineItems) : undefined };
    if (!['Completed','Failed'].includes(parsed.status) || (parsed.status==='Completed' && !parsed.pages?.length)) parsed.status='Uploaded';
    let text: string | undefined;
    try { text=await fs.promises.readFile(path.join(snapshot,'processed',`${row.id}.txt`),'utf8'); } catch (error:any) { if (error.code!=='ENOENT') throw error; }
    await documentsRepo.createDocument(parsed as Document,text,false);
  }
  for (const message of messages) {
    const {sourceOrder,...msg}=message;
    const item={...msg,citations:msg.citations ? JSON.parse(msg.citations):undefined,PK:`DOC#${msg.documentId}`,SK:`QA#${msg.timestamp}#IMPORT#${String(sourceOrder).padStart(16,'0')}`};
    try {
      await dynamo.send(new TransactWriteCommand({TransactItems:[
        {ConditionCheck:{TableName:config.dynamodbTable,Key:{PK:`DOC#${msg.documentId}`,SK:'META'},ConditionExpression:'userId = :owner AND attribute_not_exists(deletedAt)',ExpressionAttributeValues:{':owner':msg.userId}}},
        {Put:{TableName:config.dynamodbTable,Item:item,ConditionExpression:'attribute_not_exists(PK)'}}]}));
    } catch (error) { if (!isConditional(error)) throw error; }
  }
  const activities=new DynamoActivityRepository();
  for (const event of events) await activities.createEvent({...event,logJson:event.logJson ? JSON.parse(event.logJson):undefined});
  for (const row of rows) {
    const target=await documentsRepo.findByIdAndUserId(row.id,row.userId);
    if (!target || target.sha256!==hashes.get(row.id)) throw new Error('Post-migration ownership/checksum verification failed');
  }
  console.log(JSON.stringify({mode:'import completed; source preserved',...summary}));
}
main().catch(error=>{console.error(JSON.stringify({event:'migration_failed',errorType:error.name,message:error.message}));process.exitCode=1;})
  .finally(()=>{s3.destroy();dynamo.destroy();sqs.destroy();});
