import { createServer, type IncomingMessage } from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface Room {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(name: string): Room {
  let room = rooms.get(name);
  if (room) return room;

  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);
  room = { ydoc, awareness, conns: new Map() };
  rooms.set(name, room);

  ydoc.on('update', (update: Uint8Array) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    room!.conns.forEach((_, conn) => safeSend(conn, msg));
  });

  awareness.on(
    'update',
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changed = [...added, ...updated, ...removed];
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      const msg = encoding.toUint8Array(enc);
      room!.conns.forEach((_, conn) => safeSend(conn, msg));
    },
  );

  return room;
}

function safeSend(conn: WebSocket, msg: Uint8Array) {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(msg, { binary: true });
  }
}

function closeConn(room: Room, conn: WebSocket) {
  const ids = room.conns.get(conn);
  room.conns.delete(conn);
  if (ids && ids.size > 0) {
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(ids), null);
  }
}

function setupWSConnection(conn: WebSocket, req: IncomingMessage) {
  conn.binaryType = 'arraybuffer';

  const pathname = new URL(req.url ?? '/', `http://localhost`).pathname;
  const roomName = decodeURIComponent(pathname.slice(1)) || 'default';
  const room = getOrCreateRoom(roomName);
  room.conns.set(conn, new Set());

  // Sync step 1: send state vector so client can send missing updates
  const syncEnc = encoding.createEncoder();
  encoding.writeVarUint(syncEnc, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEnc, room.ydoc);
  safeSend(conn, encoding.toUint8Array(syncEnc));

  // Send current awareness states
  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awEnc = encoding.createEncoder();
    encoding.writeVarUint(awEnc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awEnc,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(awarenessStates.keys())),
    );
    safeSend(conn, encoding.toUint8Array(awEnc));
  }

  conn.on('message', (raw: RawData) => {
    try {
      const data = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw as Buffer);
      const dec = decoding.createDecoder(data);
      const msgType = decoding.readVarUint(dec);

      if (msgType === MESSAGE_SYNC) {
        const replyEnc = encoding.createEncoder();
        encoding.writeVarUint(replyEnc, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(dec, replyEnc, room.ydoc, conn);
        // Send back if encoder has data (e.g. sync step 2 in response to step 1)
        if (encoding.length(replyEnc) > 1) {
          safeSend(conn, encoding.toUint8Array(replyEnc));
        }
      } else if (msgType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(dec);
        // Track which awareness client IDs belong to this connection
        const idDec = decoding.createDecoder(update);
        const len = decoding.readVarUint(idDec);
        const ids = room.conns.get(conn)!;
        for (let i = 0; i < len; i++) {
          ids.add(decoding.readVarUint(idDec));
          decoding.readVarString(idDec); // skip state JSON string
        }
        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, conn);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  conn.on('close', () => closeConn(room, conn));
  conn.on('error', () => closeConn(room, conn));
}

export { setupWSConnection, rooms };

// Only start the server when run directly (not when imported by tests)
if (process.env.YWS_START === '1') {
  const port = parseInt(process.env.YWS_PORT ?? '4001');
  const server = createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', setupWSConnection);

  server.listen(port, () => {
    console.log(`[yws] Yjs WebSocket server running on ws://localhost:${port}`);
  });
}
