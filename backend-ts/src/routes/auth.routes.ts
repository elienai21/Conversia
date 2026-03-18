import type { FastifyInstance } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import {
  loginRequestSchema,
  googleLoginRequestSchema,
  type LoginResponse,
} from "../schemas/auth.schema.js";

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

    const result: LoginResponse = {
      access_token: token,
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

    const result: LoginResponse = {
      access_token: token,
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
