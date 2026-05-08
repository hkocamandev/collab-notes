# Collab Notes

Real-time collaborative note-taking application — a Notion-inspired editor built
with React on the client and Node.js on the server.

## Stack

- **Client** — Vite + React + TypeScript
- **Server** — Node.js + Express + TypeScript
- **Workspace** — npm workspaces monorepo

Real-time sync (Yjs/CRDT), authentication, the block editor, and persistence
land in subsequent `dev/N-*` branches.

## Project layout

```
collab-notes/
├── client/   # Vite + React app (port 5173)
└── server/   # Express API (port 4000)
```

In development the client proxies `/api/*` to the server, so requests come from
the same origin in the browser.

## Requirements

- Node.js 20+
- npm 10+

## Getting started

Install dependencies once at the repo root:

```bash
npm install
```

Run client and server together:

```bash
npm run dev
```

- Client: <http://localhost:5173>
- Server: <http://localhost:4000>

The skeleton page exposes a "Ping server" button that calls `GET /api/ping`
through the Vite proxy and renders the response.

### Run individually

```bash
npm run dev:server
npm run dev:client
```

### Production build

```bash
npm run build
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

## Roadmap

| Branch                | Scope                                                      |
| --------------------- | ---------------------------------------------------------- |
| `dev/1-skeleton`      | Monorepo, client/server hello-world, ping endpoint         |
| `dev/2-auth`          | JWT auth, register/login, per-user workspace isolation     |
| `dev/3-documents`     | Document CRUD, sidebar, soft delete + restore              |
| `dev/4-editor`        | Block-based rich text editor, slash commands, auto-save    |
| `dev/5-realtime`      | Yjs + WebSocket sync, presence indicators                  |
| `dev/6-versioning`    | Version history, view & restore                            |
| `dev/7-docker`        | Dockerfiles + docker-compose                               |
| `dev/8-bonus`         | Sharing links, offline queue, activity feed (time-permitting) |
