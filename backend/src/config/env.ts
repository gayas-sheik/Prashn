import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const root = path.resolve(__dirname, '../..');
const resolvePath = (value: string | undefined, fallback: string) => path.resolve(root, value || fallback);
if (!process.env.JWT_SECRET?.trim()) throw new Error('Set a private random JWT_SECRET before running the backend');
const modes = [process.env.STORAGE_MODE || 'local', process.env.DATABASE_MODE || 'local', process.env.PROCESSING_MODE || 'local'];
if (!(modes.every(mode => mode === 'local') || modes.join(',') === 's3,dynamodb,sqs')) {
  throw new Error('Use local/local/local or s3/dynamodb/sqs for storage/database/processing');
}
if (modes[0] === 's3') for (const name of ['AWS_REGION', 'DOCUMENT_BUCKET', 'DYNAMODB_TABLE', 'PROCESSING_QUEUE_URL']) {
  if (!process.env[name]?.trim()) throw new Error(`Set ${name} for AWS mode`);
}
const endpoint = process.env.AWS_ENDPOINT_URL;
if (endpoint && (process.env.AWS_ALLOW_LOCAL_ENDPOINT !== 'true' || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(endpoint).hostname))) {
  throw new Error('AWS endpoint overrides are allowed only for explicitly enabled loopback emulators');
}

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
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
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  awsEndpoint: endpoint,
  documentBucket: process.env.DOCUMENT_BUCKET || '',
  dynamodbTable: process.env.DYNAMODB_TABLE || '',
  queueUrl: process.env.PROCESSING_QUEUE_URL || '',
  jobLeaseSeconds: 120,
  workerMaxAttempts: 5,
  release: process.env.APP_RELEASE || 'development',
};
