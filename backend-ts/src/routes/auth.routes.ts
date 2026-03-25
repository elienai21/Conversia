import type { FastifyInstance } from "fastify";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import {
  loginRequestSchema,
  passwordResetRequestSchema,
  googleLoginRequestSchema,
  refreshTokenRequestSchema,
  type LoginResponse,
} from "../schemas/auth.schema.js";
import { authMiddleware, revokeToken } from "../middleware/auth.middleware.js";

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request, reply) => {
    const { prisma, auth } = request.server.deps;
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid credentials format" });
    }

    const { email, password } = parsed.data;
    const users = await prisma.user.findMany({
      where: { email },
      orderBy: { createdAt: "asc" },
    });
    const user = await findPasswordLoginUser(users, password, auth.verifyPassword);

    if (!user) {
      return reply.status(401).send({ detail: "Invalid credentials" });
    }

    if (!user.passwordHash) {
      return reply.status(401).send({ detail: "This account uses Google Sign-In. Please use the Google button to log in." });
    }

    const valid = await auth.verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ detail: "Invalid credentials" });
    }

    if (!user.isActive) {
      return reply.status(403).send({ detail: "Account is deactivated" });
    }

    const token = auth.createAccessToken(user.id, user.tenantId);
    const refreshToken = auth.createRefreshToken(user.id, user.tenantId);

    const result: LoginResponse = {
      access_token: token,
      refresh_token: refreshToken,
      token_type: "bearer",
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };

    return reply.send(result);
  });

  app.post("/google", async (request, reply) => {
    const { prisma, auth } = request.server.deps;
    const parsed = googleLoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid request format" });
    }

    const { credential } = parsed.data;

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: config.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return reply.status(401).send({ detail: "Invalid Google token" });
    }

    if (!payload?.email) {
      return reply.status(401).send({ detail: "Google token missing email" });
    }

    if (!payload.email_verified) {
      return reply.status(401).send({ detail: "Google email not verified" });
    }

    const user = await prisma.user.findFirst({
      where: { email: payload.email },
    });

    if (!user) {
      return reply.status(404).send({ detail: "Account not found. Contact your administrator." });
    }

    if (!user.isActive) {
      return reply.status(403).send({ detail: "Account is deactivated" });
    }

    const token = auth.createAccessToken(user.id, user.tenantId);
    const refreshToken = auth.createRefreshToken(user.id, user.tenantId);

    const result: LoginResponse = {
      access_token: token,
      refresh_token: refreshToken,
      token_type: "bearer",
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };

    return reply.send(result);
  });

  // ─── Refresh Token ───────────────────────────────────────
  app.post("/refresh", async (request, reply) => {
    const { prisma, auth } = request.server.deps;
    const parsed = refreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid request format" });
    }

    let payload;
    try {
      payload = auth.decodeRefreshToken(parsed.data.refresh_token);
    } catch {
      return reply.status(401).send({ detail: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, tenantId: true, fullName: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({ detail: "User not found or deactivated" });
    }

    const newAccessToken = auth.createAccessToken(user.id, user.tenantId);
    const newRefreshToken = auth.createRefreshToken(user.id, user.tenantId);

    return reply.send({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: "bearer",
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  });

  // POST /auth/logout — revokes the current access token immediately.
  // The token is added to a Redis blacklist with TTL = remaining token lifetime.
  // After this call, any request with the same token returns 401.
  app.post("/logout", { onRequest: authMiddleware }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (token) {
      try {
        const decoded = jwt.decode(token) as { exp?: number } | null;
        const expSec = decoded?.exp ?? Math.floor(Date.now() / 1000) + config.ACCESS_TOKEN_EXPIRE_MINUTES * 60;
        await revokeToken(token, expSec);
      } catch {
        // Non-fatal — logout still succeeds even if blacklist fails
      }
    }

    return reply.status(204).send();
  });

  app.post("/password-reset/request", async (request, reply) => {
    const { prisma, auth, services } = request.server.deps;
    const parsed = passwordResetRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid request format" });
    }

    const users = await prisma.user.findMany({
      where: { email: parsed.data.email },
      orderBy: { createdAt: "asc" },
    });

    for (const user of users) {
      if (!user.isActive) {
        continue;
      }

      const token = auth.createPasswordResetToken(user.id, user.tenantId);
      const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await services.sendPasswordResetEmail(user.email, resetUrl);
    }

    return reply.send({
      detail: "If an account exists for this email, a password reset link will be sent shortly.",
    });
  });
}

async function findPasswordLoginUser(
  users: Array<{
    id: string;
    tenantId: string;
    email: string;
    passwordHash: string | null;
    fullName: string;
    role: string;
    isActive: boolean;
  }>,
  password: string,
  verifyPassword: (password: string, hash: string) => Promise<boolean>,
) {
  for (const user of users) {
    if (!user.passwordHash) {
      continue;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (valid) {
      return user;
    }
  }

  return null;
}
