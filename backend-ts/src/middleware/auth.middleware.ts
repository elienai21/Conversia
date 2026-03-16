import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { decodeAccessToken } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ detail: "Missing or invalid token" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = decodeAccessToken(token);

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
