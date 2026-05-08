# syntax=docker/dockerfile:1
# Server image — used for both the REST API (default CMD) and the Yjs
# WebSocket server (compose overrides the command).
#
# Build context is the repo root because we share the workspace lockfile
# with the client. See docker-compose.yml for the build.context setting.

FROM node:20-alpine AS builder
WORKDIR /repo

# Full workspace install (lockfile-based) so we can run prisma + tsc.
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

# Generate Prisma client + compile TypeScript. Going through `npm run`
# (not `npx`) so npm resolves the binary from the local node_modules/.bin
# instead of falling back to the npm registry.
COPY server/ server/
WORKDIR /repo/server
RUN npm run prisma:generate && npm run build

# ── Runtime ──────────────────────────────────────────────────────────────
# Fresh production install in this stage rather than copying node_modules
# from the builder. Multi-stage COPY can mangle symlinks (especially binary
# bin/ links on alpine), and a clean `npm ci --omit=dev` guarantees prisma
# and its engine binaries land where node expects them.
FROM node:20-alpine AS runtime
WORKDIR /repo

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev

# Bring forward only the build outputs + Prisma schema. The Prisma generated
# client lives under node_modules/.prisma — `prisma:generate` re-creates it
# below so it matches whatever schema this image ships with.
COPY --from=builder /repo/server/dist ./server/dist
COPY --from=builder /repo/server/prisma ./server/prisma

WORKDIR /repo/server
RUN npm run prisma:generate

EXPOSE 4000

# Apply pending migrations on every start (idempotent), then run the API.
# yws shares this image but overrides command via docker-compose.
CMD ["sh", "-c", "npm run prisma:deploy && node dist/index.js"]
