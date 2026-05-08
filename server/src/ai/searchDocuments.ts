// Core semantic-search function. Used by both the REST endpoint
// (POST /api/ai/ask) and the MCP server's `search_documents` tool — both
// channels rely on the exact same ranking logic so behaviour is identical.

import { db } from '../db.js';
import { embed, cosineSim, docTextForEmbedding } from './embedding.js';

export interface SearchResult {
  id: string;
  title: string;
  similarity: number;
}

interface AccessibleDoc {
  id: string;
  title: string;
  content: string;
  embedding: string | null;
}

// Returns documents the user can read (owned + shared, non-deleted) ranked
// by semantic similarity to `query`. Computes missing embeddings on the fly
// (lazy backfill for docs created before this feature shipped).
export async function searchDocuments(
  userId: string,
  query: string,
  limit = 5,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryVector = await embed(trimmed);

  // Fetch accessible docs in one go — owner + shared, deletedAt null.
  const owned = await db.document.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, title: true, content: true, embedding: true },
  });
  const sharedRecords = await db.documentShare.findMany({
    where: { userId, document: { deletedAt: null } },
    select: {
      document: { select: { id: true, title: true, content: true, embedding: true } },
    },
  });
  const docs: AccessibleDoc[] = [...owned, ...sharedRecords.map(s => s.document)];

  if (docs.length === 0) return [];

  // Score each doc; backfill missing embeddings as we go.
  const scored: SearchResult[] = [];
  for (const doc of docs) {
    let vector: number[] | null = null;
    if (doc.embedding) {
      try {
        vector = JSON.parse(doc.embedding) as number[];
      } catch {
        // Corrupt JSON → recompute below.
      }
    }
    if (!vector) {
      const text = docTextForEmbedding(doc.title, doc.content);
      if (!text.trim()) continue; // empty doc — skip ranking
      vector = await embed(text);
      // Persist for next time so we don't pay this cost twice.
      await db.document.update({
        where: { id: doc.id },
        data: { embedding: JSON.stringify(vector), embeddingAt: new Date() },
      });
    }
    scored.push({
      id: doc.id,
      title: doc.title,
      similarity: cosineSim(queryVector, vector),
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}
