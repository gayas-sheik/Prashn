import { getDb } from '../database/db';
import { QAMessage } from '../types';

export class QuestionRepository {
  async createMessage(msg: QAMessage): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO qa_messages (
        id, documentId, userId, sender, text, timestamp, citations
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id, msg.documentId, msg.userId, msg.sender, msg.text, msg.timestamp,
        msg.citations ? JSON.stringify(msg.citations) : null
      ]
    );
  }

  async findByDocumentIdAndUserId(documentId: string, userId: string): Promise<QAMessage[]> {
    const db = await getDb();
    const rows = await db.all(`SELECT * FROM qa_messages WHERE documentId = ? AND userId = ? ORDER BY createdAt ASC`, [documentId, userId]);
    return rows.map(row => ({
      ...row,
      citations: row.citations ? JSON.parse(row.citations) : undefined
    } as QAMessage));
  }
}
