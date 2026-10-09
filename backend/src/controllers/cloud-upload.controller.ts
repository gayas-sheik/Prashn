import { Request, Response } from 'express';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { HeadObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { config } from '../config/env';
import { s3 } from '../aws/clients';
import { DynamoDocumentRepository, getCloudDocument, isConditional } from '../repositories/dynamodb.repositories';
import { CloudDocumentDispatcher } from '../processing/sqs.processor';
import { removeOutput } from '../storage/s3.storage';
import { Document } from '../types';
import { logError } from '../observability/log';

const documents = new DynamoDocumentRepository();
export const createUploadIntent = async (req: Request, res: Response) => {
  if (config.storageMode !== 's3') return res.status(404).json({ error: 'Direct upload is available only in AWS mode' });
  const { fileName, mimeType, fileSize } = req.body || {};
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255 || [...fileName].some(character=>character.charCodeAt(0)<32 || character==='/' || character==='\\') ||
    !['application/pdf','image/png','image/jpeg'].includes(mimeType) || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Upload a PDF, PNG or JPEG of up to 10 MiB with a valid filename' });
  }
  const timestamp = new Date().toISOString();
  const document: Document & { uploadExpiresAt: number } = { id: `DOC-${randomUUID()}`, userId: req.user!.userId,
    fileName, originalFileName: fileName, mimeType, fileSize, formattedSize: `${(fileSize / 1024).toFixed(1)} KB`,
    storageKey: `staging/${randomUUID()}`, status: 'Uploading', documentType: 'Unknown', pagesCount: 1,
    uploadDate: timestamp, createdAt: timestamp, updatedAt: timestamp, uploaderName: req.user!.email, uploadExpiresAt: Date.now() + 600000 };
  const upload = await createPresignedPost(s3, { Bucket: config.documentBucket, Key: document.storageKey,
    Fields: { 'Content-Type': mimeType }, Conditions: [['content-length-range', fileSize, fileSize], ['eq', '$Content-Type', mimeType]], Expires: 600 });
  await documents.createDocument(document);
  res.status(201).json({ documentId: document.id, upload });
};

export const finalizeUpload = async (req: Request, res: Response) => {
  if (config.storageMode !== 's3') return res.status(404).json({ error: 'Direct upload is available only in AWS mode' });
  const id = req.params.id as string;
  const userId = req.user!.userId;
  const doc = await getCloudDocument(id);
  if (!doc || doc.userId !== userId || doc.deletedAt) return res.status(404).json({ error: 'Document not found' });
  if (doc.status !== 'Uploading') return res.json({ document: await documents.findByIdAndUserId(id,userId) });
  if ((doc as any).uploadExpiresAt < Date.now()) return res.status(409).json({ error: 'Upload intent expired. Select the file again.' });
  let object;
  try { object=await s3.send(new HeadObjectCommand({ Bucket: config.documentBucket, Key: doc.storageKey })); }
  catch (error:any) { if(error.$metadata?.httpStatusCode===404) return res.status(409).json({error:'Upload has not reached document storage. Please retry.'}); throw error; }
  if (object.ContentLength !== doc.fileSize || object.ContentType !== doc.mimeType) return res.status(400).json({ error: 'Uploaded size or type does not match the accepted file' });
  const header = await s3.send(new GetObjectCommand({ Bucket: config.documentBucket, Key: doc.storageKey, Range: 'bytes=0-15' }));
  const bytes = Buffer.from(await header.Body!.transformToByteArray());
  const valid = doc.mimeType === 'application/pdf' ? bytes.subarray(0,5).toString() === '%PDF-' :
    doc.mimeType === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) return res.status(400).json({ error: 'File contents do not match the supported type' });
  const permanentKey = `originals/${randomUUID()}`;
  let committed = false;
  try {
    // Copy to an immutable key before acceptance. Reusing the signed staging POST
    // cannot overwrite the accepted original while a worker is processing it.
    await s3.send(new CopyObjectCommand({ Bucket: config.documentBucket, Key: permanentKey,
      CopySource: `${config.documentBucket}/${doc.storageKey}`, CopySourceIfMatch: object.ETag, ServerSideEncryption: 'AES256' }));
    await documents.finalizeUpload(id, userId, permanentKey); committed = true;
    await removeOutput(doc.storageKey).catch(error => logError('staging_cleanup_failed',error,{ documentId:id }));
    await new CloudDocumentDispatcher().triggerPipeline(id,userId);
    res.status(201).json({ document: await documents.findByIdAndUserId(id,userId) });
  } catch (error) {
    if (!committed) await removeOutput(permanentKey).catch(cleanup => logError('upload_rollback_failed',cleanup,{documentId:id}));
    if (isConditional(error)) {
      const current = await documents.findByIdAndUserId(id,userId);
      if (current && current.status !== 'Uploading') return res.json({ document: current });
      return res.status(409).json({ error: 'Upload was deleted, expired or already accepted' });
    }
    throw error;
  }
};
