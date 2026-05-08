import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import authRoutes from './auth/routes.js';

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

app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
});
