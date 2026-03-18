import Fastify from "fastify";
import { authRoutes } from "../../src/routes/auth.routes.js";
import { conversationRoutes } from "../../src/routes/conversation.routes.js";
import { messageRoutes } from "../../src/routes/message.routes.js";
import { attachAppDeps, type AppDeps } from "../../src/app-deps.js";

type UserRecord = {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string | null;
  fullName: string;
  role: string;
  preferredLanguage: string;
  isOnline: boolean;
  isActive: boolean;
};

type CustomerRecord = {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  profilePictureUrl?: string | null;
};

type ConversationRecord = {
  id: string;
  tenantId: string;
  customerId: string;
  assignedAgentId: string | null;
  channel: string;
  status: string;
  detectedLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRecord = {
  id: string;
  conversationId: string;
  senderType: string;
  senderId: string | null;
  originalText: string;
  detectedLanguage: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

type TranslationRecord = {
  id: string;
  messageId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  provider: string;
};

type AttachmentRecord = {
  id: string;
  messageId: string;
  type: string;
  mimeType: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  sourceUrl: string | null;
  providerMediaId: string | null;
};

type SuggestionRecord = {
  id: string;
  agentId: string;
  wasUsed: boolean;
  finalText: string | null;
};

type ReadRecord = {
  userId: string;
  conversationId: string;
  lastReadAt: Date;
};

type Store = {
  users: UserRecord[];
  customers: CustomerRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  translations: TranslationRecord[];
  attachments: AttachmentRecord[];
  reads: ReadRecord[];
  suggestions: SuggestionRecord[];
};

type TestAppOverrides = {
  users?: UserRecord[];
};

function matchesWhere<T extends Record<string, unknown>>(record: T, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "not" in (value as Record<string, unknown>)) {
      return record[key] !== (value as { not: unknown }).not;
    }

    return record[key] === value;
  });
}

function createStore(): Store {
  return {
    users: [
      {
        id: "agent-a",
        tenantId: "tenant-a",
        email: "agent@tenant-a.test",
        passwordHash: "hashed-secret123",
        fullName: "Agent A",
        role: "agent",
        preferredLanguage: "en",
        isOnline: true,
        isActive: true,
      },
      {
        id: "admin-a",
        tenantId: "tenant-a",
        email: "admin@tenant-a.test",
        passwordHash: "hashed-secret123",
        fullName: "Admin A",
        role: "admin",
        preferredLanguage: "en",
        isOnline: true,
        isActive: true,
      },
      {
        id: "agent-b",
        tenantId: "tenant-b",
        email: "agent@tenant-b.test",
        passwordHash: "hashed-secret123",
        fullName: "Agent B",
        role: "agent",
        preferredLanguage: "pt",
        isOnline: true,
        isActive: true,
      },
    ],
    customers: [
      { id: "11111111-1111-4111-8111-111111111111", tenantId: "tenant-a", phone: "+15550000001", name: "Alice" },
      { id: "11111111-1111-4111-8111-111111111112", tenantId: "tenant-b", phone: "+15550000002", name: "Bruno" },
    ],
    conversations: [
      {
        id: "conv-a-1",
        tenantId: "tenant-a",
        customerId: "11111111-1111-4111-8111-111111111111",
        assignedAgentId: "agent-a",
        channel: "whatsapp",
        status: "active",
        detectedLanguage: "en",
        createdAt: new Date("2026-03-18T10:00:00.000Z"),
        updatedAt: new Date("2026-03-18T10:05:00.000Z"),
      },
      {
        id: "conv-b-1",
        tenantId: "tenant-b",
        customerId: "11111111-1111-4111-8111-111111111112",
        assignedAgentId: "agent-b",
        channel: "whatsapp",
        status: "active",
        detectedLanguage: "pt",
        createdAt: new Date("2026-03-18T11:00:00.000Z"),
        updatedAt: new Date("2026-03-18T11:05:00.000Z"),
      },
    ],
    messages: [
      {
        id: "msg-a-1",
        conversationId: "conv-a-1",
        senderType: "customer",
        senderId: null,
        originalText: "Need help with my stay",
        detectedLanguage: "en",
        createdAt: new Date("2026-03-18T10:01:00.000Z"),
        deletedAt: null,
      },
      {
        id: "msg-a-2",
        conversationId: "conv-a-1",
        senderType: "agent",
        senderId: "agent-a",
        originalText: "Sure, what do you need?",
        detectedLanguage: "en",
        createdAt: new Date("2026-03-18T10:02:00.000Z"),
        deletedAt: null,
      },
      {
        id: "msg-b-1",
        conversationId: "conv-b-1",
        senderType: "customer",
        senderId: null,
        originalText: "Preciso de ajuda",
        detectedLanguage: "pt",
        createdAt: new Date("2026-03-18T11:01:00.000Z"),
        deletedAt: null,
      },
    ],
    attachments: [
      {
        id: "attachment-a-1",
        messageId: "msg-a-1",
        type: "image",
        mimeType: "image/jpeg",
        fileName: "property-front.jpg",
        fileSizeBytes: 245678,
        sourceUrl: "https://files.example.com/property-front.jpg",
        providerMediaId: "provider-image-1",
      },
    ],
    translations: [],
    reads: [],
    suggestions: [],
  };
}

function createTestDeps(store: Store): AppDeps {
  const prisma = {
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        store.users.find((user) => matchesWhere(user, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        store.users.filter((user) => matchesWhere(user, where)),
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.users.find((user) => user.id === where.id) ?? null,
    },
    customer: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        store.customers.find((customer) => matchesWhere(customer, where)) ?? null,
    },
    conversation: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        store.conversations
          .filter((conversation) => matchesWhere(conversation, where))
          .map((conversation) => ({
            ...conversation,
            customer: store.customers.find((customer) => customer.id === conversation.customerId) ?? null,
            messages: store.messages
              .filter((message) => message.conversationId === conversation.id && message.deletedAt === null)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, 1)
              .map((message) => ({ originalText: message.originalText })),
          })),
      findFirst: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, boolean> }) => {
        const conversation = store.conversations.find((item) => matchesWhere(item, where));
        if (!conversation) {
          return null;
        }

        return {
          ...conversation,
          customer: include?.customer
            ? store.customers.find((customer) => customer.id === conversation.customerId) ?? null
            : undefined,
        };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.conversations.find((conversation) => conversation.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const conversation = store.conversations.find((item) => item.id === where.id);
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        Object.assign(conversation, data, { updatedAt: new Date("2026-03-18T12:00:00.000Z") });
        return conversation;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const conversation: ConversationRecord = {
          id: `conv-created-${store.conversations.length + 1}`,
          tenantId: String(data.tenantId),
          customerId: String(data.customerId),
          assignedAgentId: null,
          channel: String(data.channel),
          status: String(data.status),
          detectedLanguage: null,
          createdAt: new Date("2026-03-18T12:00:00.000Z"),
          updatedAt: new Date("2026-03-18T12:00:00.000Z"),
        };
        store.conversations.push(conversation);
        return conversation;
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        store.conversations.filter((conversation) => matchesWhere(conversation, where)).length,
    },
    message: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        store.messages.find((message) => matchesWhere(message, where)) ?? null,
      findMany: async ({ where, include, orderBy, take }: { where: Record<string, unknown>; include?: Record<string, boolean>; orderBy?: Record<string, "asc" | "desc">; take?: number }) => {
        let messages = store.messages.filter((message) => matchesWhere(message, where));

        if (orderBy?.createdAt === "asc") {
          messages = messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (orderBy?.createdAt === "desc") {
          messages = messages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof take === "number") {
          messages = messages.slice(0, take);
        }

        return messages.map((message) => ({
          ...message,
          attachments: include?.attachments
            ? store.attachments.filter((attachment) => attachment.messageId === message.id)
            : [],
          translations: include?.translations
            ? store.translations.filter((translation) => translation.messageId === message.id)
            : [],
        }));
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const message: MessageRecord = {
          id: `msg-created-${store.messages.length + 1}`,
          conversationId: String(data.conversationId),
          senderType: String(data.senderType),
          senderId: data.senderId ? String(data.senderId) : null,
          originalText: String(data.originalText),
          detectedLanguage: data.detectedLanguage ? String(data.detectedLanguage) : null,
          createdAt: new Date("2026-03-18T12:01:00.000Z"),
          deletedAt: null,
        };
        store.messages.push(message);
        return message;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const message = store.messages.find((item) => item.id === where.id);
        if (!message) {
          throw new Error("Message not found");
        }

        Object.assign(message, data);
        return message;
      },
    },
    messageTranslation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const translation: TranslationRecord = {
          id: `translation-${store.translations.length + 1}`,
          messageId: String(data.messageId),
          sourceLanguage: String(data.sourceLanguage),
          targetLanguage: String(data.targetLanguage),
          translatedText: String(data.translatedText),
          provider: String(data.provider),
        };
        store.translations.push(translation);
        return translation;
      },
    },
    messageAttachment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const attachment: AttachmentRecord = {
          id: `attachment-${store.attachments.length + 1}`,
          messageId: String(data.messageId),
          type: String(data.type),
          mimeType: data.mimeType ? String(data.mimeType) : null,
          fileName: data.fileName ? String(data.fileName) : null,
          fileSizeBytes: typeof data.fileSizeBytes === "number" ? data.fileSizeBytes : null,
          sourceUrl: data.sourceUrl ? String(data.sourceUrl) : null,
          providerMediaId: data.providerMediaId ? String(data.providerMediaId) : null,
        };
        store.attachments.push(attachment);
        return attachment;
      },
    },
    conversationRead: {
      upsert: async ({ create, update, where }: { create: ReadRecord; update: Partial<ReadRecord>; where: { userId_conversationId: { userId: string; conversationId: string } } }) => {
        const existing = store.reads.find((item) =>
          item.userId === where.userId_conversationId.userId && item.conversationId === where.userId_conversationId.conversationId,
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        store.reads.push(create);
        return create;
      },
    },
    tenantSettings: {
      findUnique: async () => null,
    },
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    },
    aISuggestion: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = store.suggestions.filter((suggestion) => matchesWhere(suggestion as Record<string, unknown>, where));
        for (const suggestion of matches) {
          Object.assign(suggestion, data);
        }
        return { count: matches.length };
      },
    },
    $queryRawUnsafe: async (_query: string, _userId: string, conversationIds: string[]) =>
      conversationIds.map((conversationId) => ({
        conversation_id: conversationId,
        count: BigInt(store.messages.filter((message) => message.conversationId === conversationId && message.senderType === "customer").length),
      })),
  } as unknown as AppDeps["prisma"];

  return {
    prisma,
    auth: {
      verifyPassword: async (password, hash) => hash === `hashed-${password}`,
      createAccessToken: (userId) => `${userId}-generated-token`,
      decodeAccessToken: (token) => {
        const mapping: Record<string, { sub: string; tenant_id: string }> = {
          "agent-a-token": { sub: "agent-a", tenant_id: "tenant-a" },
          "admin-a-token": { sub: "admin-a", tenant_id: "tenant-a" },
          "agent-b-token": { sub: "agent-b", tenant_id: "tenant-b" },
        };

        const payload = mapping[token];
        if (!payload) {
          throw new Error("Invalid token");
        }

        return payload;
      },
    },
    services: {
      findOrCreateConversation: async (tenantId, customerId, channel) => {
        const existing = store.conversations.find((conversation) =>
          conversation.tenantId === tenantId && conversation.customerId === customerId && conversation.channel === channel,
        );

        if (existing) {
          return { conversation: existing, isNew: false };
        }

        const conversation = await prisma.conversation.create({
          data: { tenantId, customerId, channel, status: "queued" },
        });
        return { conversation, isNew: true };
      },
      updateConversationStatus: async (conversationId, tenantId, status) => {
        const conversation = store.conversations.find((item) => item.id === conversationId && item.tenantId === tenantId);
        if (!conversation) {
          return {
            ok: false as const,
            error: { statusCode: 404, message: "Conversation not found" },
          };
        }

        conversation.status = status;
        conversation.updatedAt = new Date("2026-03-18T12:00:00.000Z");

        return { ok: true as const, value: conversation };
      },
      assignConversationToAgent: async (conversationId, agentId) => {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { assignedAgentId: agentId, status: "active" },
        });
      },
      saveMessage: async (params) =>
        prisma.message.create({
          data: {
            conversationId: params.conversationId,
            senderType: params.senderType,
            senderId: params.senderId ?? null,
            originalText: params.text,
            detectedLanguage: params.detectedLanguage ?? null,
          },
        }),
      getConversationMessages: async (conversationId) =>
        prisma.message.findMany({
          where: { conversationId, deletedAt: null },
          include: { translations: true, attachments: true },
          orderBy: { createdAt: "asc" },
        }),
      saveTranslation: async (params) =>
        prisma.messageTranslation.create({
          data: params,
        }),
      translateText: async (_tenantId, text, _source, target) => ({
        translatedText: `${text} (${target})`,
        provider: "test-provider",
      }),
      sendWhatsappMessage: async () => undefined,
      sendInstagramMessage: async () => undefined,
      decrypt: (value) => value,
    },
    socket: {
      emitToTenant: () => undefined,
      emitToConversation: () => undefined,
    },
  };
}

export async function createCriticalRoutesTestApp(overrides: TestAppOverrides = {}) {
  const app = Fastify();
  attachAppDeps(app, createTestDeps({
    ...createStore(),
    ...overrides,
  }));
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  await app.register(messageRoutes, { prefix: "/api/v1/conversations" });
  return app;
}
