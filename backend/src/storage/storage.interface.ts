import { Response } from 'express';

export interface StorageProvider {
  /**
   * Save a file to storage
   * @param tempFilePath Path to the temporary file uploaded
   * @param originalName Original file name
   * @param mimeType File MIME type
   * @returns storageKey that can be used to retrieve the file
   */
  saveFile(tempFilePath: string, originalName: string, mimeType: string): Promise<string>;
  
  /**
   * Get a readable stream or absolute path for a stored file
   * @param storageKey The key returned by saveFile
   * @returns Local path or URL
   */
  getFileUrl(storageKey: string): Promise<string>;

  /**
   * Delete a file from storage
   * @param storageKey The key returned by saveFile
   */
  deleteFile(storageKey: string): Promise<void>;
  withLocalFile<T>(storageKey: string, consume: (filePath: string) => Promise<T>): Promise<T>;
  sendFile(storageKey: string, response: Response): Promise<void>;
  saveProcessedText(documentId: string, text: string): Promise<void>;
  deleteProcessed(documentId: string): Promise<void>;
}
