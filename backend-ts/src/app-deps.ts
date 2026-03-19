import type { FastifyInstance } from "fastify";
import { prisma } from "./lib/prisma.js";
import {
  createAccessToken,
  createPasswordResetToken,
  decodePasswordResetToken,
  decodeAccessToken,
  verifyPassword,
} from "./lib/auth.js";
import { findOrCreateConversation, updateConversationStatus } from "./services/conversation.service.js";
import { assignConversationToAgent } from "./services/assignment.service.js";
import {
  getConversationMessages,
  saveMessage,
  saveAttachment,
  saveTranslation,
} from "./services/message.service.js";
import { translateText } from "./services/translation.service.js";
import { sendWhatsappMessage, sendWhatsappMedia } from "./services/whatsapp.service.js";
import { sendInstagramMessage } from "./services/instagram.service.js";
import { decrypt } from "./lib/encryption.js";
import { SocketService } from "./services/socket.service.js";

export interface AppDeps {
  prisma: typeof prisma;
  auth: {
    verifyPassword: typeof verifyPassword;
    createAccessToken: typeof createAccessToken;
    createPasswordResetToken: typeof createPasswordResetToken;
    decodeAccessToken: typeof decodeAccessToken;
    decodePasswordResetToken: typeof decodePasswordResetToken;
  };
  services: {
    findOrCreateConversation: typeof findOrCreateConversation;
    updateConversationStatus: typeof updateConversationStatus;
    assignConversationToAgent: typeof assignConversationToAgent;
    saveMessage: typeof saveMessage;
    saveAttachment: typeof saveAttachment;
    getConversationMessages: typeof getConversationMessages;
    saveTranslation: typeof saveTranslation;
    translateText: typeof translateText;
    sendWhatsappMessage: typeof sendWhatsappMessage;
    sendWhatsappMedia: typeof sendWhatsappMedia;
    sendInstagramMessage: typeof sendInstagramMessage;
    decrypt: typeof decrypt;
    sendPasswordResetEmail: (email: string, resetUrl: string) => Promise<void>;
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
    createPasswordResetToken,
    decodeAccessToken,
    decodePasswordResetToken,
  },
  services: {
    findOrCreateConversation,
    updateConversationStatus,
    assignConversationToAgent,
    saveMessage,
    saveAttachment,
    getConversationMessages,
    saveTranslation,
    translateText,
    sendWhatsappMessage,
    sendWhatsappMedia,
    sendInstagramMessage,
    decrypt,
    sendPasswordResetEmail: async (email, resetUrl) => {
      console.log(`[Auth] Password reset requested for ${email}: ${resetUrl}`);
    },
  },
  socket: {
    emitToTenant: SocketService.emitToTenant.bind(SocketService),
    emitToConversation: SocketService.emitToConversation.bind(SocketService),
  },
};

export function attachAppDeps(app: FastifyInstance, deps: AppDeps = defaultAppDeps): void {
  app.decorate("deps", deps);
}
