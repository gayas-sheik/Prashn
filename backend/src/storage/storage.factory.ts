import { StorageProvider } from './storage.interface';
import { LocalStorageProvider } from './local.storage';
import { config } from '../config/env';
import { S3StorageProvider } from './s3.storage';

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageInstance) {
    return storageInstance;
  }

  if (config.storageMode === 'local') {
    storageInstance = new LocalStorageProvider();
  } else if (config.storageMode === 's3') {
    storageInstance = new S3StorageProvider();
  } else {
    throw new Error(`Storage mode ${config.storageMode} is not implemented. Use STORAGE_MODE=local until the AWS adapter is added.`);
  }

  return storageInstance;
}
