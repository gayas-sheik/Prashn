import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const root = path.resolve(__dirname, '../..');
const resolvePath = (value: string | undefined, fallback: string) => path.resolve(root, value || fallback);
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('Set JWT_SECRET before running in production');

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  storageMode: process.env.STORAGE_MODE || 'local',
  databaseMode: process.env.DATABASE_MODE || 'local',
  processingMode: process.env.PROCESSING_MODE || 'local',
  classificationMode: process.env.CLASSIFICATION_MODE || 'local',
  uploadDir: resolvePath(process.env.UPLOAD_DIR, 'storage/uploads'),
  processedDir: resolvePath(process.env.PROCESSED_DIR, 'storage/processed'),
  dbFile: resolvePath(process.env.DB_FILE || process.env.DATABASE_URL, 'data/development/prashn.db'),
  maxPages: Math.max(1, Number(process.env.MAX_DOCUMENT_PAGES) || 100),
  processingConcurrency: Math.max(1, Number(process.env.PROCESSING_CONCURRENCY) || 2),
  ocrLanguage: process.env.OCR_LANGUAGE || 'eng',
  ocrLangPath: process.env.OCR_LANG_PATH,
  forceOcr: process.env.OCR_MODE === 'always',
  qaModel: process.env.OLLAMA_MODEL || '',
  qaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
};
