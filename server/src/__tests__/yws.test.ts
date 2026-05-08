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

import { setupWSConnection, rooms } from '../yws.js';

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
