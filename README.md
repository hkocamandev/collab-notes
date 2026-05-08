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
