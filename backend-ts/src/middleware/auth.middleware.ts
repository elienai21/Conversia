import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { prisma, auth } = request.server.deps;
  const authHeader = request.headers.authorization;
  const queryToken = (request.query as Record<string, string>)?.token;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : queryToken;

  if (!token) {
    return reply.status(401).send({ detail: "Missing or invalid token" });
  }

  try {
    const payload = auth.decodeAccessToken(token);

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
