import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { createDocumentSchema, updateDocumentSchema } from './schemas.js';

const router = Router();

// Tüm route'lar auth gerektiriyor
router.use(requireAuth);

const DOC_SELECT = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

// Kullanıcının dokümanları (silinmemişler)
router.get('/', async (req: Request, res: Response) => {
  const documents = await db.document.findMany({
    where: { userId: req.user!.id, deletedAt: null },
    select: DOC_SELECT,
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ documents });
});

// Silinmiş dokümanlar (çöp kutusu)
router.get('/trash', async (req: Request, res: Response) => {
  const documents = await db.document.findMany({
    where: { userId: req.user!.id, deletedAt: { not: null } },
    select: DOC_SELECT,
    orderBy: { deletedAt: 'desc' },
  });
  res.json({ documents });
});

// Yeni doküman oluştur
router.post('/', async (req: Request, res: Response) => {
  const parsed = createDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const document = await db.document.create({
    data: {
      title: parsed.data.title ?? 'Untitled',
      userId: req.user!.id,
    },
    select: DOC_SELECT,
  });
  res.status(201).json({ document });
});

// Tek doküman — kullanıcıya ait olmayan 404 döner
router.get('/:id', async (req: Request, res: Response) => {
  const document = await db.document.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    select: DOC_SELECT,
  });
  if (!document) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({ document });
});

// Başlık veya içerik güncelle
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const existing = await db.document.findFirst({
    where: { id: req.params.id, userId: req.user!.id, deletedAt: null },
  });
  if (!existing) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const document = await db.document.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.content !== undefined && { content: parsed.data.content }),
    },
    select: DOC_SELECT,
  });
  res.json({ document });
});

// Soft delete
router.delete('/:id', async (req: Request, res: Response) => {
  const existing = await db.document.findFirst({
    where: { id: req.params.id, userId: req.user!.id, deletedAt: null },
  });
  if (!existing) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  await db.document.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
});

// Geri al (restore)
router.patch('/:id/restore', async (req: Request, res: Response) => {
  const existing = await db.document.findFirst({
    where: { id: req.params.id, userId: req.user!.id, deletedAt: { not: null } },
  });
  if (!existing) {
    res.status(404).json({ error: 'Document not found or not deleted' });
    return;
  }

  const document = await db.document.update({
    where: { id: req.params.id },
    data: { deletedAt: null },
    select: DOC_SELECT,
  });
  res.json({ document });
});

export default router;
