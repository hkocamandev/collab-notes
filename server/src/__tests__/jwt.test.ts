import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../auth/jwt.js';

describe('signToken', () => {
  it('returns a non-empty string', () => {
    const token = signToken('user-123');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('produces a JWT with three dot-separated parts', () => {
    const token = signToken('user-abc');
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('verifyToken', () => {
  it('returns the correct sub for a valid token', () => {
    const userId = 'user-abc';
    const token = signToken(userId);
    const payload = verifyToken(token);
    expect(payload.sub).toBe(userId);
  });

  it('throws on a tampered token', () => {
    const token = signToken('user-123');
    expect(() => verifyToken(token + 'x')).toThrow();
  });

  it('throws on a completely invalid string', () => {
    expect(() => verifyToken('not.a.valid.token')).toThrow();
  });

  it('throws on an empty string', () => {
    expect(() => verifyToken('')).toThrow();
  });
});
