// src/routes/audit.routes.ts
// Paginated audit log viewer — admin only.
// GET /audit-logs?page=1&limit=50&action=user.login&userId=...&from=ISO&to=ISO

import type { FastifyInstance } from "fastify";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /audit-logs ───────────────────────────────────────────────────────
  app.get(
    "/",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const { prisma } = request.server.deps;

      const query = request.query as {
        page?: string;
        limit?: string;
        action?: string;
        userId?: string;
        from?: string;
        to?: string;
      };

      const page  = Math.max(1, parseInt(query.page  ?? "1",  10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "50", 10)));
      const skip  = (page - 1) * limit;

      const where: any = {
        tenantId: request.user.tenantId,
      };

      if (query.action)  where.action  = { contains: query.action };
      if (query.userId)  where.userId  = query.userId;
      if (query.from || query.to) {
        where.createdAt = {};
        if (query.from) where.createdAt.gte = new Date(query.from);
        if (query.to)   where.createdAt.lte = new Date(query.to);
      }

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id:         true,
            action:     true,
            entityType: true,
            entityId:   true,
            metadata:   true,
            ipAddress:  true,
            userAgent:  true,
            createdAt:  true,
            userId:     true,
          },
        }),
      ]);

      return reply.send({
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        logs,
      });
    },
  );
}
