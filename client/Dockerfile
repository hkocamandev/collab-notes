# syntax=docker/dockerfile:1
# Client image — Node builder stage runs `vite build`, nginx alpine serves
# the resulting static SPA bundle and reverse-proxies /api to the server.
# yws is reached directly on its own port (no proxy needed for WebSocket).
#
# Build context is the repo root for workspace lockfile access.

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
RUN npm ci --workspace=client --include-workspace-root

COPY client/ client/
WORKDIR /repo/client
RUN npm run build

# ── Runtime: nginx static + reverse proxy ────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Replace the default nginx site with our SPA + proxy config.
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Built static assets.
COPY --from=builder /repo/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
