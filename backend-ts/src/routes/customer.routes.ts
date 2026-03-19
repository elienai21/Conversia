import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // GET / — List customers with aggregates
  app.get("/", async (request) => {
    const tenantId = request.user.tenantId;
    const query = request.query as Record<string, string>;
    const search = query.search?.trim().toLowerCase();
    const filter = query.filter; // "active" | "resolved" | undefined (all)

    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        conversations: {
          select: {
            id: true,
            status: true,
            channel: true,
            detectedLanguage: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = customers
      .map((c) => {
        const activeConvs = c.conversations.filter(
          (cv) => cv.status !== "closed",
        );
        const lastConversation = c.conversations[0] || null;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          social_media: c.socialMedia,
          tag: c.tag,
          profile_picture_url: c.profilePictureUrl,
          created_at: c.createdAt,
          conversation_count: c.conversations.length,
          active_conversations: activeConvs.length,
          last_contact: lastConversation?.updatedAt || c.updatedAt,
          last_channel: lastConversation?.channel || null,
          detected_language: lastConversation?.detectedLanguage || null,
          status: activeConvs.length > 0 ? "active" : "resolved",
        };
      })
      .filter((c) => {
        if (!filter || filter === "all") return true;
        return c.status === filter;
      });

    return result;
  });

  // POST / — Create a new customer manually
  app.post("/", async (request, reply) => {
    const tenantId = request.user.tenantId;
    const body = request.body as {
      phone?: string;
      name?: string;
      email?: string;
      social_media?: string;
      tag?: string;
    };

    const phone = body.phone?.trim();
    if (!phone) {
      return reply.status(422).send({ detail: "Phone number is required" });
    }

    // Check for duplicate
    const existing = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (existing) {
      return reply.status(409).send({ detail: "Customer with this phone already exists" });
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        phone,
        name: body.name?.trim() || null,
        email: body.email?.trim() || null,
        socialMedia: body.social_media?.trim() || null,
        tag: body.tag?.trim() || null,
      },
    });

    return reply.status(201).send({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      social_media: customer.socialMedia,
      tag: customer.tag,
      created_at: customer.createdAt,
    });
  });

  // PATCH /:customerId — Update a customer
  app.patch<{ Params: { customerId: string } }>(
    "/:customerId",
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { customerId } = request.params;
      const body = request.body as {
        name?: string;
        phone?: string;
        email?: string | null;
        social_media?: string | null;
        tag?: string | null;
      };

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (!customer) {
        return reply.status(404).send({ detail: "Customer not found" });
      }

      // If phone is changing, check for duplicates
      const newPhone = body.phone?.trim();
      if (newPhone && newPhone !== customer.phone) {
        const existing = await prisma.customer.findUnique({
          where: { tenantId_phone: { tenantId, phone: newPhone } },
        });
        if (existing) {
          return reply.status(409).send({ detail: "Another customer with this phone already exists" });
        }
      }

      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(body.name !== undefined && { name: body.name?.trim() || null }),
          ...(newPhone && { phone: newPhone }),
          ...(body.email !== undefined && { email: body.email?.trim() || null }),
          ...(body.social_media !== undefined && { socialMedia: body.social_media?.trim() || null }),
          ...(body.tag !== undefined && { tag: body.tag?.trim() || null }),
        },
      });

      return reply.send({
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        social_media: updated.socialMedia,
        tag: updated.tag,
        created_at: updated.createdAt,
      });
    },
  );

  // DELETE /:customerId — Delete a customer
  app.delete<{ Params: { customerId: string } }>(
    "/:customerId",
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { customerId } = request.params;

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (!customer) {
        return reply.status(404).send({ detail: "Customer not found" });
      }

      // Delete related conversations and their messages first
      const conversations = await prisma.conversation.findMany({
        where: { customerId },
        select: { id: true },
      });

      const conversationIds = conversations.map((c) => c.id);

      if (conversationIds.length > 0) {
        // Delete in order: translations -> suggestions -> attachments -> messages -> conversation reads -> conversations
        await prisma.messageTranslation.deleteMany({
          where: { message: { conversationId: { in: conversationIds } } },
        });
        await prisma.aISuggestion.deleteMany({
          where: { message: { conversationId: { in: conversationIds } } },
        });
        await prisma.messageAttachment.deleteMany({
          where: { message: { conversationId: { in: conversationIds } } },
        });
        await prisma.message.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        await prisma.conversationRead.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        await prisma.conversation.deleteMany({
          where: { id: { in: conversationIds } },
        });
      }

      await prisma.customer.delete({ where: { id: customerId } });

      return reply.status(204).send();
    },
  );

  // GET /:customerId — Single customer with conversation history
  app.get<{ Params: { customerId: string } }>(
    "/:customerId",
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { customerId } = request.params;

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        include: {
          conversations: {
            include: {
              messages: {
                select: {
                  id: true,
                  senderType: true,
                  originalText: true,
                  createdAt: true,
                },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
              assignedAgent: {
                select: { fullName: true },
              },
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      });

      if (!customer) {
        return reply.status(404).send({ detail: "Customer not found" });
      }

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        social_media: customer.socialMedia,
        tag: customer.tag,
        profile_picture_url: customer.profilePictureUrl,
        created_at: customer.createdAt,
        conversations: customer.conversations.map((cv) => ({
          id: cv.id,
          channel: cv.channel,
          status: cv.status,
          detected_language: cv.detectedLanguage,
          assigned_agent: cv.assignedAgent?.fullName || null,
          created_at: cv.createdAt,
          updated_at: cv.updatedAt,
          last_message: cv.messages[0]
            ? {
                sender_type: cv.messages[0].senderType,
                text:
                  cv.messages[0].originalText.length > 80
                    ? cv.messages[0].originalText.slice(0, 80) + "..."
                    : cv.messages[0].originalText,
                created_at: cv.messages[0].createdAt,
              }
            : null,
        })),
      };
    },
  );
}
