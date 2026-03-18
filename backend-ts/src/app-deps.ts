import type { FastifyInstance } from "fastify";
import { prisma } from "./lib/prisma.js";
import {
  createAccessToken,
  decodeAccessToken,
  verifyPassword,
} from "./lib/auth.js";
import { findOrCreateConversation, updateConversationStatus } from "./services/conversation.service.js";
import { assignConversationToAgent } from "./services/assignment.service.js";
import {
  getConversationMessages,
  saveMessage,
  saveTranslation,
} from "./services/message.service.js";
import { translateText } from "./services/translation.service.js";
import { sendWhatsappMessage } from "./services/whatsapp.service.js";
import { sendInstagramMessage } from "./services/instagram.service.js";
import { decrypt } from "./lib/encryption.js";
import { SocketService } from "./services/socket.service.js";

export interface AppDeps {
  prisma: typeof prisma;
  auth: {
    verifyPassword: typeof verifyPassword;
    createAccessToken: typeof createAccessToken;
    decodeAccessToken: typeof decodeAccessToken;
  };
  services: {
    findOrCreateConversation: typeof findOrCreateConversation;
    updateConversationStatus: typeof updateConversationStatus;
    assignConversationToAgent: typeof assignConversationToAgent;
    saveMessage: typeof saveMessage;
    getConversationMessages: typeof getConversationMessages;
    saveTranslation: typeof saveTranslation;
    translateText: typeof translateText;
    sendWhatsappMessage: typeof sendWhatsappMessage;
    sendInstagramMessage: typeof sendInstagramMessage;
    decrypt: typeof decrypt;
  };
  socket: Pick<typeof SocketService, "emitToTenant" | "emitToConversation">;
}

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export const defaultAppDeps: AppDeps = {
  prisma,
  auth: {
    verifyPassword,
    createAccessToken,
    decodeAccessToken,
  },
  services: {
    findOrCreateConversation,
    updateConversationStatus,
    assignConversationToAgent,
    saveMessage,
    getConversationMessages,
    saveTranslation,
    translateText,
    sendWhatsappMessage,
    sendInstagramMessage,
    decrypt,
  },
  socket: {
    emitToTenant: SocketService.emitToTenant.bind(SocketService),
    emitToConversation: SocketService.emitToConversation.bind(SocketService),
  },
};

export function attachAppDeps(app: FastifyInstance, deps: AppDeps = defaultAppDeps): void {
  app.decorate("deps", deps);
}
