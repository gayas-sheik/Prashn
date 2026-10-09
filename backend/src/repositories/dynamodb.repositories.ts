import { GetCommand, PutCommand, QueryCommand, UpdateCommand, TransactWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { dynamo } from '../aws/clients';
import { config } from '../config/env';
import { Document, User, QAMessage, ActivityEvent, DocumentStatus } from '../types';
import { putOutput, readOutput, removeOutput } from '../storage/s3.storage';

export interface CloudDocument extends Document {
  generation: number;
  resultKey?: string;
  deletedAt?: string;
  leaseToken?: string;
  leaseUntil?: number;
  attempts?: number;
  dispatchPK?: string;
  dispatchSK?: string;
  dispatchSentAt?: number;
  transientFailed?: boolean;
}
export interface ProcessingJob { id: string; userId: string; generation: number }
const table = () => config.dynamodbTable;
const key = (id: string) => ({ PK: `DOC#${id}`, SK: 'META' });
const uploadEvent = (doc: Document, timestamp: string) => ({ PK:`USER#${doc.userId}`, SK:`ACT#UPLOAD-${doc.id}`,
  id:`UPLOAD-${doc.id}`,userId:doc.userId,documentId:doc.id,documentName:doc.originalFileName,timestamp,createdAt:timestamp,
  actor:doc.uploaderName || 'System',status:'Success',event:'Document Uploaded',details:'Document uploaded successfully and queued for processing.' });
export const isConditional = (error: any) => error?.name === 'ConditionalCheckFailedException' ||
  (error?.name === 'TransactionCanceledException' && (error.CancellationReasons?.some((reason: any) => reason.Code === 'ConditionalCheckFailed') || /\bConditionalCheckFailed\b/.test(error.message || '')));
async function transaction(command: TransactWriteCommand): Promise<void> {
  for (let attempt=0; ; attempt++) {
    try { await dynamo.send(command); return; }
    catch (error:any) {
      const conflict=error.name==='TransactionConflictException' || error.CancellationReasons?.some((reason:any)=>reason.Code==='TransactionConflict') || (error.name==='TransactionCanceledException' && /\bTransactionConflict\b/.test(error.message || ''));
      if (!conflict || attempt>=4) throw error;
      await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)+Math.floor(Math.random()*40)));
    }
  }
}

export async function getCloudDocument(id: string): Promise<CloudDocument | null> {
  const result = await dynamo.send(new GetCommand({ TableName: table(), Key: key(id), ConsistentRead: true }));
  return (result.Item as CloudDocument | undefined) || null;
}
async function queryAll(pk: string, prefix: string, index?: string): Promise<any[]> {
  const items: any[] = [];
  let start: Record<string, any> | undefined;
  do {
    const result = await dynamo.send(new QueryCommand({ TableName: table(), IndexName: index,
      KeyConditionExpression: '#pk = :pk' + (prefix ? ' AND begins_with(#sk, :prefix)' : ''),
      ExpressionAttributeNames: { '#pk': index === 'DispatchIndex' ? 'dispatchPK' : index ? 'GSI1PK' : 'PK', ...(prefix ? { '#sk': index === 'DispatchIndex' ? 'dispatchSK' : index ? 'GSI1SK' : 'SK' } : {}) },
      ExpressionAttributeValues: { ':pk': pk, ...(prefix ? { ':prefix': prefix } : {}) }, ExclusiveStartKey: start,
      ConsistentRead: !index, Limit: 100 }));
    items.push(...(result.Items || [])); start = result.LastEvaluatedKey;
  } while (start);
  return items;
}
const publicDocument = (row: any): CloudDocument => {
  const { PK: _pk, SK: _sk, GSI1PK: _gpk, GSI1SK: _gsk, dispatchPK: _dpk, dispatchSK: _dsk, leaseToken: _token, leaseUntil: _until, ...doc } = row;
  return doc;
};
async function hydrate(row: any): Promise<CloudDocument> {
  const document = publicDocument(row);
  if (row.resultKey) {
    const { pages, extractedFields, lineItems } = await readOutput<Pick<Document, 'pages' | 'extractedFields' | 'lineItems'>>(row.resultKey);
    Object.assign(document, { pages, extractedFields, lineItems });
  }
  return document;
}

export class DynamoUserRepository {
  async createUser(user: User): Promise<void> {
    try {
      await transaction(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: table(), Item: { PK: `EMAIL#${user.email}`, SK: 'UNIQUE', userId: user.id }, ConditionExpression: 'attribute_not_exists(PK)' } },
        { Put: { TableName: table(), Item: { PK: `USER#${user.id}`, SK: 'PROFILE', ...user }, ConditionExpression: 'attribute_not_exists(PK)' } },
      ] }));
    } catch (error) {
      if (isConditional(error)) throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_EXISTS' });
      throw error;
    }
  }
  async findByEmail(email: string): Promise<User | null> {
    const result = await dynamo.send(new GetCommand({ TableName: table(), Key: { PK: `EMAIL#${email}`, SK: 'UNIQUE' }, ConsistentRead: true }));
    return result.Item ? this.findById(result.Item.userId) : null;
  }
  async findById(id: string): Promise<User | null> {
    const result = await dynamo.send(new GetCommand({ TableName: table(), Key: { PK: `USER#${id}`, SK: 'PROFILE' }, ConsistentRead: true }));
    if (!result.Item) return null;
    const { PK: _pk, SK: _sk, ...user } = result.Item;
    return user as User;
  }
}

export class DynamoDocumentRepository {
  async finalizeUpload(id: string, userId: string, storageKey: string): Promise<void> {
    const doc=await getCloudDocument(id);
    if (!doc || doc.userId!==userId) throw Object.assign(new Error('Document not found'),{name:'ConditionalCheckFailedException'});
    const stamp=new Date().toISOString();
    const update={ TableName: table(), Key: key(id),
      UpdateExpression: 'SET storageKey = :key, s3Uri = :uri, #status = :uploaded, dispatchPK = :pending, dispatchSK = :id, updatedAt = :stamp, uploadDate = :stamp, GSI1SK = :index REMOVE uploadExpiresAt',
      ConditionExpression: 'userId = :owner AND #status = :uploading AND attribute_not_exists(deletedAt) AND uploadExpiresAt >= :now',
      ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':owner': userId, ':key': storageKey, ':uploaded': 'Uploaded',
        ':uploading': 'Uploading', ':pending': 'PENDING', ':id': id, ':stamp': stamp, ':now': Date.now(), ':uri':`s3://${config.documentBucket}/${storageKey}`, ':index':`DOC#${stamp}#${id}` } };
    await transaction(new TransactWriteCommand({TransactItems:[{Update:update},{Put:{TableName:table(),Item:uploadEvent(doc,stamp)}}]}));
  }
  async createDocument(doc: Document, completeText?: string, recordUpload=true): Promise<void> {
    const { pages, extractedFields, lineItems, ...metadata } = doc;
    let resultKey: string | undefined;
    if (pages || extractedFields || lineItems) {
      resultKey = `results/${doc.id}/import-${randomUUID()}.json`;
      await putOutput(resultKey, { pages, extractedFields, lineItems, text: completeText ?? pages?.map(page => page.text).join('\n\f\n') });
    }
    const put={ TableName: table(), Item: { ...key(doc.id), ...metadata, s3Uri:`s3://${config.documentBucket}/${doc.storageKey}`,
      generation: 0, resultKey, GSI1PK: `USER#${doc.userId}`, GSI1SK: `DOC#${doc.uploadDate}#${doc.id}`,
      ...(['Uploaded','Uploading'].includes(doc.status) ? { dispatchPK: doc.status === 'Uploading' ? 'UPLOAD' : 'PENDING', dispatchSK: doc.id } : {}) },
      ConditionExpression: 'attribute_not_exists(PK)' };
    try {
      if (recordUpload && doc.status==='Uploaded') await transaction(new TransactWriteCommand({TransactItems:[{Put:put},{Put:{TableName:table(),Item:uploadEvent(doc,doc.uploadDate)}}]}));
      else await dynamo.send(new PutCommand(put));
    } catch (error) { if (resultKey) await removeOutput(resultKey).catch(()=>{}); throw error; }
  }
  async updateDocument(doc: Partial<Document> & { id: string }): Promise<void> {
    const { id, pages, extractedFields, lineItems, ...changes } = doc;
    if (pages || extractedFields || lineItems) throw new Error('Cloud processing must publish results through the leased job commit');
    const fields = Object.keys(changes).filter(field => (changes as any)[field] !== undefined && !['userId', 'storageKey'].includes(field));
    if (!fields.length) return;
    await dynamo.send(new UpdateCommand({ TableName: table(), Key: key(id),
      UpdateExpression: `SET ${fields.map((field, i) => `#f${i} = :v${i}`).join(', ')}, updatedAt = :now`,
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
      ExpressionAttributeNames: Object.fromEntries(fields.map((field, i) => [`#f${i}`, field])),
      ExpressionAttributeValues: { ...Object.fromEntries(fields.map((field, i) => [`:v${i}`, (changes as any)[field]])), ':now': new Date().toISOString() } }));
  }
  async findByIdAndUserId(id: string, userId: string): Promise<Document | null> {
    const row = await getCloudDocument(id);
    return row && row.userId === userId && !row.deletedAt ? hydrate(row) : null;
  }
  async findAllByUserId(userId: string): Promise<Document[]> {
    const rows = await queryAll(`USER#${userId}`, 'DOC#', 'OwnerIndex');
    const documents: Document[] = [];
    // Strong reads exclude deleted/stale index entries and confirm ownership.
    for (const row of rows.reverse()) {
      const document = await this.findByIdAndUserId(row.id, userId);
      if (document) documents.push(document);
    }
    return documents;
  }
  async findForDeletion(id: string, userId: string): Promise<Document | null> {
    const row = await getCloudDocument(id);
    return row?.userId === userId && row.storageKey ? publicDocument(row) : null;
  }
  async beginDelete(id: string, userId: string): Promise<void> {
    await dynamo.send(new UpdateCommand({ TableName: table(), Key: key(id),
      UpdateExpression: 'SET deletedAt = if_not_exists(deletedAt, :now), generation = generation + :one, dispatchPK = :delete, dispatchSK = :id REMOVE leaseToken, leaseUntil',
      ConditionExpression: 'attribute_exists(PK) AND userId = :owner',
      ExpressionAttributeValues: { ':owner': userId, ':now': new Date().toISOString(), ':one': 1, ':delete': 'DELETE', ':id': id } }));
  }
  async deleteByIdAndUserId(id: string, userId: string): Promise<boolean> {
    const row = await getCloudDocument(id);
    if (!row || row.userId !== userId) return false;
    if (!row.deletedAt) await this.beginDelete(id, userId);
    const messages = await queryAll(`DOC#${id}`, 'QA#');
    for (const message of messages) await dynamo.send(new DeleteCommand({ TableName: table(), Key: { PK: message.PK, SK: message.SK } }));
    // A small tombstone prevents late messages from resurrecting a deleted document.
    await dynamo.send(new PutCommand({ TableName: table(), Item: { ...key(id), userId,
      deletedAt: row.deletedAt || new Date().toISOString(), generation: row.generation + 1 },
      ConditionExpression: 'userId = :owner AND attribute_exists(deletedAt)', ExpressionAttributeValues: { ':owner': userId } }));
    return true;
  }
  async findPending(): Promise<Document[]> { return []; } // SQS outbox recovery is separate.
}

export class DynamoQuestionRepository {
  async createMessage(msg: QAMessage): Promise<void> {
    await this.write([msg]);
  }
  private async write(messages: QAMessage[]): Promise<void> {
    const first = messages[0];
    await transaction(new TransactWriteCommand({ TransactItems: [
      { ConditionCheck: { TableName: table(), Key: key(first.documentId),
        ConditionExpression: 'attribute_exists(PK) AND userId = :owner AND attribute_not_exists(deletedAt) AND #status = :completed',
        ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':owner': first.userId, ':completed': 'Completed' } } },
      ...messages.map((msg, index) => ({ Put: { TableName: table(), Item: { PK: `DOC#${msg.documentId}`,
        SK: `QA#${msg.timestamp}#${messages[0].id}#${index}`, ...msg }, ConditionExpression: 'attribute_not_exists(PK)' } })),
    ] }));
  }
  async createPair(user: QAMessage, assistant: QAMessage): Promise<void> { await this.write([user, assistant]); }
  async findByDocumentIdAndUserId(documentId: string, userId: string): Promise<QAMessage[]> {
    const doc = await getCloudDocument(documentId);
    if (!doc || doc.userId !== userId || doc.deletedAt) return [];
    return (await queryAll(`DOC#${documentId}`, 'QA#')).filter(row => row.userId === userId).map(({ PK: _pk, SK: _sk, ...msg }) => msg);
  }
  async clear(documentId: string, userId: string): Promise<void> {
    const doc = await getCloudDocument(documentId);
    if (!doc || doc.userId !== userId || doc.deletedAt) return;
    for (const row of await queryAll(`DOC#${documentId}`, 'QA#')) {
      if (row.userId === userId) await dynamo.send(new DeleteCommand({ TableName: table(), Key: { PK: row.PK, SK: row.SK } }));
    }
  }
}
export class DynamoActivityRepository {
  async createEvent(event: ActivityEvent): Promise<void> {
    try {
      await dynamo.send(new PutCommand({ TableName: table(), Item: { PK: `USER#${event.userId}`,
        SK: `ACT#${event.id}`, ...event }, ConditionExpression: 'attribute_not_exists(PK)' }));
    } catch (error) { if (!isConditional(error)) throw error; }
  }
  async findAllByUserId(userId: string): Promise<ActivityEvent[]> {
    return (await queryAll(`USER#${userId}`, 'ACT#')).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(({ PK: _pk, SK: _sk, ...event }) => event);
  }
}

export class CloudJobs {
  async cleanupCandidates(): Promise<CloudDocument[]> {
    const expired = (await queryAll('UPLOAD', '', 'DispatchIndex')).filter(row => row.uploadExpiresAt < Date.now());
    return [...expired, ...await queryAll('DELETE', '', 'DispatchIndex')];
  }
  async schedule(id: string, userId: string): Promise<ProcessingJob | null> {
    try {
      const result = await dynamo.send(new UpdateCommand({ TableName: table(), Key: key(id),
        UpdateExpression: 'SET #status = :queued, generation = generation + :one, attempts = :zero, dispatchPK = :dispatch, dispatchSK = :id, updatedAt = :now REMOVE failureReason, leaseToken, leaseUntil, transientFailed',
        ConditionExpression: 'attribute_exists(PK) AND userId = :owner AND attribute_not_exists(deletedAt) AND #status IN (:uploaded, :failed, :completed)',
        ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':owner': userId, ':one': 1, ':zero': 0,
          ':queued': 'Queued', ':uploaded': 'Uploaded', ':failed': 'Failed', ':completed': 'Completed',
          ':dispatch': 'PENDING', ':id': id, ':now': new Date().toISOString() }, ReturnValues: 'ALL_NEW' }));
      return { id, userId, generation: result.Attributes!.generation };
    } catch (error) { if (isConditional(error)) return null; throw error; }
  }
  async pending(): Promise<ProcessingJob[]> {
    const rows = await queryAll('PENDING', '', 'DispatchIndex');
    // Keep sent jobs discoverable until terminal commit. This also recovers a
    // queued message lost to retention after an extended worker outage.
    const sent=(await queryAll('SENT','','DispatchIndex')).filter(row =>
      (row.dispatchSentAt || 0)<Date.now()-15*60*1000 && (row.leaseUntil || 0)<Date.now() && !['Completed','Failed'].includes(row.status));
    return [...rows,...sent].filter(row => !row.deletedAt).map(row => ({ id: row.id, userId: row.userId, generation: row.generation }));
  }
  async dispatched(job: ProcessingJob): Promise<void> {
    try {
      await dynamo.send(new UpdateCommand({ TableName: table(), Key: key(job.id), UpdateExpression: 'SET dispatchPK = :sent, dispatchSK = :id, dispatchSentAt = :now',
        ConditionExpression: 'generation = :generation AND userId = :owner AND attribute_not_exists(deletedAt) AND #status IN (:queued,:processing,:classifying,:extracting)',
        ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues: { ':generation': job.generation, ':owner': job.userId, ':sent':'SENT',':id':job.id,':now':Date.now(),
          ':queued':'Queued',':processing':'Processing',':classifying':'Classifying',':extracting':'Extracting information' } }));
    } catch (error) { if (!isConditional(error)) throw error; }
  }
  async claim(job: ProcessingJob, token: string): Promise<CloudDocument | null> {
    try {
      const result = await dynamo.send(new UpdateCommand({ TableName: table(), Key: key(job.id),
        UpdateExpression: 'SET leaseToken = :token, leaseUntil = :until, attempts = attempts + :one, #status = :processing',
        ConditionExpression: 'attribute_exists(PK) AND generation = :generation AND userId = :owner AND attribute_not_exists(deletedAt) AND #status IN (:queued, :processing, :classifying, :extracting) AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now)',
        ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':generation': job.generation, ':owner': job.userId,
          ':token': token, ':until': Date.now() + config.jobLeaseSeconds * 1000, ':now': Date.now(), ':one': 1,
          ':queued': 'Queued', ':processing': 'Processing', ':classifying': 'Classifying', ':extracting': 'Extracting information' }, ReturnValues: 'ALL_NEW' }));
      return result.Attributes as CloudDocument;
    } catch (error) { if (isConditional(error)) return null; throw error; }
  }
  async change(job: ProcessingJob, token: string, values: Record<string, any>, release = false): Promise<boolean> {
    const fields = Object.keys(values);
    try {
      const update = { TableName: table(), Key: key(job.id),
        UpdateExpression: `SET ${fields.map((_, i) => `#f${i} = :v${i}`).join(', ')}, updatedAt = :stamp${release ? ' REMOVE leaseToken, leaseUntil' + (['Completed','Failed'].includes(values.status) ? ', dispatchPK, dispatchSK, dispatchSentAt' : '') : ''}`,
        ConditionExpression: 'attribute_exists(PK) AND generation = :generation AND userId = :owner AND leaseToken = :token AND leaseUntil >= :now AND attribute_not_exists(deletedAt)',
        ExpressionAttributeNames: Object.fromEntries(fields.map((field, i) => [`#f${i}`, field])),
        ExpressionAttributeValues: { ...Object.fromEntries(fields.map((field, i) => [`:v${i}`, values[field]])),
          ':generation': job.generation, ':owner': job.userId, ':token': token, ':now': Date.now(), ':stamp': new Date().toISOString() } };
      if (values.status && values.status !== 'Queued') {
        const doc = await getCloudDocument(job.id);
        const timestamp = new Date().toISOString();
        await transaction(new TransactWriteCommand({ TransactItems: [ { Update: update }, { Put: {
          TableName: table(), Item: { PK: `USER#${job.userId}`, SK: `ACT#JOB#${job.id}#${job.generation}#${values.status}`,
            id: `JOB-${job.id}-${job.generation}-${values.status}`, userId: job.userId, documentId: job.id,
            documentName: doc?.originalFileName || 'Document', timestamp, createdAt: timestamp,
            event: `Document ${values.status}`, actor: 'System',
            status: values.status === 'Failed' ? 'Failed' : values.status === 'Completed' ? 'Success' : 'Processing',
            details: values.failureReason || `Document status changed to ${values.status}` } } } ] }));
      } else await dynamo.send(new UpdateCommand(update));
      return true;
    } catch (error) { if (isConditional(error)) return false; throw error; }
  }
  async stage(job: ProcessingJob, token: string, status: DocumentStatus): Promise<boolean> {
    return this.change(job, token, { status });
  }
}
