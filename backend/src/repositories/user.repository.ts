import { getDb } from '../database/db';
import { User } from '../types';

export class UserRepository {
  async createUser(user: User): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO users (id, email, passwordHash, fullName, role) VALUES (?, ?, ?, ?, ?)`,
      [user.id, user.email, user.passwordHash, user.fullName, user.role]
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const db = await getDb();
    const row = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!row) return null;
    return row as User;
  }

  async findById(id: string): Promise<User | null> {
    const db = await getDb();
    const row = await db.get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!row) return null;
    return row as User;
  }
}
