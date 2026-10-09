import { getDb } from '../../database/db';
import { Document } from '../../types';

export class DocumentRepository {
  async createDocument(doc: Document): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO documents (
        id, userId, fileName, originalFileName, mimeType, fileSize, formattedSize, storageKey,
        documentType, status, uploadDate, uploaderName, processingDuration, confidence,
        extractedSummary, s3Uri, sha256, pagesCount, failureReason, extractedFields, lineItems
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id, doc.userId, doc.fileName, doc.originalFileName, doc.mimeType, doc.fileSize,
        doc.formattedSize, doc.storageKey, doc.documentType, doc.status, doc.uploadDate,
        doc.uploaderName, doc.processingDuration, doc.confidence, doc.extractedSummary,
        doc.s3Uri, doc.sha256, doc.pagesCount, doc.failureReason,
        doc.extractedFields ? JSON.stringify(doc.extractedFields) : null,
        doc.lineItems ? JSON.stringify(doc.lineItems) : null
      ]
    );
  }

  async updateDocument(doc: Partial<Document> & { id: string }): Promise<void> {
    const db = await getDb();
    const fields = Object.keys(doc).filter(k => k !== 'id' && (doc as any)[k] !== undefined);
    if (!fields.length) return;
    const values = fields.map(k => {
      const val = (doc as any)[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });

    const setClause = fields.map(k => `${k} = ?`).join(', ');

    await db.run(
      `UPDATE documents SET ${setClause}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, doc.id]
    );
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Document | null> {
    const db = await getDb();
    const row = await db.get(`SELECT * FROM documents WHERE id = ? AND userId = ?`, [id, userId]);
    if (!row) return null;
    return this.mapRowToDocument(row);
  }

  async findAllByUserId(userId: string): Promise<Document[]> {
    const db = await getDb();
    const rows = await db.all(`SELECT * FROM documents WHERE userId = ? ORDER BY createdAt DESC`, [userId]);
    return rows.map(row => this.mapRowToDocument(row));
  }

  async deleteByIdAndUserId(id: string, userId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.run(`DELETE FROM documents WHERE id = ? AND userId = ?`, [id, userId]);
    return (result.changes ?? 0) > 0;
  }

  private mapRowToDocument(row: any): Document {
    return {
      ...row,
      extractedFields: row.extractedFields ? JSON.parse(row.extractedFields) : undefined,
      lineItems: row.lineItems ? JSON.parse(row.lineItems) : undefined,
      pages: row.pages ? JSON.parse(row.pages) : undefined,
    } as Document;
  }

  async findPending(): Promise<Document[]> {
    const db = await getDb();
    return (await db.all("SELECT * FROM documents WHERE status NOT IN ('Completed', 'Failed') ORDER BY createdAt")).map(row => this.mapRowToDocument(row));
  }
}
