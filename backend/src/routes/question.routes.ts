import { Router } from 'express';
import { getConversation, askQuestion } from '../controllers/question.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/:id/questions', getConversation);
router.post('/:id/questions', askQuestion);

export default router;
