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
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { db } from '../db.js';

const mockUserFindUnique = db.user.findUnique as ReturnType<typeof vi.fn>;
const mockDocFindMany = db.document.findMany as ReturnType<typeof vi.fn>;
const mockDocFindFirst = db.document.findFirst as ReturnType<typeof vi.fn>;
const mockDocCreate = db.document.create as ReturnType<typeof vi.fn>;
const mockDocUpdate = db.document.update as ReturnType<typeof vi.fn>;
const mockDocDelete = db.document.delete as ReturnType<typeof vi.fn>;

const app = createApp();

const FAKE_USER = { id: 'user-1', email: 'test@example.com', name: 'Test' };
const FAKE_DOC = {
  id: 'doc-1',
  title: 'My Doc',
  content: '[]',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function authHeader() {
  const token = signToken(FAKE_USER.id);
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindUnique.mockResolvedValue(FAKE_USER);
});

describe('GET /api/documents', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('200 with empty list when no documents', async () => {
    mockDocFindMany.mockResolvedValue([]);
    const res = await request(app).get('/api/documents').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });

  it('200 with user documents', async () => {
    mockDocFindMany.mockResolvedValue([FAKE_DOC]);
    const res = await request(app).get('/api/documents').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].id).toBe('doc-1');
  });
});

describe('GET /api/documents/trash', () => {
  it('200 with deleted documents', async () => {
    const deletedDoc = { ...FAKE_DOC, deletedAt: new Date() };
    mockDocFindMany.mockResolvedValue([deletedDoc]);
    const res = await request(app).get('/api/documents/trash').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });
});

describe('POST /api/documents', () => {
  it('201 with new document', async () => {
    mockDocCreate.mockResolvedValue(FAKE_DOC);
    const res = await request(app)
      .post('/api/documents')
      .set(authHeader())
      .send({ title: 'My Doc' });
    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('My Doc');
  });

  it('201 with default title when not provided', async () => {
    mockDocCreate.mockResolvedValue({ ...FAKE_DOC, title: 'Untitled' });
    const res = await request(app).post('/api/documents').set(authHeader()).send({});
    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('Untitled');
  });
});

describe('GET /api/documents/:id', () => {
  it('200 for existing document', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    const res = await request(app).get('/api/documents/doc-1').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.document.id).toBe('doc-1');
  });

  it('404 for non-existent or other user document', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/documents/no-such').set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/documents/:id', () => {
  it('200 updates title', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    mockDocUpdate.mockResolvedValue({ ...FAKE_DOC, title: 'New Title' });
    const res = await request(app)
      .patch('/api/documents/doc-1')
      .set(authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.document.title).toBe('New Title');
  });

  it('404 when document not found', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/documents/no-such')
      .set(authHeader())
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('204 soft-deletes the document', async () => {
    mockDocFindFirst.mockResolvedValue(FAKE_DOC);
    mockDocUpdate.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    const res = await request(app)
      .delete('/api/documents/doc-1')
      .set(authHeader());
    expect(res.status).toBe(204);
  });

  it('404 for already deleted document', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/documents/doc-1')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id/permanent', () => {
  it('204 permanently deletes a document in trash', async () => {
    mockDocFindFirst.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    mockDocDelete.mockResolvedValue(undefined);
    const res = await request(app)
      .delete('/api/documents/doc-1/permanent')
      .set(authHeader());
    expect(res.status).toBe(204);
    expect(mockDocDelete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('404 when document is not in trash', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/documents/doc-1/permanent')
      .set(authHeader());
    expect(res.status).toBe(404);
  });

  it('401 without token', async () => {
    const res = await request(app).delete('/api/documents/doc-1/permanent');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/documents/:id/restore', () => {
  it('200 restores a deleted document', async () => {
    mockDocFindFirst.mockResolvedValue({ ...FAKE_DOC, deletedAt: new Date() });
    mockDocUpdate.mockResolvedValue(FAKE_DOC);
    const res = await request(app)
      .patch('/api/documents/doc-1/restore')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.document.deletedAt).toBeNull();
  });

  it('404 when document is not in trash', async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/documents/doc-1/restore')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});
