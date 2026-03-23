import pino from "pino";

/**
 * Shared structured logger (Pino) for services and workers that don't have
 * access to the Fastify request context. Outputs JSON in production (Railway)
 * which is parseable by log aggregators.
 *
 * In route handlers prefer `request.log` (per-request context with req id).
 * In server startup prefer `app.log` (same Pino instance Fastify creates).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
