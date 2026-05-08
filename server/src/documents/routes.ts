import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { createDocumentSchema, updateDocumentSchema, shareDocumentSchema } from './schemas.js';
import { embed, docTextForEmbedding } from '../ai/embedding.js';

const router = Router();

router.use(requireAuth);

// Prisma include shape used everywhere we need to return a document with owner info.
// `_count.shares` lets us tell the owner how many people they've shared with
// without making a second query — used for the share-count badge on the Share button.
const DOC_INCLUDE = {
  user: { select: { id: true, email: true, name: true } },
  _count: { select: { shares: true } },
} as const;

type DocWithUser = {
  id: string;
  title: string;
  content: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user: { id: string; email: string; name: string | null };
  _count?: { shares: number };
};

// Shape a document for the client. Adds permission and (for shared docs) owner info.
function shapeDocument(doc: DocWithUser, currentUserId: string) {
  const isOwner = doc.userId === currentUserId;
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    permission: isOwner ? 'owner' : 'editor',
    ownerEmail: isOwner ? null : doc.user.email,
    ownerName: isOwner ? null : doc.user.name,
    shareCount: isOwner ? (doc._count?.shares ?? 0) : null,
  };
}

// Returns the doc + permission if the user can read it (owner OR has a share).
// Returns null permission if the doc doesn't exist or the user has no access.
async function findAccessibleDoc(
  docId: string,
  userId: string,
  opts: { allowDeleted?: boolean } = {},
): Promise<{ doc: DocWithUser | null; permission: 'owner' | 'editor' | null }> {
  const doc = await db.document.findFirst({
    where: {
      id: docId,
      ...(opts.allowDeleted ? {} : { deletedAt: null }),
    },
    include: DOC_INCLUDE,
  });
  if (!doc) return { doc: null, permission: null };

  if (doc.userId === userId) return { doc, permission: 'owner' };

  const share = await db.documentShare.findUnique({
    where: { documentId_userId: { documentId: docId, userId } },
  });
  if (share) return { doc, permission: 'editor' };

  return { doc: null, permission: null };
}

// ── List active documents (owner + shared) ──────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [owned, sharedRecords] = await Promise.all([
    db.document.findMany({
      where: { userId, deletedAt: null },
      include: DOC_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    }),
    db.documentShare.findMany({
      where: { userId, document: { deletedAt: null } },
      include: { document: { include: DOC_INCLUDE } },
      orderBy: { document: { updatedAt: 'desc' } },
    }),
  ]);

  const documents = [
    ...owned.map(d => shapeDocument(d, userId)),
    ...sharedRecords.map(s => shapeDocument(s.document, userId)),
  ];
  res.json({ documents });
});

// Trash is owner-only — shared editors don't see anyone else's trash.
router.get('/trash', async (req: Request, res: Response) => {
  const documents = await db.document.findMany({
    where: { userId: req.user!.id, deletedAt: { not: null } },
    include: DOC_INCLUDE,
    orderBy: { deletedAt: 'desc' },
  });
  res.json({ documents: documents.map(d => shapeDocument(d, req.user!.id)) });
});

// Snapshot every doc where the current user was the last editor. Called by the
// frontend just before logout so the user's session-end state is persisted as
// a version. Skips docs that already have a version with the same `editedAt`
// (no edits since the last snapshot) — keeps idle logouts from spamming
// version rows. NOTE: must be declared before /:id otherwise Express captures
// "snapshot-mine" as the document id.
router.post('/snapshot-mine', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const docs = await db.document.findMany({
    where: { lastEditedById: userId, deletedAt: null },
    select: { id: true, title: true, content: true, lastEditedAt: true },
  });

  let created = 0;
  for (const doc of docs) {
    if (!doc.lastEditedAt) continue;
    const existing = await db.documentVersion.findFirst({
      where: { documentId: doc.id, editedAt: doc.lastEditedAt },
      select: { id: true },
    });
    if (existing) continue;
    await db.documentVersion.create({
      data: {
        documentId: doc.id,
        title: doc.title,
        content: doc.content,
        editedById: userId,
        editedAt: doc.lastEditedAt,
      },
    });
    created++;
  }
  res.json({ snapshotsCreated: created });
});

// Plan limits (only basic; premium has no caps). Centralised so the API and
// future admin/billing code share the same numbers.
const BASIC_DOC_LIMIT = 5;
const BASIC_SHARES_PER_DOC = 1;

// Create — always becomes owner of the new doc. Basic users are capped at
// BASIC_DOC_LIMIT active (non-trash) owned documents.
router.post('/', async (req: Request, res: Response) => {
  const parsed = createDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  if (req.user!.plan === 'basic') {
    const activeOwned = await db.document.count({
      where: { userId: req.user!.id, deletedAt: null },
    });
    if (activeOwned >= BASIC_DOC_LIMIT) {
      res.status(403).json({
        error: `Basic plan is limited to ${BASIC_DOC_LIMIT} documents. Upgrade to Premium for unlimited.`,
        limit: BASIC_DOC_LIMIT,
        plan: 'basic',
        kind: 'document-limit',
      });
      return;
    }
  }

  const document = await db.document.create({
    data: { title: parsed.data.title ?? 'Untitled', userId: req.user!.id },
    include: DOC_INCLUDE,
  });
  res.status(201).json({ document: shapeDocument(document, req.user!.id) });
});

// Read — owner or shared editor.
router.get('/:id', async (req: Request, res: Response) => {
  const { doc } = await findAccessibleDoc(req.params.id!, req.user!.id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({ document: shapeDocument(doc, req.user!.id) });
});

// Update title/content — owner or shared editor.
// Tracks lastEditedBy / lastEditedAt so the logout-snapshot job knows whose
// edits to capture and when.
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { doc, permission } = await findAccessibleDoc(req.params.id!, req.user!.id);
  if (!doc || !permission) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const document = await db.document.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.content !== undefined && { content: parsed.data.content }),
      lastEditedById: req.user!.id,
      lastEditedAt: new Date(),
    },
    include: DOC_INCLUDE,
  });

  // Refresh the document embedding when title/content changes. Best-effort:
  // failures are logged but don't fail the PATCH (search would just fall back
  // to the previous embedding). Fire-and-forget so the API response isn't
  // gated on a ~50ms model call.
  if (parsed.data.title !== undefined || parsed.data.content !== undefined) {
    void refreshEmbedding(document.id, document.title, document.content).catch(err =>
      console.warn('[ai] embedding refresh failed:', err),
    );
  }

  res.json({ document: shapeDocument(document, req.user!.id) });
});

async function refreshEmbedding(docId: string, title: string, content: string) {
  const text = docTextForEmbedding(title, content);
  if (!text.trim()) return; // empty doc — skip
  const vector = await embed(text);
  await db.document.update({
    where: { id: docId },
    data: { embedding: JSON.stringify(vector), embeddingAt: new Date() },
  });
}

// List version history — owner OR shared editor.
router.get('/:id/versions', async (req: Request, res: Response) => {
  const { doc } = await findAccessibleDoc(req.params.id!, req.user!.id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const versions = await db.documentVersion.findMany({
    where: { documentId: req.params.id! },
    include: { editedBy: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    versions: versions.map(v => ({
      id: v.id,
      title: v.title,
      editedAt: v.editedAt,
      createdAt: v.createdAt,
      editedBy: {
        id: v.editedBy.id,
        email: v.editedBy.email,
        name: v.editedBy.name,
      },
    })),
  });
});

// Helper: collect userIds we shared with so the client can broadcast cross-tab
// notifications. Cheap query — runs before the destructive update.
async function shareRecipients(docId: string): Promise<string[]> {
  const shares = await db.documentShare.findMany({
    where: { documentId: docId },
    select: { userId: true },
  });
  return shares.map(s => s.userId);
}

// Soft delete — owner only. 403 if shared user attempts; 404 if no access at all.
// Returns affectedUserIds so the owner's frontend can notify shared editors
// (their sidebars need to drop the doc since it's now inaccessible).
router.delete('/:id', async (req: Request, res: Response) => {
  const existing = await db.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!existing) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  if (existing.userId !== req.user!.id) {
    res.status(403).json({ error: 'Only the owner can delete this document' });
    return;
  }

  const affectedUserIds = await shareRecipients(req.params.id!);
  await db.document.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.json({ affectedUserIds });
});

router.delete('/:id/permanent', async (req: Request, res: Response) => {
  const existing = await db.document.findFirst({
    where: { id: req.params.id, deletedAt: { not: null } },
  });
  if (!existing) {
    res.status(404).json({ error: 'Document not found in trash' });
    return;
  }
  if (existing.userId !== req.user!.id) {
    res.status(403).json({ error: 'Only the owner can permanently delete this document' });
    return;
  }

  // Read recipients BEFORE the delete — the cascade will wipe DocumentShare rows.
  const affectedUserIds = await shareRecipients(req.params.id!);
  await db.document.delete({ where: { id: req.params.id } });
  res.json({ affectedUserIds });
});

router.patch('/:id/restore', async (req: Request, res: Response) => {
  const existing = await db.document.findFirst({
    where: { id: req.params.id, deletedAt: { not: null } },
  });
  if (!existing) {
    res.status(404).json({ error: 'Document not found or not deleted' });
    return;
  }
  if (existing.userId !== req.user!.id) {
    res.status(403).json({ error: 'Only the owner can restore this document' });
    return;
  }

  const affectedUserIds = await shareRecipients(req.params.id!);
  const document = await db.document.update({
    where: { id: req.params.id },
    data: { deletedAt: null },
    include: DOC_INCLUDE,
  });
  res.json({ document: shapeDocument(document, req.user!.id), affectedUserIds });
});

// ── Sharing ────────────────────────────────────────────────────────────────
// Helper: owner-only check for share endpoints.
async function requireOwner(docId: string, userId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc) return { ok: false, status: 404, error: 'Document not found' };
  if (doc.userId !== userId) return { ok: false, status: 403, error: 'Only the owner can manage shares' };
  return { ok: true };
}

// List current shares.
router.get('/:id/shares', async (req: Request, res: Response) => {
  const check = await requireOwner(req.params.id!, req.user!.id);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const shares = await db.documentShare.findMany({
    where: { documentId: req.params.id! },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    shares: shares.map(s => ({
      id: s.id,
      userId: s.userId,
      userEmail: s.user.email,
      userName: s.user.name,
      permission: s.permission,
      createdAt: s.createdAt,
    })),
  });
});

// Share with a user (by email).
router.post('/:id/share', async (req: Request, res: Response) => {
  const parsed = shareDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const check = await requireOwner(req.params.id!, req.user!.id);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const targetUser = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
    select: { id: true, email: true, name: true },
  });
  if (!targetUser) {
    res.status(404).json({ error: 'No user with that email' });
    return;
  }
  if (targetUser.id === req.user!.id) {
    res.status(400).json({ error: 'Cannot share a document with yourself' });
    return;
  }

  // Plan limit: basic users can have at most BASIC_SHARES_PER_DOC share
  // recipients per document.
  if (req.user!.plan === 'basic') {
    const existingShareCount = await db.documentShare.count({
      where: { documentId: req.params.id! },
    });
    if (existingShareCount >= BASIC_SHARES_PER_DOC) {
      res.status(403).json({
        error: `Basic plan allows only ${BASIC_SHARES_PER_DOC} share per document. Upgrade to Premium for unlimited shares.`,
        limit: BASIC_SHARES_PER_DOC,
        plan: 'basic',
        kind: 'share-limit',
      });
      return;
    }
  }

  try {
    const share = await db.documentShare.create({
      data: { documentId: req.params.id!, userId: targetUser.id, permission: 'edit' },
    });
    res.status(201).json({
      share: {
        id: share.id,
        userId: targetUser.id,
        userEmail: targetUser.email,
        userName: targetUser.name,
        permission: share.permission,
        createdAt: share.createdAt,
      },
    });
  } catch (err) {
    // Unique constraint failure = already shared with this user
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      res.status(409).json({ error: 'Document already shared with this user' });
      return;
    }
    throw err;
  }
});

// Revoke share for a specific user.
router.delete('/:id/share/:userId', async (req: Request, res: Response) => {
  const check = await requireOwner(req.params.id!, req.user!.id);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const result = await db.documentShare.deleteMany({
    where: { documentId: req.params.id!, userId: req.params.userId! },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Share not found' });
    return;
  }
  res.status(204).send();
});

export default router;
