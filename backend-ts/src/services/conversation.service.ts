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

/** Strip +, spaces, dashes, parens — keep only digits */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export async function findOrCreateCustomer(
  tenantId: string,
  phone: string,
  name?: string,
  profilePictureUrl?: string,
  tag?: string,
  role?: string,
) {
  // Auto-detect WhatsApp groups by the @g.us suffix
  const isGroup = phone.includes("@g.us");
  const effectiveTag = isGroup ? "GROUP_STAFF" : (tag ?? "GUEST");
  
  // Decide default role if not provided
  let effectiveRole = role;
  if (!effectiveRole) {
    if (isGroup || effectiveTag === "STAFF" || effectiveTag === "GROUP_STAFF") {
      effectiveRole = "staff";
    } else {
      effectiveRole = "lead"; // Por padrão, entra como lead, depois o intent avalia
    }
  }

  const normalized = isGroup ? phone : normalizePhone(phone);

  let customer = await prisma.customer.findUnique({
    where: {
      tenantId_phone: { tenantId, phone: normalized },
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId,
        phone: normalized,
        name: name ?? phone,
        profilePictureUrl: profilePictureUrl ?? null,
        tag: effectiveTag,
        role: effectiveRole,
      },
    });
  } else {
    // Update profile picture, tag and/or role if needed
    const updates: Record<string, unknown> = {};
    if (profilePictureUrl && !customer.profilePictureUrl) updates.profilePictureUrl = profilePictureUrl;
    if (isGroup && customer.tag !== "GROUP_STAFF") updates.tag = "GROUP_STAFF";
    if (role && customer.role !== role) updates.role = role;

    if (Object.keys(updates).length > 0) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: updates,
      });
    }
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
