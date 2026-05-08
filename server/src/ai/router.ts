import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { searchDocuments } from './searchDocuments.js';

const router = Router();

router.use(requireAuth);

const askSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
});

// POST /api/ai/ask — semantic search over the current user's documents.
// Calls the same `searchDocuments` core that the MCP server exposes, so
// the REST and MCP code paths share their ranking logic.
router.post('/ask', async (req: Request, res: Response) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const results = await searchDocuments(req.user!.id, parsed.data.query, parsed.data.limit);
  res.json({ results });
});

export default router;
