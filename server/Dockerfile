# syntax=docker/dockerfile:1
# Server image — used for both the REST API (default CMD) and the Yjs
# WebSocket server (compose overrides the command).
#
# Build context is the repo root because we share the workspace lockfile
# with the client. See docker-compose.yml for the build.context setting.

FROM node:20-slim AS builder
WORKDIR /repo

# Prisma's query engine is dynamically linked against libssl. Slim images
# don't ship it, which makes Prisma guess at the OpenSSL version and emit
# a warning. Installing openssl explicitly lets Prisma pick the right
# engine binary cleanly. Same install in the runtime stage below.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS runtime
WORKDIR /repo

# Same OpenSSL story as the builder stage — needed for the runtime Prisma
# query engine to resolve the right binary.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

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

# Pre-download the all-MiniLM-L6-v2 ONNX model (~22 MB) into the
# transformers.js cache so the first /api/ai/ask request doesn't have to
# hit HuggingFace at runtime. Bakes the model into the image; runtime
# stays fully offline.
RUN node --input-type=module -e "import('@xenova/transformers').then(t => t.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')).then(() => console.log('model cached'))"

EXPOSE 4000

# Apply pending migrations on every start (idempotent), then run the API.
# yws shares this image but overrides command via docker-compose.
CMD ["sh", "-c", "npm run prisma:deploy && node dist/index.js"]
