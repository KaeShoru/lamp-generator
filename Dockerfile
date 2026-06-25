# ════════════════════════════════════════════════════════════════════
#  Lamp Generator — multi-stage Dockerfile
#
#  Stages:
#    1. build-deps   — install root deps + backend deps
#    2. build        — build frontend (with obfuscation)
#    3. runtime      — Node 22 alpine, copy backend + dist, run server
# ════════════════════════════════════════════════════════════════════

# ─── Stage 1: install dependencies ──────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Copy root manifests first for better layer caching
COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/

# Install root deps (dev too — we need javascript-obfuscator)
RUN npm ci --no-audit --no-fund

# Install backend deps (production only)
RUN cd server && npm ci --omit=dev --no-audit --no-fund


# ─── Stage 2: build frontend ────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy root package.json (needed to resolve npm run scripts)
COPY package.json package-lock.json* ./

# Copy source
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY server/ ./server/

# Build the frontend (TypeScript compile + Vite bundle).
# NOTE: Obfuscation (build:obfuscated) is disabled in production because
# javascript-obfuscator on a 1.3 MB bundle produces ~8 MB output that
# freezes/breaks the browser (especially Worker context). The author's
# own comment in scripts/obfuscate.mjs confirms it's "NOT a security
# boundary" — real secrets stay on the backend.
RUN npm run build


# ─── Stage 3: runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Add a non-root user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy backend code and its node_modules
COPY --from=build /app/server ./server
# Copy built frontend
COPY --from=build /app/dist ./dist

# Make sure uploads/tmp dirs exist (if you ever switch to disk storage)
RUN mkdir -p /app/uploads /app/tmp && chown -R app:app /app

USER app

# Railway provides PORT via env; backend reads process.env.PORT
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Simple healthcheck — curl /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# Run the backend (it serves the frontend from /app/dist)
CMD ["node", "server/index.js"]