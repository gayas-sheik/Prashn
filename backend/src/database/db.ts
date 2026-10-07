import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from '../config/env';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: config.dbFile,
    driver: sqlite3.Database,
  });

  await initializeSchema(dbInstance);

  return dbInstance;
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
}
