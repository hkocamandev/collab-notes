import { apiFetch } from '../lib/apiClient.js';

export type Permission = 'owner' | 'editor';

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  permission: Permission;
  ownerEmail: string | null;
  ownerName: string | null;
  shareCount: number | null;
}

export interface Share {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  permission: string;
  createdAt: string;
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

// affectedUserIds is the list of share recipients — the owner's frontend uses
// this to broadcast cross-tab notifications so editors' sidebars stay in sync.
export function deleteDocument(id: string) {
  return apiFetch<{ affectedUserIds: string[] }>(`/api/documents/${id}`, { method: 'DELETE' });
}

export function restoreDocument(id: string) {
  return apiFetch<{ document: Document; affectedUserIds: string[] }>(
    `/api/documents/${id}/restore`,
    { method: 'PATCH' },
  );
}

export function permanentlyDeleteDocument(id: string) {
  return apiFetch<{ affectedUserIds: string[] }>(`/api/documents/${id}/permanent`, {
    method: 'DELETE',
  });
}

export function listShares(id: string) {
  return apiFetch<{ shares: Share[] }>(`/api/documents/${id}/shares`);
}

export function shareDocument(id: string, email: string) {
  return apiFetch<{ share: Share }>(`/api/documents/${id}/share`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function revokeShare(id: string, userId: string) {
  return apiFetch<void>(`/api/documents/${id}/share/${userId}`, { method: 'DELETE' });
}
