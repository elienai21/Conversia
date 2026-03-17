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
RUN npm install --omit=dev

# Copy prisma schema and generate client (needed at runtime)
COPY prisma ./prisma
RUN npx prisma generate

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway sets PORT env var)
EXPOSE 8000

# Start the server (migrations are run manually or via CI)
CMD ["node", "dist/server.js"]
