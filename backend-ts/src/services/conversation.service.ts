import type { Conversation } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { type Result, ok, fail } from "../lib/result.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ["active", "closed"],
  active: ["waiting", "closed"],
  waiting: ["active", "closed"],
  closed: [],
};

export async function findOrCreateCustomer(
  tenantId: string,
  phone: string,
  name?: string,
) {
  let customer = await prisma.customer.findUnique({
    where: {
      tenantId_phone: { tenantId, phone },
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId,
        phone,
        name: name ?? phone,
      },
    });
  }

  return customer;
}

export async function findOrCreateConversation(
  tenantId: string,
  customerId: string,
  channel: string,
): Promise<{ conversation: Conversation; isNew: boolean }> {
  // Look for the most recent conversation (including closed ones)
  const existing = await prisma.conversation.findFirst({
    where: {
      tenantId,
      customerId,
      channel,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    // Reopen closed conversations so the same chat is always reused
    if (existing.status === "closed") {
      const reopened = await prisma.conversation.update({
        where: { id: existing.id },
        data: { status: "queued" },
      });
      return { conversation: reopened, isNew: false };
    }
    return { conversation: existing, isNew: false };
  }

  const conversation = await prisma.conversation.create({
    data: {
      tenantId,
      customerId,
      channel,
      status: "queued",
    },
  });

  return { conversation, isNew: true };
}

export async function updateConversationStatus(
  conversationId: string,
  tenantId: string,
  newStatus: string,
): Promise<Result<Conversation, NotFoundError | ValidationError>> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });

  if (!conversation) {
    return fail(new NotFoundError("Conversation"));
  }

  const allowed = VALID_TRANSITIONS[conversation.status];
  if (!allowed?.includes(newStatus)) {
    return fail(
      new ValidationError(
        `Cannot transition from '${conversation.status}' to '${newStatus}'`,
      ),
    );
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: newStatus },
  });

  return ok(updated);
}
