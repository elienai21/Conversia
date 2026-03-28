import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";

/**
 * Build the datasource URL with safe connection pool defaults.
 *
 * Priority:
 *   1. PGBOUNCER_URL  — set this when PgBouncer plugin is active on Railway.
 *      Adds pgbouncer=true&connection_limit=1 (required for transaction-mode pooling).
 *   2. DATABASE_URL   — direct Postgres. Limits pool to 2 connections per process
 *      to avoid exhausting max_connections across multiple workers.
 *
 * Scaling guide:
 *   - Small (<50 tenants):  DATABASE_URL + connection_limit=2  (current)
 *   - Medium (<500 tenants): activate PgBouncer plugin on Railway → set PGBOUNCER_URL
 *   - Large (500+ tenants):  upgrade Postgres plan or migrate to Supabase/Neon (built-in pooling)
 */
function buildDatasourceUrl(): string | undefined {
  // Prefer PgBouncer URL if configured (Railway PgBouncer plugin)
  const pgBouncerUrl = process.env.PGBOUNCER_URL;
  if (pgBouncerUrl) {
    try {
      const parsed = new URL(pgBouncerUrl);
      // PgBouncer in transaction mode: 1 connection per Prisma client is correct
      parsed.searchParams.set("pgbouncer", "true");
      parsed.searchParams.set("connection_limit", "1");
      parsed.searchParams.set("pool_timeout", "20");
      return parsed.toString();
    } catch {
      return pgBouncerUrl;
    }
  }

  // Fallback: direct Postgres with limited pool
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
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
