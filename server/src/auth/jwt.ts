import jwt from 'jsonwebtoken';
import { env } from '../env.js';

const TOKEN_EXPIRY = '1h';

export interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as { sub?: unknown }).sub !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }
  return decoded as TokenPayload;
}
