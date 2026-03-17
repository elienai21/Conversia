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
