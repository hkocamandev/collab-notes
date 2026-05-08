import express from 'express';
import cors from 'cors';
import authRoutes from './auth/routes.js';
import documentRoutes from './documents/routes.js';
import aiRoutes from './ai/router.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/ping', (_req, res) => {
    res.json({ message: 'pong', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/ai', aiRoutes);

  return app;
}
