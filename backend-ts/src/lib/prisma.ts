import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";

/**
 * Build a DATABASE_URL with connection pool limits to prevent exhausting
 * PostgreSQL's max_connections on Railway (shared between Fastify + BullMQ workers).
 *
 * connection_limit=5  → max 5 connections per Prisma client instance
 * pool_timeout=20     → wait up to 20s for a free connection before erroring
 */
function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "5");
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "20");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export const prisma = new PrismaClient({
  log: config.DEBUG ? ["query", "info", "warn", "error"] : ["error"],
  datasourceUrl: buildDatasourceUrl(),
});
