import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './auth/routes.js';
import documentRoutes from './documents/routes.js';
import aiRoutes from './ai/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  if (process.env.NODE_ENV === 'production') {
    // Compiled file lives at server/dist/app.js, so the SPA build is two
    // levels up: ../../client/dist relative to this file.
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/|yws\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
