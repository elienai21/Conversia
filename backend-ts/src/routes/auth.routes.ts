import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { verifyPassword, createAccessToken } from "../lib/auth.js";
import {
  loginRequestSchema,
  type LoginResponse,
} from "../schemas/auth.schema.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid credentials format" });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ detail: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ detail: "Invalid credentials" });
    }

    if (!user.isActive) {
      return reply.status(403).send({ detail: "Account is deactivated" });
    }

    const token = createAccessToken(user.id, user.tenantId);

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
