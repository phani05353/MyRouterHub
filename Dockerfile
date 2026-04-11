# ─── Stage 1: Build the React frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build
# Output: /build/frontend/dist

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:20-alpine

# Install build tools needed by better-sqlite3 (native addon)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install backend production dependencies first (layer cache)
COPY backend/package.json ./
RUN npm install --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy built frontend into ./public so Express can serve it
COPY --from=frontend-builder /build/frontend/dist ./public

# Persistent data directory — mount a volume here
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

# Graceful shutdown support
STOPSIGNAL SIGTERM

CMD ["node", "src/index.js"]
