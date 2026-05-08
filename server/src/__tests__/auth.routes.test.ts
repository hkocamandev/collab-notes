import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

// Prisma'yı mock'luyoruz — gerçek DB'ye dokunmadan HTTP katmanını test ediyoruz
vi.mock('../db.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// bcrypt çağrılarını mock'luyoruz — testler hızlı çalışsın
vi.mock('../auth/password.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('$hashed-password'),
  verifyPassword: vi.fn(),
}));

import { db } from '../db.js';
import { verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/jwt.js';

// Tip kolaylığı için cast
const mockFindUnique = db.user.findUnique as ReturnType<typeof vi.fn>;
const mockCreate = db.user.create as ReturnType<typeof vi.fn>;
const mockUpdate = db.user.update as ReturnType<typeof vi.fn>;
const mockVerifyPassword = verifyPassword as ReturnType<typeof vi.fn>;

const app = createApp();

const FAKE_USER = {
  id: 'cuid-test-123',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$hashed-password',
  plan: 'basic',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('POST /api/auth/register', () => {
  beforeEach(() => vi.clearAllMocks());

  it('201 + token + user for valid input', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: FAKE_USER.id,
      email: FAKE_USER.email,
      name: FAKE_USER.name,
      plan: 'basic',
      createdAt: FAKE_USER.createdAt,
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('409 when email already registered', async () => {
    mockFindUnique.mockResolvedValue(FAKE_USER);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('400 for password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 + token for valid credentials', async () => {
    mockFindUnique.mockResolvedValue(FAKE_USER);
    mockVerifyPassword.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('401 for wrong password', async () => {
    mockFindUnique.mockResolvedValue(FAKE_USER);
    mockVerifyPassword.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('401 for unknown email', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('400 for invalid request body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad', password: '' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 for invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('200 + user for valid token (includes plan)', async () => {
    const token = signToken(FAKE_USER.id);
    mockFindUnique.mockResolvedValue({
      id: FAKE_USER.id,
      email: FAKE_USER.email,
      name: FAKE_USER.name,
      plan: 'basic',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(FAKE_USER.id);
    expect(res.body.user.email).toBe(FAKE_USER.email);
    expect(res.body.user.plan).toBe('basic');
  });

  it('401 when token user no longer exists in DB', async () => {
    const token = signToken('deleted-user-id');
    mockFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/upgrade', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 + user with plan="premium"', async () => {
    const token = signToken(FAKE_USER.id);
    // Middleware lookup
    mockFindUnique.mockResolvedValue({
      id: FAKE_USER.id,
      email: FAKE_USER.email,
      name: FAKE_USER.name,
      plan: 'basic',
    });
    mockUpdate.mockResolvedValue({
      id: FAKE_USER.id,
      email: FAKE_USER.email,
      name: FAKE_USER.name,
      plan: 'premium',
      createdAt: FAKE_USER.createdAt,
    });

    const res = await request(app)
      .post('/api/auth/upgrade')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.plan).toBe('premium');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FAKE_USER.id },
        data: { plan: 'premium' },
      }),
    );
  });

  it('401 without token', async () => {
    const res = await request(app).post('/api/auth/upgrade');
    expect(res.status).toBe(401);
  });
});
