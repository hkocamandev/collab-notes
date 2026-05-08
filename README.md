# Collab Notes

Real-time collaborative note-taking application — a Notion-inspired editor
built with React on the client and Node.js on the server.

## Stack

- **Client**: React 18, Vite, TypeScript, React Router, Tiptap (block editor),
  Yjs + y-websocket
- **Server**: Express, TypeScript, Prisma + SQLite, JWT auth, custom Yjs
  WebSocket server, transformers.js (local embeddings),
  `@modelcontextprotocol/sdk`
- **Workspace**: npm workspaces monorepo (`client/` + `server/`)
- **Containers**: Docker + docker-compose (api / yws / nginx-served client)

In development the client proxies `/api/*` to the server, so API calls come
from the same origin in the browser. The Yjs WebSocket server listens on its
own port.

## Project layout

```
collab-notes/
├── client/   # Vite + React app (port 5173)
└── server/   # Express API (port 4000) + Yjs WS server (port 4001)
```

## Requirements

- Node.js 20+
- npm 10+
- Docker (optional, for the containerised stack)

## Getting started

Install dependencies once at the repo root:

```bash
npm install
```

Run the full dev stack (client + API + yws together):

```bash
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:4000>
- Yjs WebSocket: <ws://localhost:4001>

### Run individually

```bash
npm run dev:server    # API on :4000
npm run dev:yws       # Yjs WebSocket on :4001
npm run dev:client    # Vite dev server on :5173
```

### Production build

```bash
npm run build
```

### Tests

```bash
npm run test          # server + client (244 tests)
npm run typecheck     # both workspaces
```

## Run with Docker

The full stack ships as three containers behind `docker compose`:

| Service | Image source        | Port (host:container) | Purpose                          |
| ------- | ------------------- | --------------------- | -------------------------------- |
| api     | `server/Dockerfile` | `4000:4000`           | Express REST API + Prisma migrate |
| yws     | `server/Dockerfile` | `4001:4001`           | Yjs WebSocket sync server        |
| client  | `client/Dockerfile` | `5173:80`             | nginx serving the built SPA      |

**One-time setup**

```bash
cp .env.example .env
# edit .env and set JWT_SECRET (use: openssl rand -base64 48)
```

**Start the stack**

```bash
docker compose up --build
```

Then open <http://localhost:5173>. nginx reverse-proxies `/api/*` to the
`api` container; the client connects to `ws://localhost:4001` for real-time
sync.

**Data persistence**

The SQLite database lives in the named volume `api_data` mounted at
`/data` inside the api container. `docker compose down` keeps the volume;
`docker compose down -v` wipes it.

**Migrations**

`prisma migrate deploy` runs automatically on every `api` container
startup — idempotent, so it's a no-op when the DB is already current.

## API endpoints

All endpoints are JSON. Auth-required ones expect
`Authorization: Bearer <token>`.

### Auth — `server/src/auth/routes.ts`

| Method | Path                  | Auth | Notes                                                                |
| ------ | --------------------- | ---- | -------------------------------------------------------------------- |
| POST   | `/api/auth/register`  | —    | Body: `{ email, password, name? }` → `{ token, user }`               |
| POST   | `/api/auth/login`     | —    | Body: `{ email, password }` → `{ token, user }`                      |
| GET    | `/api/auth/me`        | ✓    | Current user (includes `plan`)                                       |
| POST   | `/api/auth/upgrade`   | ✓    | Switch the caller's plan to `premium`; returns refreshed user        |

### Documents — `server/src/documents/routes.ts`

| Method | Path                                       | Auth | Notes                                                          |
| ------ | ------------------------------------------ | ---- | -------------------------------------------------------------- |
| GET    | `/api/documents`                           | ✓    | Owned + shared (active), each with `permission`                |
| GET    | `/api/documents/trash`                     | ✓    | Owner-only soft-deleted list                                   |
| POST   | `/api/documents`                           | ✓    | Create — basic plan capped at 5 active owned docs              |
| POST   | `/api/documents/snapshot-mine`             | ✓    | Logout-time version snapshot                                   |
| GET    | `/api/documents/:id`                       | ✓    | Owner OR shared editor                                         |
| PATCH  | `/api/documents/:id`                       | ✓    | Update title / content (owner OR editor)                       |
| GET    | `/api/documents/:id/versions`              | ✓    | Read-only version history                                      |
| DELETE | `/api/documents/:id`                       | ✓    | Soft delete (owner-only); returns `{ affectedUserIds }`        |
| DELETE | `/api/documents/:id/permanent`             | ✓    | Permanent delete (owner-only)                                  |
| PATCH  | `/api/documents/:id/restore`               | ✓    | Restore from trash (owner-only)                                |
| GET    | `/api/documents/:id/shares`                | ✓    | List shares (owner-only)                                       |
| POST   | `/api/documents/:id/share`                 | ✓    | Body: `{ email }` — basic plan capped at 1 share per doc       |
| DELETE | `/api/documents/:id/share/:userId`         | ✓    | Revoke (owner-only)                                            |

### AI — `server/src/ai/router.ts`

| Method | Path           | Auth | Notes                                                                   |
| ------ | -------------- | ---- | ----------------------------------------------------------------------- |
| POST   | `/api/ai/ask`  | ✓    | Body: `{ query, limit? }` → `{ results: [{id, title, similarity}] }`    |

### Misc

| Method | Path           | Auth | Notes                              |
| ------ | -------------- | ---- | ---------------------------------- |
| GET    | `/api/health`  | —    | `{ status: "ok" }`                 |
| GET    | `/api/ping`    | —    | `{ message: "pong", time }`        |

## Real-time channels

- **Yjs WebSocket** (`ws://localhost:4001`) — per-document rooms named
  `doc-<id>`. Carries CRDT updates (title + content) and awareness
  (presence, revoke signals).
- **BroadcastChannel** (`collab-notes-doc-events`) — same-browser cross-tab
  sidebar/event sync (created / soft-deleted / restored / permanent-deleted /
  share-added / share-revoked / shared-doc-* / etc.). Filtered by
  `forUserId`.

## Documentation

- `documentation.txt` — feature-by-feature walkthrough, architecture diagram,
  test coverage, design notes.
- `future_improvements.txt` — explicit roadmap of known gaps and scaling
  considerations.
