import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { signToken } from '../auth/jwt.js';

vi.mock('../db.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    documentShare: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { db } from '../db.js';

const mockUserFindUnique = db.user.findUnique as ReturnType<typeof vi.fn>;
const mockDocFindMany = db.document.findMany as ReturnType<typeof vi.fn>;
const mockDocFindFirst = db.document.findFirst as ReturnType<typeof vi.fn>;
const mockDocFindUnique = db.document.findUnique as ReturnType<typeof vi.fn>;
const mockDocCreate = db.document.create as ReturnType<typeof vi.fn>;
const mockDocUpdate = db.document.update as ReturnType<typeof vi.fn>;
const mockDocDelete = db.document.delete as ReturnType<typeof vi.fn>;
const mockShareFindMany = db.documentShare.findMany as ReturnType<typeof vi.fn>;
const mockShareFindUnique = db.documentShare.findUnique as ReturnType<typeof vi.fn>;
const mockShareCreate = db.documentShare.create as ReturnType<typeof vi.fn>;
const mockShareDeleteMany = db.documentShare.deleteMany as ReturnType<typeof vi.fn>;

const app = createApp();

const FAKE_USER = { id: 'user-1', email: 'test@example.com', name: 'Test' };
const OTHER_USER = { id: 'user-2', email: 'other@example.com', name: 'Other' };

const FAKE_DOC = {
  id: 'doc-1',
  title: 'My Doc',
  content: '[]',
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
  _count: { shares: 0 },
};

// Doc owned by OTHER_USER, shared with FAKE_USER
const SHARED_DOC = {
  ...FAKE_DOC,
  id: 'doc-shared',
  userId: 'user-2',
  user: { id: 'user-2', email: 'other@example.com', name: 'Other' },
};

function authHeader() {
  const token = signToken(FAKE_USER.id);
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindUnique.mockResolvedValue(FAKE_USER);
  // Default: no shares for any query — individual tests override.
  mockShareFindUnique.mockResolvedValue(null);
  mockShareFindMany.mockResolvedValue([]);
});

describe('GET /api/documents', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('200 with empty list when no documents', async () => {
    mockDocFindMany.mockResolvedValue([]);
    mockShareFindMany.mockResolvedValue([]);
    const res = await request(app).get('/api/documents').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });

  it('200 with owned + shared documents, each with permission', async () => {
    mockDocFindMany.mockResolvedValue([FAKE_DOC]);
    mockShareFindMany.mockResolvedValue([{ document: SHARED_DOC }]);
    const res = await request(app).get('/api/documents').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(2);

    const owned = res.body.documents.find((d: { id: string }) => d.id === 'doc-1');
    expect(owned.permission).toBe('owner');
    expect(owned.ownerEmail).toBeNull();

    const shared = res.body.documents.find((d: { id: string }) => d.id === 'doc-shared');
    expect(shared.permission).toBe('editor');
    expect(shared.ownerEmail).toBe('other@example.com');
  });

  it('shareCount is exposed only to owner (null for shared editors)', async () => {
    mockDocFindMany.mockResolvedValue([{ ...FAKE_DOC, _count: { shares: 2 } }]);
    mockShareFindMany.mockResolvedValue([{ document: { ...SHARED_DOC, _count: { shares: 5 } } }]);
    const res = await request(app).get('/api/documents').set(authHeader());

    const owned = res.body.documents.find((d: { id: string }) => d.id === 'doc-1');
    expect(owned.shareCount).toBe(2);

    const shared = res.body.documents.find((d: { id: string }) => d.id === 'doc-shared');
    expect(shared.shareCount).toBeNull();
  });
});

describe('GET /api/documents/trash', () => {
  it('200 with deleted documents (owner-only)', async () => {
    const deletedDoc = { ...FAKE_DOC, deletedAt: new Date() };
    mockDocFindMany.mockResolvedValue([deletedDoc]);
    const res = await request(app).get('/api/documents/trash').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].permission).toBe('owner');
  });
});

describe('POST /api/documents', () => {
  it('201 with new document (caller becomes owner)', async () => {
    mockDocCreate.mockResolvedValue(FAKE_DOC);
    const res = await request(app)
      .post('/api/documents')
      .set(authHeader())
      .send({ title: 'My Doc' });
    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('My Doc');
    expect(res.body.document.permission).toBe('owner');
  });

  it('201 with default title when not provided', async () => {
    mockDocCreate.mockResolvedValue({ ...FAKE_DOC, title: 'Untitled' });
    const res = await request(app).post('/api/documents').set(authHeader()).send({});
    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('Untitled');
  });
});

describe('GET /api/documents/:id', () => {
  it('200 for owned document', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    const res = await request(app).get('/api/documents/doc-1').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.document.permission).toBe('owner');
  });

  it('200 for shared document with permission editor', async () => {
    mockDocFindFirst.mockResolvedValue(SHARED_DOC);
    mockShareFindUnique.mockResolvedValue({
      id: 'share-1',
      documentId: 'doc-shared',
      userId: 'user-1',
      permission: 'edit',
    });
    const res = await request(app).get('/api/documents/doc-shared').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.document.permission).toBe('editor');
    expect(res.body.document.ownerEmail).toBe('other@example.com');
  });

  it('404 when no access (not owner, not shared)', async () => {
    mockDocFindFirst.mockResolvedValue(SHARED_DOC);
    mockShareFindUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/documents/doc-shared').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('404 when document does not exist', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/documents/no-such').set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/documents/:id', () => {
  it('200 owner updates title', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    mockDocUpdate.mockResolvedValue({ ...FAKE_DOC, title: 'New Title' });
    const res = await request(app)
      .patch('/api/documents/doc-1')
      .set(authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.document.title).toBe('New Title');
  });

  it('200 shared editor can update', async () => {
    mockDocFindFirst.mockResolvedValue(SHARED_DOC);
    mockShareFindUnique.mockResolvedValue({
      id: 'share-1', documentId: 'doc-shared', userId: 'user-1', permission: 'edit',
    });
    mockDocUpdate.mockResolvedValue({ ...SHARED_DOC, title: 'Edited by shared' });
    const res = await request(app)
      .patch('/api/documents/doc-shared')
      .set(authHeader())
      .send({ title: 'Edited by shared' });
    expect(res.status).toBe(200);
    expect(res.body.document.permission).toBe('editor');
  });

  it('404 when not accessible', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/documents/no-such')
      .set(authHeader())
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id (owner-only)', () => {
  it('200 owner soft-deletes and returns affectedUserIds', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    mockShareFindMany.mockResolvedValue([{ userId: 'shared-user-a' }, { userId: 'shared-user-b' }]);
    mockDocUpdate.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    const res = await request(app).delete('/api/documents/doc-1').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.affectedUserIds).toEqual(['shared-user-a', 'shared-user-b']);
  });

  it('200 with empty affectedUserIds when no shares exist', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    mockShareFindMany.mockResolvedValue([]);
    mockDocUpdate.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    const res = await request(app).delete('/api/documents/doc-1').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.affectedUserIds).toEqual([]);
  });

  it('403 when shared editor tries to delete', async () => {
    mockDocFindFirst.mockResolvedValue(SHARED_DOC);
    const res = await request(app).delete('/api/documents/doc-shared').set(authHeader());
    expect(res.status).toBe(403);
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it('404 for non-existent doc', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app).delete('/api/documents/no-such').set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id/permanent (owner-only)', () => {
  it('200 owner permanently deletes from trash and returns affectedUserIds', async () => {
    mockDocFindFirst.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    mockShareFindMany.mockResolvedValue([{ userId: 'shared-user-a' }]);
    mockDocDelete.mockResolvedValue(undefined);
    const res = await request(app)
      .delete('/api/documents/doc-1/permanent')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.affectedUserIds).toEqual(['shared-user-a']);
  });

  it('403 when shared editor tries', async () => {
    mockDocFindFirst.mockResolvedValue({ ...SHARED_DOC, deletedAt: new Date() });
    const res = await request(app)
      .delete('/api/documents/doc-shared/permanent')
      .set(authHeader());
    expect(res.status).toBe(403);
    expect(mockDocDelete).not.toHaveBeenCalled();
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/documents/doc-1/permanent');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/documents/:id/restore (owner-only)', () => {
  it('200 owner restores and returns affectedUserIds', async () => {
    mockDocFindFirst.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    mockShareFindMany.mockResolvedValue([{ userId: 'shared-user-a' }]);
    mockDocUpdate.mockResolvedValue({ ...FAKE_DOC, deletedAt: null });
    const res = await request(app).patch('/api/documents/doc-1/restore').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.document.deletedAt).toBeNull();
    expect(res.body.affectedUserIds).toEqual(['shared-user-a']);
  });

  it('403 when shared editor tries', async () => {
    mockDocFindFirst.mockResolvedValue({ ...SHARED_DOC, deletedAt: new Date() });
    const res = await request(app)
      .patch('/api/documents/doc-shared/restore')
      .set(authHeader());
    expect(res.status).toBe(403);
  });
});

// ── Sharing endpoints ─────────────────────────────────────────────────────────

describe('GET /api/documents/:id/shares (owner-only)', () => {
  it('200 returns shares for owner', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-1' });
    mockShareFindMany.mockResolvedValue([
      {
        id: 'share-1',
        userId: 'user-2',
        permission: 'edit',
        createdAt: new Date(),
        user: { id: 'user-2', email: 'other@example.com', name: 'Other' },
      },
    ]);
    const res = await request(app).get('/api/documents/doc-1/shares').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.shares).toHaveLength(1);
    expect(res.body.shares[0].userEmail).toBe('other@example.com');
  });

  it('403 when caller is not the owner', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-2' });
    const res = await request(app).get('/api/documents/doc-1/shares').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('404 when doc does not exist', async () => {
    mockDocFindUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/documents/no-such/shares').set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/documents/:id/share', () => {
  beforeEach(() => {
    mockDocFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-1' });
  });

  it('201 creates a share', async () => {
    mockUserFindUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === 'user-1') return Promise.resolve(FAKE_USER);
      if (where.email === 'other@example.com') return Promise.resolve(OTHER_USER);
      return Promise.resolve(null);
    });
    mockShareCreate.mockResolvedValue({
      id: 'share-1',
      documentId: 'doc-1',
      userId: 'user-2',
      permission: 'edit',
      createdAt: new Date(),
    });
    const res = await request(app)
      .post('/api/documents/doc-1/share')
      .set(authHeader())
      .send({ email: 'other@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.share.userEmail).toBe('other@example.com');
    expect(res.body.share.permission).toBe('edit');
  });

  it('400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/documents/doc-1/share')
      .set(authHeader())
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('404 when target email is not a registered user', async () => {
    mockUserFindUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === 'user-1') return Promise.resolve(FAKE_USER);
      return Promise.resolve(null);
    });
    const res = await request(app)
      .post('/api/documents/doc-1/share')
      .set(authHeader())
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(404);
  });

  it('400 when sharing with yourself', async () => {
    mockUserFindUnique.mockResolvedValue(FAKE_USER);
    const res = await request(app)
      .post('/api/documents/doc-1/share')
      .set(authHeader())
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  it('409 when already shared with that user', async () => {
    mockUserFindUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === 'user-1') return Promise.resolve(FAKE_USER);
      if (where.email === 'other@example.com') return Promise.resolve(OTHER_USER);
      return Promise.resolve(null);
    });
    mockShareCreate.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    const res = await request(app)
      .post('/api/documents/doc-1/share')
      .set(authHeader())
      .send({ email: 'other@example.com' });
    expect(res.status).toBe(409);
  });

  it('403 when non-owner tries to share', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-2' });
    const res = await request(app)
      .post('/api/documents/doc-1/share')
      .set(authHeader())
      .send({ email: 'someone@example.com' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/documents/:id/share/:userId', () => {
  beforeEach(() => {
    mockDocFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-1' });
  });

  it('204 revokes a share', async () => {
    mockShareDeleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .delete('/api/documents/doc-1/share/user-2')
      .set(authHeader());
    expect(res.status).toBe(204);
  });

  it('404 when share does not exist', async () => {
    mockShareDeleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app)
      .delete('/api/documents/doc-1/share/user-99')
      .set(authHeader());
    expect(res.status).toBe(404);
  });

  it('403 when non-owner tries to revoke', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-2' });
    const res = await request(app)
      .delete('/api/documents/doc-1/share/user-3')
      .set(authHeader());
    expect(res.status).toBe(403);
  });
});
