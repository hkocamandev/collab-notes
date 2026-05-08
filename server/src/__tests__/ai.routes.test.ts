import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { signToken } from '../auth/jwt.js';

// Mock the search core so we don't load the real model in tests. The route
// is just a thin wrapper; mocking searchDocuments is the right seam.
vi.mock('../ai/searchDocuments.js', () => ({
  searchDocuments: vi.fn(),
}));

vi.mock('../db.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { searchDocuments } from '../ai/searchDocuments.js';
import { db } from '../db.js';

const mockSearchDocuments = vi.mocked(searchDocuments);
const mockUserFindUnique = db.user.findUnique as ReturnType<typeof vi.fn>;

const app = createApp();
const FAKE_USER = { id: 'user-1', email: 't@x.com', name: 'T', plan: 'basic' };

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindUnique.mockResolvedValue(FAKE_USER);
});

function authHeader() {
  return { Authorization: `Bearer ${signToken(FAKE_USER.id)}` };
}

describe('POST /api/ai/ask', () => {
  it('200 returns ranked search results', async () => {
    mockSearchDocuments.mockResolvedValue([
      { id: 'd1', title: 'React Hooks', similarity: 0.82 },
      { id: 'd2', title: 'Other doc', similarity: 0.41 },
    ]);

    const res = await request(app)
      .post('/api/ai/ask')
      .set(authHeader())
      .send({ query: 'react hooks' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].title).toBe('React Hooks');
    expect(mockSearchDocuments).toHaveBeenCalledWith('user-1', 'react hooks', undefined);
  });

  it('passes optional limit through to searchDocuments', async () => {
    mockSearchDocuments.mockResolvedValue([]);
    await request(app)
      .post('/api/ai/ask')
      .set(authHeader())
      .send({ query: 'q', limit: 3 });
    expect(mockSearchDocuments).toHaveBeenCalledWith('user-1', 'q', 3);
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/ai/ask').send({ query: 'q' });
    expect(res.status).toBe(401);
  });

  it('400 for empty query', async () => {
    const res = await request(app)
      .post('/api/ai/ask')
      .set(authHeader())
      .send({ query: '' });
    expect(res.status).toBe(400);
  });

  it('400 for query over 500 chars', async () => {
    const res = await request(app)
      .post('/api/ai/ask')
      .set(authHeader())
      .send({ query: 'a'.repeat(501) });
    expect(res.status).toBe(400);
  });
});
