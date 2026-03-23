import { Server, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { allowedOrigins } from "../config.js";
import { logger } from "../lib/logger.js";

export class SocketService {
  private static io: Server | null = null;

  static initialize(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
      },
    });

    this.io.use((socket, next) => {
      const tenantId = socket.handshake.auth.tenantId || socket.handshake.query.tenantId;

      if (!tenantId) {
        return next(new Error("Authentication error: Missing tenantId"));
      }

      socket.data.tenantId = tenantId;
      next();
    });

    this.io.on("connection", (socket: Socket) => {
      const tenantId = socket.data.tenantId;

      const tenantRoom = `tenant_${tenantId}`;
      socket.join(tenantRoom);

      logger.info(`[Socket] Client connected to room ${tenantRoom}`);

      socket.on("join_conversation", (conversationId: string) => {
        const conversationRoom = `conv_${conversationId}`;
        socket.join(conversationRoom);
        logger.info(`[Socket] Client joined conversation room ${conversationRoom}`);
      });

      socket.on("leave_conversation", (conversationId: string) => {
        const conversationRoom = `conv_${conversationId}`;
        socket.leave(conversationRoom);
      });

      socket.on("disconnect", () => {
        logger.info("[Socket] Client disconnected");
      });
    });
  }

  static getIO(): Server {
    if (!this.io) {
      throw new Error("SocketService not initialized. Call initialize() first.");
    }
    return this.io;
  }

  static emitToTenant(tenantId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`tenant_${tenantId}`).emit(event, data);
    }
  }

  static emitToConversation(conversationId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`conv_${conversationId}`).emit(event, data);
    }
  }
}
