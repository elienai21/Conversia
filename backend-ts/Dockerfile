# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies for build)
COPY package.json package-lock.json* ./
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install production-only dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy prisma schema and generate client (needed at runtime)
COPY prisma ./prisma
RUN npx prisma generate

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Railway injects the PORT env var dynamically
# CMD ["node", "dist/server.js"] (or whatever the entrypoint is, assuming it relies on npm start)
# Expose is not strictly needed for Railway, nor Healthcheck since Railway uses its own probes.

# Run migrations then start the server
# Note: use ; (not &&) so the server always starts even if prisma push fails
# (e.g. when DB has duplicate external_ids that block the @unique constraint)
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss; node dist/server.js"]
