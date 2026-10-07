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
    // In future, implement S3StorageProvider
    console.warn('Non-local storage requested but not implemented. Falling back to LocalStorage.');
    storageInstance = new LocalStorageProvider();
  }

  return storageInstance;
}
