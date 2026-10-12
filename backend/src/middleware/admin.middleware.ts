import { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../repositories/user.repository';

const users = new UserRepository();
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Re-read the current profile: a stale administrator JWT must not retain access.
  const user = req.user?.userId ? await users.findById(req.user.userId) : null;
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
  next();
}
