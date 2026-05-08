// Express middleware: verifies the JWT in the Authorization header,
// loads the matching user from the DB, and attaches it to req.user
// (typed via server/src/types/express.d.ts).
//
// Loading the user every request — instead of trusting the JWT body —
// means deletions, plan upgrades, etc. take effect on the next call
// without waiting for the token to expire. Keeps the cost cheap by
// projecting only id/email/name/plan via Prisma `select`.

import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt.js';
import { db } from '../db.js';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const { sub } = verifyToken(token);
    const user = await db.user.findUnique({
      where: { id: sub },
      select: { id: true, email: true, name: true, plan: true },
    });
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
