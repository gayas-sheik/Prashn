import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from '../config/env';
import fs from 'fs';
import path from 'path';

let dbInstance: Database | null = null;
let opening: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (opening) return opening;
  opening = (async () => {
  await fs.promises.mkdir(path.dirname(config.dbFile), { recursive: true });
  const database = await open({
    filename: config.dbFile,
    driver: sqlite3.Database,
  });

  await database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  await initializeSchema(database);
  dbInstance = database;
  return database;
  })().catch(error => { opening = null; throw error; });
  return opening;
}

async function initializeSchema(db: Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      fullName TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      originalFileName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      formattedSize TEXT NOT NULL,
      storageKey TEXT NOT NULL,
      documentType TEXT NOT NULL,
      status TEXT NOT NULL,
      uploadDate TEXT NOT NULL,
      uploaderName TEXT,
      processingDuration TEXT,
      confidence REAL,
      extractedSummary TEXT,
      s3Uri TEXT,
      sha256 TEXT,
      pagesCount INTEGER NOT NULL,
      failureReason TEXT,
      extractedFields TEXT, -- JSON
      lineItems TEXT, -- JSON
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS qa_messages (
      id TEXT PRIMARY KEY,
      documentId TEXT NOT NULL,
      userId TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      citations TEXT, -- JSON
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(documentId) REFERENCES documents(id)
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event TEXT NOT NULL,
      documentName TEXT NOT NULL,
      documentId TEXT,
      actor TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT NOT NULL,
      logJson TEXT, -- JSON
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);
  const columns = await db.all('PRAGMA table_info(documents)');
  if (!columns.some(column => column.name === 'pages')) await db.exec('ALTER TABLE documents ADD COLUMN pages TEXT');
  await db.exec(`CREATE TRIGGER IF NOT EXISTS delete_document_questions BEFORE DELETE ON documents
    BEGIN DELETE FROM qa_messages WHERE documentId = OLD.id; END;`);
}

export async function closeDb(): Promise<void> {
  await dbInstance?.close();
  dbInstance = null;
  opening = null;
}
