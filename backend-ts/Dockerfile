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

# Start the server directly — prisma db push is NOT run on startup to avoid
# "too many clients" errors during rolling deploys (multiple containers
# connecting simultaneously to the direct Postgres URL exhausts the limit).
# Run `npm run db:deploy` manually via Railway console when schema changes.
CMD ["node", "dist/server.js"]
