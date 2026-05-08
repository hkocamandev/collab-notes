import { z } from 'zod';

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().optional(),
});

export const shareDocumentSchema = z.object({
  email: z.string().email().max(255),
});
