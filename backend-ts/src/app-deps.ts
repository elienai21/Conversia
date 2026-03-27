import type { FastifyInstance } from "fastify";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import {
  createAccessToken,
  createPasswordResetToken,
  decodePasswordResetToken,
  decodeAccessToken,
  verifyPassword,
  createRefreshToken,
  decodeRefreshToken,
  createEmailVerificationToken,
  decodeEmailVerificationToken,
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
import { sendEmail } from "./services/email.service.js";

export interface AppDeps {
  prisma: typeof prisma;
  auth: {
    verifyPassword: typeof verifyPassword;
    createAccessToken: typeof createAccessToken;
    createRefreshToken: typeof createRefreshToken;
    decodeRefreshToken: typeof decodeRefreshToken;
    createPasswordResetToken: typeof createPasswordResetToken;
    decodeAccessToken: typeof decodeAccessToken;
    decodePasswordResetToken: typeof decodePasswordResetToken;
    createEmailVerificationToken: typeof createEmailVerificationToken;
    decodeEmailVerificationToken: typeof decodeEmailVerificationToken;
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
    sendVerificationEmail: (email: string, verifyUrl: string) => Promise<void>;
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
    createRefreshToken,
    decodeRefreshToken,
    createPasswordResetToken,
    decodeAccessToken,
    decodePasswordResetToken,
    createEmailVerificationToken,
    decodeEmailVerificationToken,
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
      logger.info(`[Auth] Sending password reset to ${email}`);
      await sendEmail({
        to: email,
        subject: "Redefinição de senha — Conversia",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px;">
            <h2 style="color:#111;margin-bottom:8px;">Redefinir sua senha</h2>
            <p style="color:#555;margin-bottom:24px;">Recebemos um pedido para redefinir a senha da sua conta Conversia. Clique no botão abaixo para criar uma nova senha:</p>
            <a href="${resetUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Redefinir senha</a>
            <p style="color:#888;font-size:13px;margin-top:24px;">Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este e-mail.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#aaa;font-size:12px;">Conversia · AI Assistant</p>
          </div>`,
      });
    },
    sendVerificationEmail: async (email, verifyUrl) => {
      logger.info(`[Auth] Sending verification email to ${email}`);
      await sendEmail({
        to: email,
        subject: "Confirme seu e-mail — Conversia",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px;">
            <h2 style="color:#111;margin-bottom:8px;">Confirme seu e-mail</h2>
            <p style="color:#555;margin-bottom:24px;">Bem-vindo à Conversia! Clique no botão abaixo para verificar seu endereço de e-mail e ativar sua conta:</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Verificar e-mail</a>
            <p style="color:#888;font-size:13px;margin-top:24px;">Se você não criou uma conta na Conversia, ignore este e-mail.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#aaa;font-size:12px;">Conversia · AI Assistant</p>
          </div>`,
      });
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
