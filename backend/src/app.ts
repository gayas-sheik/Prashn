import express from 'express';
import cors from 'cors';
import { config } from './config/env';

import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import activityRoutes from './routes/activity.routes';
import questionRoutes from './routes/question.routes';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: config.nodeEnv });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', questionRoutes); // For /api/documents/:id/questions
app.use('/api/activity', activityRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: config.nodeEnv === 'development' ? err.message : undefined });
});

export default app;
