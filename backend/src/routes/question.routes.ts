import { Router } from 'express';
import { getConversation, askQuestion, clearConversation } from '../controllers/question.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/:id/questions', getConversation);
router.post('/:id/questions', askQuestion);
router.delete('/:id/questions', clearConversation);

export default router;
