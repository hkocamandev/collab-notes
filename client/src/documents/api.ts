import { apiFetch } from '../lib/apiClient.js';

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function listDocuments() {
  return apiFetch<{ documents: Document[] }>('/api/documents');
}

export function listTrash() {
  return apiFetch<{ documents: Document[] }>('/api/documents/trash');
}

export function createDocument(title?: string) {
  return apiFetch<{ document: Document }>('/api/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export function getDocument(id: string) {
  return apiFetch<{ document: Document }>(`/api/documents/${id}`);
}

export function updateDocument(id: string, data: { title?: string; content?: string }) {
  return apiFetch<{ document: Document }>(`/api/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteDocument(id: string) {
  return apiFetch<void>(`/api/documents/${id}`, { method: 'DELETE' });
}

export function restoreDocument(id: string) {
  return apiFetch<{ document: Document }>(`/api/documents/${id}/restore`, {
    method: 'PATCH',
  });
}
