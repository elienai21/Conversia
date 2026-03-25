import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@prisma/client";
import { redisClient, isRedisAvailable } from "../lib/redis-client.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

/** Redis key prefix for the JWT revocation blacklist */
export const JWT_BLACKLIST_PREFIX = "jwt:bl:";

/**
 * Adds a JWT to the revocation blacklist.
 * TTL is set to the token's remaining lifetime so Redis auto-expires the entry.
 * @param token  raw JWT string
 * @param expSec Unix timestamp (seconds) when the token expires
 */
export async function revokeToken(token: string, expSec: number): Promise<void> {
  if (!isRedisAvailable()) return; // graceful degradation
  const ttl = Math.max(expSec - Math.floor(Date.now() / 1000), 1);
  await redisClient.set(`${JWT_BLACKLIST_PREFIX}${token}`, "1", "EX", ttl);
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { prisma, auth } = request.server.deps;
  const authHeader = request.headers.authorization;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return reply.status(401).send({ detail: "Missing or invalid token" });
  }

  try {
    const payload = auth.decodeAccessToken(token);

    // Check JWT revocation blacklist (populated on logout or user deactivation)
    if (isRedisAvailable()) {
      const revoked = await redisClient.exists(`${JWT_BLACKLIST_PREFIX}${token}`);
      if (revoked) {
        return reply.status(401).send({ detail: "Token revogado. Faça login novamente." });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({ detail: "User not found or inactive" });
    }

    if (user.tenantId !== payload.tenant_id) {
      return reply.status(401).send({ detail: "Tenant mismatch" });
    }

    request.user = user;
  } catch {
    return reply.status(401).send({ detail: "Invalid or expired token" });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.user.role !== "admin") {
    return reply.status(403).send({ detail: "Admin access required" });
  }
}
