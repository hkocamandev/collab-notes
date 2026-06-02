import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ws', () => {
  class MockWebSocket {}
  (MockWebSocket as unknown as { OPEN: number }).OPEN = 1;
  class MockWebSocketServer {
    on = vi.fn();
  }
  return { WebSocket: MockWebSocket, WebSocketServer: MockWebSocketServer };
});

vi.mock('yjs', () => ({
  Doc: class MockDoc {
    on = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('y-protocols/sync', () => ({
  writeSyncStep1: vi.fn(),
  readSyncMessage: vi.fn(() => 1),
  writeUpdate: vi.fn(),
}));

vi.mock('y-protocols/awareness', () => ({
  Awareness: class MockAwareness {
    on = vi.fn();
    getStates = vi.fn(() => new Map());
  },
  encodeAwarenessUpdate: vi.fn(() => new Uint8Array()),
  removeAwarenessStates: vi.fn(),
  applyAwarenessUpdate: vi.fn(),
}));

vi.mock('lib0/encoding', () => ({
  createEncoder: vi.fn(() => ({})),
  writeVarUint: vi.fn(),
  writeVarUint8Array: vi.fn(),
  toUint8Array: vi.fn(() => new Uint8Array()),
  length: vi.fn(() => 2),
}));

vi.mock('lib0/decoding', () => ({
  createDecoder: vi.fn(() => ({})),
  readVarUint: vi.fn(() => 0),
  readVarUint8Array: vi.fn(() => new Uint8Array()),
  readVarString: vi.fn(() => '{}'),
}));

vi.mock('http', () => ({
  createServer: vi.fn(() => ({ listen: vi.fn((_, cb?: () => void) => cb?.()) })),
}));

// db is hit only by authorizeConnection; mock it so no real Prisma client loads.
vi.mock('../db.js', () => ({
  db: { document: { findFirst: vi.fn() } },
}));

import { setupWSConnection, authorizeConnection, rooms } from '../yws.js';
import { signToken } from '../auth/jwt.js';
import { db } from '../db.js';

const findFirst = db.document.findFirst as unknown as ReturnType<typeof vi.fn>;

function makeConn() {
  return {
    readyState: 1,
    binaryType: 'nodebuffer' as string,
    send: vi.fn(),
    on: vi.fn(),
  };
}

function makeReq(path = '/test-room') {
  return { url: path, headers: { host: 'localhost' } } as never;
}

beforeEach(() => {
  rooms.clear();
  vi.clearAllMocks();
});

describe('setupWSConnection', () => {
  it('sets binaryType to arraybuffer', () => {
    const conn = makeConn();
    setupWSConnection(conn as never, makeReq());
    expect(conn.binaryType).toBe('arraybuffer');
  });

  it('creates a room entry for the given path', () => {
    setupWSConnection(makeConn() as never, makeReq('/my-doc'));
    expect(rooms.has('my-doc')).toBe(true);
  });

  it('registers message, close and error handlers', () => {
    const conn = makeConn();
    setupWSConnection(conn as never, makeReq());
    const events = (conn.on.mock.calls as [string, unknown][]).map(([evt]) => evt);
    expect(events).toContain('message');
    expect(events).toContain('close');
    expect(events).toContain('error');
  });

  it('sends an initial sync message', () => {
    const conn = makeConn();
    setupWSConnection(conn as never, makeReq());
    expect(conn.send).toHaveBeenCalled();
  });

  it('reuses the same room for connections to the same path', () => {
    setupWSConnection(makeConn() as never, makeReq('/shared'));
    setupWSConnection(makeConn() as never, makeReq('/shared'));
    expect(rooms.size).toBe(1);
    expect(rooms.get('shared')!.conns.size).toBe(2);
  });

  it('creates separate rooms for different paths', () => {
    setupWSConnection(makeConn() as never, makeReq('/doc-a'));
    setupWSConnection(makeConn() as never, makeReq('/doc-b'));
    expect(rooms.size).toBe(2);
  });

  it('removes the connection from the room on close', () => {
    const conn = makeConn();
    setupWSConnection(conn as never, makeReq('/close-test'));

    const closeHandler = (conn.on.mock.calls as [string, () => void][]).find(
      ([evt]) => evt === 'close',
    )?.[1];
    expect(closeHandler).toBeDefined();
    closeHandler!();

    expect(rooms.get('close-test')!.conns.has(conn as never)).toBe(false);
  });
});

describe('authorizeConnection', () => {
  const reqFor = (url: string) => ({ url, headers: { host: 'localhost' } }) as never;

  it('returns null when no token query param is present', async () => {
    expect(await authorizeConnection(reqFor('/doc-abc'))).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns null for an invalid/garbage token', async () => {
    expect(await authorizeConnection(reqFor('/doc-abc?token=not.a.jwt'))).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the room name is not a doc- room', async () => {
    const token = signToken('user-1');
    expect(await authorizeConnection(reqFor(`/random?token=${token}`))).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns the userId when the token is valid and the user can access the doc', async () => {
    findFirst.mockResolvedValueOnce({ id: 'abc' });
    const token = signToken('user-1');
    expect(await authorizeConnection(reqFor(`/doc-abc?token=${token}`))).toBe('user-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'abc', OR: [{ userId: 'user-1' }, { shares: { some: { userId: 'user-1' } } }] },
      select: { id: true },
    });
  });

  it('returns null when the user has no access to the doc', async () => {
    findFirst.mockResolvedValueOnce(null);
    const token = signToken('user-2');
    expect(await authorizeConnection(reqFor(`/doc-abc?token=${token}`))).toBeNull();
  });

  it('returns null when the DB query throws', async () => {
    findFirst.mockRejectedValueOnce(new Error('db down'));
    const token = signToken('user-1');
    expect(await authorizeConnection(reqFor(`/doc-abc?token=${token}`))).toBeNull();
  });
});
