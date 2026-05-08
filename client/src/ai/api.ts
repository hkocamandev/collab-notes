import { apiFetch } from '../lib/apiClient.js';

export interface AskResult {
  id: string;
  title: string;
  similarity: number;
}

export function askAi(query: string, limit?: number) {
  return apiFetch<{ results: AskResult[] }>(`/api/ai/ask`, {
    method: 'POST',
    body: JSON.stringify({ query, ...(limit !== undefined && { limit }) }),
  });
}
