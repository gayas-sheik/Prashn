import { getDb } from '../../database/db';
import { ActivityEvent } from '../../types';

export class ActivityRepository {
  async createEvent(event: ActivityEvent): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO activity_events (
        id, userId, timestamp, event, documentName, documentId, actor, status, details, logJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id, event.userId, event.timestamp, event.event, event.documentName,
        event.documentId, event.actor, event.status, event.details,
        event.logJson ? JSON.stringify(event.logJson) : null
      ]
    );
  }

  async findAllByUserId(userId: string): Promise<ActivityEvent[]> {
    const db = await getDb();
    const rows = await db.all(`SELECT * FROM activity_events WHERE userId = ? ORDER BY createdAt DESC`, [userId]);
    return rows.map(row => ({
      ...row,
      logJson: row.logJson ? JSON.parse(row.logJson) : undefined
    } as ActivityEvent));
  }
}
