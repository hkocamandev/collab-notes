import { apiFetch } from '../lib/apiClient';

export type Plan = 'basic' | 'premium';

export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface MeResponse {
  user: User;
}

export function register(input: { email: string; password: string; name?: string }) {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchMe() {
  return apiFetch<MeResponse>('/api/auth/me');
}

export function upgradePlan() {
  return apiFetch<{ user: User }>('/api/auth/upgrade', { method: 'POST' });
}
