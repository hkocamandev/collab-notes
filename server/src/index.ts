import http from 'node:http';
import { WebSocketServer } from 'ws';
import { env } from './env.js';
import { createApp } from './app.js';
import { setupWSConnection, authorizeConnection } from './yws.js';

const app = createApp();
const server = http.createServer(app);

// Yjs WebSocket on the same HTTP server, mounted at /yws/<room>. The library
// appends `/${room}` to the configured URL, so clients connect to
// wss://host/yws/<room>; we strip the /yws prefix before handing off to
// setupWSConnection so the in-memory room key stays the same as the
// standalone yws.ts process used by docker-compose.
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = req.url ?? '/';
  if (!url.startsWith('/yws/')) {
    socket.destroy();
    return;
  }
  req.url = url.slice('/yws'.length) || '/';
  // Authorize (valid JWT + access to this document) before joining a room.
  // The token rides in the `?token=` query param since browser WebSocket
  // handshakes can't set an Authorization header.
  authorizeConnection(req)
    .then(userId => {
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit('connection', ws, req);
      });
    })
    .catch(() => socket.destroy());
});

wss.on('connection', setupWSConnection);

server.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
  console.log(`[server] Yjs WebSocket mounted at ws://localhost:${env.PORT}/yws`);
});
