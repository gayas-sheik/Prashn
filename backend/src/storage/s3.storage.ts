import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Response } from 'express';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from '../aws/clients';
import { config } from '../config/env';
import { StorageProvider } from './storage.interface';

export async function putOutput(key: string, value: unknown): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: config.documentBucket, Key: key,
    Body: JSON.stringify(value), ContentType: 'application/json', ServerSideEncryption: 'AES256' }));
}
export async function readOutput<T>(key: string): Promise<T> {
  const result = await s3.send(new GetObjectCommand({ Bucket: config.documentBucket, Key: key }));
  if (!result.Body) throw new Error('Missing processing result');
  return JSON.parse(await result.Body.transformToString()) as T;
}
export async function removeOutput(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.documentBucket, Key: key }));
}

export class S3StorageProvider implements StorageProvider {
  async saveFile(tempFilePath: string, _originalName: string, mimeType: string): Promise<string> {
    const key = `originals/${randomUUID()}`;
    try {
      await s3.send(new PutObjectCommand({ Bucket: config.documentBucket, Key: key,
        Body: fs.createReadStream(tempFilePath), ContentLength: (await fs.promises.stat(tempFilePath)).size,
        ContentType: mimeType, ServerSideEncryption: 'AES256' }));
    } catch (error) {
      // A failed request may have reached S3. This unique key belongs only to this upload.
      await this.deleteFile(key).catch(() => {});
      throw error;
    } finally { await fs.promises.rm(tempFilePath, { force: true }); }
    return key;
  }
  async getFileUrl(_key: string): Promise<string> {
    throw new Error('S3 objects are private; use withLocalFile or sendFile');
  }
  async deleteFile(key: string): Promise<void> { await removeOutput(key); }
  async withLocalFile<T>(key: string, consume: (filePath: string) => Promise<T>): Promise<T> {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prashn-'));
    const localPath = path.join(directory, 'document');
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: config.documentBucket, Key: key }));
      if (!object.Body) throw new Error('Missing original');
      await pipeline(object.Body as Readable, fs.createWriteStream(localPath, { mode: 0o600 }));
      return await consume(localPath);
    } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
  }
  async sendFile(key: string, response: Response): Promise<void> {
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.documentBucket, Key: key,
      ResponseCacheControl: 'private, no-store' }), { expiresIn: 120 });
    response.redirect(307, url);
  }
  async saveProcessedText(documentId: string, text: string): Promise<void> {
    await putOutput(`results/${documentId}/text.json`, { text });
  }
  async deleteProcessed(documentId: string): Promise<void> {
    // List before deleting to avoid skipping keys when the continuation token changes.
    let token: string | undefined;
    const keys: string[] = [];
    do {
      const result = await s3.send(new ListObjectsV2Command({ Bucket: config.documentBucket,
        Prefix: `results/${documentId}/`, ContinuationToken: token }));
      keys.push(...(result.Contents || []).flatMap(object => object.Key ? [object.Key] : []));
      token = result.NextContinuationToken;
    } while (token);
    for (let offset = 0; offset < keys.length; offset += 1000) {
      const result = await s3.send(new DeleteObjectsCommand({ Bucket: config.documentBucket,
        Delete: { Objects: keys.slice(offset, offset + 1000).map(Key => ({ Key })) } }));
      if (result.Errors?.length) throw new Error('Processing-result deletion incomplete; retry deletion');
    }
  }
}
