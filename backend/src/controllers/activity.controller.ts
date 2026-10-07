import { Request, Response } from 'express';
import { ActivityRepository } from '../repositories/activity.repository';

const activityRepo = new ActivityRepository();

export const getActivityEvents = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const events = await activityRepo.findAllByUserId(userId);
    res.json({ events });
  } catch (error) {
    console.error('Error fetching activity events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
