import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, getMe);
router.post('/logout', (req, res) => {
  // Since we use stateless JWT, logout is handled client-side by dropping the token.
  res.json({ message: 'Logged out successfully' });
});

export default router;
