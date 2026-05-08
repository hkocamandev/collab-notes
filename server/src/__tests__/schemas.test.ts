import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../auth/schemas.js';

describe('registerSchema', () => {
  it('accepts valid input without name', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with name', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      name: 'John Doe',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('John Doe');
  });

  it('lowercases email', () => {
    const result = registerSchema.safeParse({
      email: 'User@EXAMPLE.COM',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('rejects invalid email format', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password longer than 72 chars', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'a'.repeat(73),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name string', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      name: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'anypassword',
    });
    expect(result.success).toBe(true);
  });

  it('lowercases email', () => {
    const result = loginSchema.safeParse({
      email: 'User@EXAMPLE.COM',
      password: 'anypassword',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'bad', password: 'anypassword' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});
