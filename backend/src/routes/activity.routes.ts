import { Router } from 'express';
import { getActivityEvents } from '../controllers/activity.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);
router.get('/', getActivityEvents);

export default router;
