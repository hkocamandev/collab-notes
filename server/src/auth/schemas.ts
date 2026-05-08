import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
