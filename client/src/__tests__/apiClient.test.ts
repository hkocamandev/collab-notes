import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getToken, setToken, clearToken, ApiError, apiFetch } from '../lib/apiClient';

describe('token helpers', () => {
  beforeEach(() => sessionStorage.clear());

  it('getToken returns null when nothing stored', () => {
    expect(getToken()).toBeNull();
  });

  it('setToken stores the token', () => {
    setToken('my-token');
    expect(getToken()).toBe('my-token');
  });

  it('clearToken removes the token', () => {
    setToken('my-token');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError(400, { error: 'bad' }, 'Bad request');
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes status and body', () => {
    const body = { error: 'Unauthorized' };
    const err = new ApiError(401, body, 'Unauthorized');
    expect(err.status).toBe(401);
    expect(err.body).toBe(body);
    expect(err.message).toBe('Unauthorized');
  });
});

describe('apiFetch', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  // vi.stubGlobal 'fetch'i değiştirir; dönen değil, atadığımız mock'u kullanıyoruz
  function stubFetch(ok: boolean, status: number, data: unknown) {
    const mockFn = vi.fn().mockResolvedValue({
      ok,
      status,
      text: () => Promise.resolve(JSON.stringify(data)),
    });
    vi.stubGlobal('fetch', mockFn);
    return mockFn;
  }

  it('adds Bearer header when token exists', async () => {
    setToken('test-token');
    const fetchSpy = stubFetch(true, 200, { ok: true });

    await apiFetch('/api/test');

    const [, opts] = fetchSpy.mock.calls[0] as [string, { headers: Headers }];
    expect(opts.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('does not add Authorization header when no token stored', async () => {
    const fetchSpy = stubFetch(true, 200, {});

    await apiFetch('/api/test');

    const [, opts] = fetchSpy.mock.calls[0] as [string, { headers: Headers }];
    expect(opts.headers.get('Authorization')).toBeNull();
  });

  it('sets Content-Type: application/json when body is provided', async () => {
    const fetchSpy = stubFetch(true, 200, {});

    await apiFetch('/api/test', { method: 'POST', body: JSON.stringify({ x: 1 }) });

    const [, opts] = fetchSpy.mock.calls[0] as [string, { headers: Headers }];
    expect(opts.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns parsed JSON on success', async () => {
    stubFetch(true, 200, { message: 'hello' });

    const result = await apiFetch<{ message: string }>('/api/test');
    expect(result.message).toBe('hello');
  });

  it('throws ApiError on non-ok response', async () => {
    stubFetch(false, 401, { error: 'Unauthorized' });

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError);
  });

  it('ApiError message comes from the error field in response body', async () => {
    stubFetch(false, 403, { error: 'Forbidden' });

    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
  });
});
