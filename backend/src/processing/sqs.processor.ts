import { SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand, Message } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import { CloudJobs, DynamoDocumentRepository, DynamoActivityRepository, getCloudDocument, ProcessingJob } from '../repositories/dynamodb.repositories';
import { sqs } from '../aws/clients';
import { config } from '../config/env';
import { getStorageProvider } from '../storage/storage.factory';
import { putOutput, removeOutput } from '../storage/s3.storage';
import { analyzeDocument, DocumentInputError } from './pipeline';
import { log, logError } from '../observability/log';
import { DocumentStatus } from '../types';
import { reconcileResults } from '../reconcile';

const jobs = new CloudJobs();
export class CloudDocumentDispatcher {
  private async send(job: ProcessingJob): Promise<void> {
    await sqs.send(new SendMessageCommand({ QueueUrl: config.queueUrl, MessageBody: JSON.stringify(job) }));
    await jobs.dispatched(job);
  }
  async triggerPipeline(id: string, userId: string): Promise<boolean> {
    const job = await jobs.schedule(id, userId);
    if (!job) return false;
    // The pending outbox survives a send failure or process termination.
    try { await this.send(job); }
    catch (error) { logError('dispatch_pending', error, { documentId: id, generation: job.generation }); }
    return true;
  }
  async recover(): Promise<void> {
    const repository = new DynamoDocumentRepository();
    for (const candidate of await jobs.cleanupCandidates()) {
      try {
        const doc = await repository.findForDeletion(candidate.id, candidate.userId);
        if (!doc) continue;
        await repository.beginDelete(doc.id,doc.userId);
        await getStorageProvider().deleteProcessed(doc.id);
        await getStorageProvider().deleteFile(doc.storageKey);
        await repository.deleteByIdAndUserId(doc.id,doc.userId);
        const timestamp = new Date().toISOString();
        await new DynamoActivityRepository().createEvent({ id:`DELETE-${doc.id}`,userId:doc.userId,documentId:doc.id,
          documentName:doc.originalFileName,timestamp,createdAt:timestamp,actor:'System',status:'Success',event:'Document Deleted',details:'Document deletion cleanup completed.' });
      } catch (error) { logError('deletion_cleanup_pending',error,{ documentId:candidate.id }); }
    }
    for (const job of await jobs.pending()) {
      try {
        if (!job.generation) await this.triggerPipeline(job.id, job.userId);
        else await this.send(job);
      } catch (error) { logError('dispatch_recovery_failed', error, { documentId: job.id }); }
    }
  }
  async cancel(id: string): Promise<void> {
    const doc = await getCloudDocument(id);
    if (doc?.storageKey) await new DynamoDocumentRepository().beginDelete(id, doc.userId);
  }
}

export function parseJob(body?: string): ProcessingJob {
  const value = JSON.parse(body || '');
  if (!/^DOC-[A-Za-z0-9-]{1,80}$/.test(value?.id) || typeof value.userId !== 'string' || !value.userId ||
    !Number.isSafeInteger(value.generation) || value.generation < 1) throw new Error('Invalid processing job');
  return { id: value.id, userId: value.userId, generation: value.generation };
}

export class CloudDocumentWorker {
  private dispatcher = new CloudDocumentDispatcher();
  private stopping = false;
  stop(): void { this.stopping = true; }
  async run(): Promise<void> {
    log('worker_started');
    let nextReconciliation=0;
    while (!this.stopping) {
      if (Date.now()>=nextReconciliation) {
        nextReconciliation=Date.now()+24*60*60*1000;
        try { await reconcileResults(true); } catch (error) { logError('reconciliation_failed',error); }
      }
      try { await this.dispatcher.recover(); await this.runOnce(20); }
      catch (error) {
        logError('worker_poll_failed', error);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    log('worker_stopped');
  }
  async runOnce(waitSeconds = 0): Promise<void> {
    const response = await sqs.send(new ReceiveMessageCommand({ QueueUrl: config.queueUrl,
      WaitTimeSeconds: waitSeconds, MaxNumberOfMessages: 1, VisibilityTimeout: config.jobLeaseSeconds }));
    for (const message of response.Messages || []) await this.handle(message);
  }
  async handle(message: Message): Promise<void> {
    if (!message.ReceiptHandle) return;
    const receipt = message.ReceiptHandle;
    const ack = () => sqs.send(new DeleteMessageCommand({ QueueUrl: config.queueUrl, ReceiptHandle: receipt }));
    let job: ProcessingJob;
    try { job = parseJob(message.Body); }
    catch (error) { logError('invalid_job', error); return; } // Redrive poison messages to the DLQ.
    const current = await getCloudDocument(job.id);
    if (current?.status === 'Failed' && current.transientFailed && current.generation === job.generation && !current.deletedAt) return;
    if (!current || current.deletedAt || current.userId !== job.userId || current.generation !== job.generation || ['Completed', 'Failed'].includes(current.status)) {
      await ack(); return;
    }
    const token = randomUUID();
    const document = await jobs.claim(job, token);
    if (!document) return; // Another worker owns the lease; never acknowledge its work.
    if ((document.attempts || 0)>config.workerMaxAttempts) {
      await jobs.change(job,token,{status:'Failed',transientFailed:true,
        failureReason:'Processing failed after repeated worker interruptions. Retry the document.'},true);
      return; // Keep the message for dead-letter redrive and diagnosis.
    }
    let lostLease = false;
    let heartbeatBusy = false;
    const heartbeat = setInterval(async () => {
      if (heartbeatBusy || lostLease) return;
      heartbeatBusy = true;
      try {
        if (!await jobs.change(job, token, { leaseUntil: Date.now() + config.jobLeaseSeconds * 1000 })) { lostLease = true; return; }
        await sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: config.queueUrl, ReceiptHandle: receipt, VisibilityTimeout: config.jobLeaseSeconds }));
      } catch (error) { lostLease = true; logError('worker_heartbeat_failed', error, { documentId: job.id }); }
      finally { heartbeatBusy = false; }
    }, 30000);
    let outputKey: string | undefined;
    let published = false;
    const stage = async (status: DocumentStatus) => {
      if (lostLease || !await jobs.stage(job, token, status)) throw new Error('Job lease lost');
    };
    try {
      await stage('Processing');
      const result = await getStorageProvider().withLocalFile(document.storageKey, file => analyzeDocument(file, document, stage));
      if (lostLease) throw new Error('Job lease lost');
      outputKey = `results/${job.id}/${job.generation}-${token}.json`;
      await putOutput(outputKey, result.content);
      published = await jobs.change(job, token, { ...result.metadata, resultKey: outputKey, status: 'Completed', failureReason: null }, true);
      if (!published) throw new Error('Job lease lost');
      // Keep the previous immutable result briefly so an in-flight reader can
      // finish. Daily reconciliation removes unreferenced results after 24 hours.
      await ack();
      log('job_completed', { documentId: job.id, generation: job.generation });
    } catch (error) {
      logError('job_attempt_failed', error, { documentId: job.id, generation: job.generation });
      if (error instanceof DocumentInputError || (document.attempts || 0) >= config.workerMaxAttempts) {
        const reason = error instanceof DocumentInputError ? error.message : 'Processing failed after repeated attempts. Retry the document.';
        if (await jobs.change(job, token, { status: 'Failed', failureReason: reason, transientFailed: !(error instanceof DocumentInputError) }, true)) {
          // Permanent input errors are recorded and acknowledged. Exhausted transient
          // errors remain available for the queue redrive policy and diagnosis.
          if (error instanceof DocumentInputError) await ack();
        }
      } else await jobs.change(job, token, { status: 'Queued', failureReason: 'Temporary processing failure; retrying automatically.' }, true);
    } finally {
      clearInterval(heartbeat);
      if (outputKey && !published) await removeOutput(outputKey).catch(error => logError('unpublished_result_cleanup_failed', error, { documentId: job.id }));
    }
  }
}
