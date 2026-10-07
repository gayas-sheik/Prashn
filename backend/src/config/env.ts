import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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
  uploadDir: process.env.UPLOAD_DIR || './storage/uploads',
  processedDir: process.env.PROCESSED_DIR || './storage/processed',
  dbFile: process.env.DB_FILE || './data/development/prashn.db',
};
