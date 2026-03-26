import type { FastifyInstance } from "fastify";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import {
  loginRequestSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  googleLoginRequestSchema,
  refreshTokenRequestSchema,
  signupRequestSchema,
  type LoginResponse,
} from "../schemas/auth.schema.js";
import { authMiddleware, revokeToken } from "../middleware/auth.middleware.js";
import { hashPassword } from "../lib/auth.js";

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

  // ─── Self-service Signup ────────────────────────────────
  // Creates a new tenant + admin user in one atomic transaction.
  // Rate limited at the nginx/railway level; no additional IP throttle here.
  app.post("/signup", async (request, reply) => {
    const { prisma, auth } = request.server.deps;

    const parsed = signupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.status(422).send({ detail: first?.message ?? "Dados inválidos" });
    }

    const { company_name, full_name, email, password } = parsed.data;

    // Check for duplicate email (prevent creating multiple tenants with same admin email)
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      return reply.status(409).send({ detail: "Este e-mail já está cadastrado. Faça login ou use outro e-mail." });
    }

    // Build unique slug from company name
    const baseSlug = slugify(company_name);
    const slug = await resolveUniqueSlug(prisma, baseSlug);

    const passwordHash = await hashPassword(password);

    // Atomic transaction: create tenant + settings + admin user
    const user = await prisma.$transaction(async (tx) => {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const tenant = await tx.tenant.create({
        data: {
          name: company_name,
          slug,
          defaultLanguage: "pt",
          plan: "trial",
          planStatus: "trial",
          trialEndsAt,
          onboardingStep: 0,
        },
      });

      await tx.tenantSettings.create({
        data: {
          tenantId: tenant.id,
          whatsappProvider: "evolution",
          openaiModel: "gpt-4.1-mini",
          aiTemperature: 0.7,
          aiMaxTokens: 200,
        },
      });

      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          fullName: full_name,
          role: "admin",
          preferredLanguage: "pt",
          isActive: true,
        },
      });
    });

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

    return reply.status(201).send(result);
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

  // POST /auth/password-reset/confirm — receives the token from the email link and sets the new password.
  app.post("/password-reset/confirm", async (request, reply) => {
    const { prisma, auth } = request.server.deps;

    const parsed = passwordResetConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Dados inválidos. Verifique o token e a senha." });
    }

    const { token, new_password } = parsed.data;

    // Decode + validate the JWT reset token
    let payload: { sub: string; tenant_id: string; purpose: string };
    try {
      payload = auth.decodePasswordResetToken(token);
    } catch {
      return reply.status(400).send({ detail: "Link inválido ou expirado. Solicite um novo link de redefinição." });
    }

    if (payload.purpose !== "password_reset") {
      return reply.status(400).send({ detail: "Token inválido." });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      return reply.status(404).send({ detail: "Usuário não encontrado ou desativado." });
    }

    if (user.tenantId !== payload.tenant_id) {
      return reply.status(400).send({ detail: "Token inválido." });
    }

    const passwordHash = await hashPassword(new_password);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Invalidate the reset token so it can't be used again (treat it like an access token)
    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const expSec = decoded?.exp ?? Math.floor(Date.now() / 1000) + 3600;
      await revokeToken(token, expSec);
    } catch {
      // Non-fatal — password was already updated
    }

    return reply.send({ detail: "Senha redefinida com sucesso. Você já pode fazer login." });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert an arbitrary string to a URL-safe slug.
 * "Hotel Atlântico & Spa" → "hotel-atlantico-spa"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")     // non-alphanumeric → dash
    .replace(/^-+|-+$/g, "")         // trim leading/trailing dashes
    .slice(0, 50);
}

/**
 * Resolve a unique slug, appending a random suffix if the base slug is taken.
 * e.g. "hotel-demo" → "hotel-demo-x4f2"
 */
async function resolveUniqueSlug(
  prisma: { tenant: { findUnique: (args: { where: { slug: string } }) => Promise<unknown> } },
  base: string,
): Promise<string> {
  const exists = await prisma.tenant.findUnique({ where: { slug: base } });
  if (!exists) return base;

  // Append 4-char random hex suffix
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base.slice(0, 44)}-${suffix}`;
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
