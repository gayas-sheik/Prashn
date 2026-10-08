import express from 'express';
import cors from 'cors';
import { config } from './config/env';

import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import activityRoutes from './routes/activity.routes';
import questionRoutes from './routes/question.routes';
import multer from 'multer';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: config.nodeEnv, processingMode: 'local', qaMode: config.qaModel ? 'ollama' : 'extractive' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', questionRoutes); // For /api/documents/:id/questions
app.use('/api/activity', activityRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (!err.status || err.status >= 500) console.error('Unhandled error:', err);
  if (res.headersSent) return _next(err);
  res.removeHeader('Content-Type');
  if (err instanceof multer.MulterError) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 10 MB upload limit' : err.message });
  const status = Number(err.status) || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

export default app;
