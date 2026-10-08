import { StorageProvider } from './storage.interface';
import { LocalStorageProvider } from './local.storage';
import { config } from '../config/env';

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageInstance) {
    return storageInstance;
  }

  if (config.storageMode === 'local') {
    storageInstance = new LocalStorageProvider();
  } else {
    throw new Error(`Storage mode ${config.storageMode} is not implemented. Use STORAGE_MODE=local until the AWS adapter is added.`);
  }

  return storageInstance;
}
