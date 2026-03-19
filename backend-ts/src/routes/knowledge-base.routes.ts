import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";
import { createKBEntrySchema, updateKBEntrySchema } from "../schemas/knowledge-base.schema.js";
import { generateEmbedding } from "../services/embedding.service.js";

export async function knowledgeBaseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);
  app.addHook("onRequest", requireAdmin);

  // GET /me/knowledge-base — list all entries
  app.get("/me/knowledge-base", async (request) => {
    const entries = await prisma.knowledgeBase.findMany({
      where: { tenantId: request.user.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      category: e.category,
      is_active: e.isActive,
      created_at: e.createdAt.toISOString(),
      updated_at: e.updatedAt.toISOString(),
    }));
  });

  // POST /me/knowledge-base — create entry
  app.post("/me/knowledge-base", async (request, reply) => {
    const parsed = createKBEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const entry = await prisma.knowledgeBase.create({
      data: {
        tenantId: request.user.tenantId,
        title: parsed.data.title,
        content: parsed.data.content,
        category: parsed.data.category,
        isActive: parsed.data.is_active,
      },
    });

    // Compute embedding asynchronously and inject via raw SQL
    generateEmbedding(request.user.tenantId, `${parsed.data.title} ${parsed.data.content}`)
      .then(async (vector) => {
        if (vector) {
          const vectorStr = `[${vector.join(",")}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE knowledge_base SET embedding = '${vectorStr}'::vector WHERE id = '${entry.id}'`
          );
        }
      })
      .catch((err) => console.error("Error generating KB embedding:", err));

    return reply.status(201).send({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      is_active: entry.isActive,
      created_at: entry.createdAt.toISOString(),
      updated_at: entry.updatedAt.toISOString(),
    });
  });

  // PATCH /me/knowledge-base/:id — update entry
  app.patch<{ Params: { id: string } }>("/me/knowledge-base/:id", async (request, reply) => {
    const { id } = request.params;
    const parsed = updateKBEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const existing = await prisma.knowledgeBase.findFirst({
      where: { id, tenantId: request.user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ detail: "Entry not found" });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.content !== undefined) data.content = parsed.data.content;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.is_active !== undefined) data.isActive = parsed.data.is_active;

    const updated = await prisma.knowledgeBase.update({
      where: { id },
      data,
    });

    if (parsed.data.title !== undefined || parsed.data.content !== undefined) {
      generateEmbedding(request.user.tenantId, `${updated.title} ${updated.content}`)
        .then(async (vector) => {
          if (vector) {
            const vectorStr = `[${vector.join(",")}]`;
            await prisma.$executeRawUnsafe(
              `UPDATE knowledge_base SET embedding = '${vectorStr}'::vector WHERE id = '${updated.id}'`
            );
          }
        })
        .catch((err) => console.error("Error updating KB embedding:", err));
    }

    return {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      category: updated.category,
      is_active: updated.isActive,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    };
  });

  // DELETE /me/knowledge-base/:id — delete entry
  app.delete<{ Params: { id: string } }>("/me/knowledge-base/:id", async (request, reply) => {
    const { id } = request.params;

    const existing = await prisma.knowledgeBase.findFirst({
      where: { id, tenantId: request.user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ detail: "Entry not found" });
    }

    await prisma.knowledgeBase.delete({ where: { id } });
    return reply.status(204).send();
  });
}
