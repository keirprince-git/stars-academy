# ── Build stage ────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built app and dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/lib ./lib

# The database lives on a persistent Railway volume.
# Set DATABASE_PATH env var in Railway to /data/stars_academy.db
# and attach a volume mounted at /data.

EXPOSE ${PORT:-3000}

CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
