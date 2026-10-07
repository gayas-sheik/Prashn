import { Router } from 'express';
import { 
  getDocuments, 
  getDocumentById, 
  deleteDocument, 
  uploadSingleDocument, 
  uploadMultipleDocuments,
  retryDocument
} from '../controllers/document.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getDocuments);
router.get('/:id', getDocumentById);
router.delete('/:id', deleteDocument);
router.post('/:id/retry', retryDocument);

router.post('/upload', upload.single('file'), uploadSingleDocument);
router.post('/upload-multiple', upload.array('files'), uploadMultipleDocuments);

// Routes for Q&A will go here or in a separate file (e.g., question.routes.ts)

export default router;
