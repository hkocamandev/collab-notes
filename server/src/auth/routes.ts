import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './jwt.js';
import { requireAuth } from './middleware.js';
import { registerSchema, loginSchema } from './schemas.js';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { email, password, name } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: { email, passwordHash, name: name ?? null },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });

  const token = signToken(user.id);
  res.status(201).json({ token, user });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      createdAt: user.createdAt,
    },
  });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// Self-serve upgrade to premium. No payment integration in this scope —
// the assignment treats the toggle as instantaneous. Premium removes the
// 5-document and 1-share-per-doc caps that basic users have.
router.post('/upgrade', requireAuth, async (req: Request, res: Response) => {
  const updated = await db.user.update({
    where: { id: req.user!.id },
    data: { plan: 'premium' },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });
  res.json({ user: updated });
});

export default router;
