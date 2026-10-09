import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StorageProvider } from './storage.interface';
import { config } from '../config/env';
import { Response } from 'express';

export class LocalStorageProvider implements StorageProvider {
  constructor() {
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
  }

  async saveFile(tempFilePath: string, originalName: string, _mimeType: string): Promise<string> {
    const ext = path.extname(originalName);
    const storageKey = `${uuidv4()}${ext}`;
    const destinationPath = path.join(config.uploadDir, storageKey);
    
    // Move the file from temp location to permanent storage
    await fs.promises.copyFile(tempFilePath, destinationPath);
    await fs.promises.unlink(tempFilePath);
    
    return storageKey;
  }

  async getFileUrl(storageKey: string): Promise<string> {
    return path.join(config.uploadDir, storageKey);
  }

  async deleteFile(storageKey: string): Promise<void> {
    const filePath = path.join(config.uploadDir, storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  async withLocalFile<T>(storageKey: string, consume: (filePath: string) => Promise<T>): Promise<T> {
    return consume(await this.getFileUrl(storageKey));
  }

  async sendFile(storageKey: string, response: Response): Promise<void> {
    const filePath = await this.getFileUrl(storageKey);
    await new Promise<void>((resolve, reject) => response.sendFile(path.resolve(filePath), { dotfiles: 'allow' }, error => error ? reject(error) : resolve()));
  }

  async saveProcessedText(documentId: string, text: string): Promise<void> {
    await fs.promises.mkdir(config.processedDir, { recursive: true });
    await fs.promises.writeFile(path.join(config.processedDir, `${documentId}.txt`), text, 'utf8');
  }

  async deleteProcessed(documentId: string): Promise<void> {
    await fs.promises.rm(path.join(config.processedDir, `${documentId}.txt`), { force: true });
  }
}
