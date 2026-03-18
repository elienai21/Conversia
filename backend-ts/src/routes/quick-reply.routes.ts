import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const quickReplySchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1),
  shortcut: z.string().max(20).optional(),
});

export async function quickReplyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // List quick replies
  app.get("/", async (request, reply) => {
    const user = request.user;

    const replies = await prisma.quickReply.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { title: "asc" },
    });

    return reply.send(
      replies.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        shortcut: r.shortcut,
        created_at: r.createdAt,
      })),
    );
  });

  // Create quick reply
  app.post("/", async (request, reply) => {
    const user = request.user;
    const parsed = quickReplySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const qr = await prisma.quickReply.create({
      data: {
        tenantId: user.tenantId,
        title: parsed.data.title,
        body: parsed.data.body,
        shortcut: parsed.data.shortcut ?? null,
      },
    });

    return reply.status(201).send({
      id: qr.id,
      title: qr.title,
      body: qr.body,
      shortcut: qr.shortcut,
      created_at: qr.createdAt,
    });
  });

  // Update quick reply
  app.put<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const parsed = quickReplySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input" });
    }

    const existing = await prisma.quickReply.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ detail: "Quick reply not found" });
    }

    const updated = await prisma.quickReply.update({
      where: { id },
      data: {
        title: parsed.data.title,
        body: parsed.data.body,
        shortcut: parsed.data.shortcut ?? null,
      },
    });

    return reply.send({
      id: updated.id,
      title: updated.title,
      body: updated.body,
      shortcut: updated.shortcut,
      created_at: updated.createdAt,
    });
  });

  // Delete quick reply
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const existing = await prisma.quickReply.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ detail: "Quick reply not found" });
    }

    await prisma.quickReply.delete({ where: { id } });
    return reply.status(204).send();
  });
}
