import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { getMonitoringSnapshot } from '../services/monitoring.service';
const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/', async (_req, res) => {
  try { res.json(await getMonitoringSnapshot()); }
  catch { res.status(503).json({ error: 'Monitoring data is unavailable. Check the API monitoring read permissions and stack configuration.' }); }
});
export default router;
