// src/lib/audit.ts
// Thin wrapper for writing LGPD-compliant audit log entries.
// Non-fatal: errors are caught + logged so they never break the main request.

import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;          // dot-notation, e.g. "user.login", "settings.update"
  entityType?: string;     // e.g. "conversation", "service_order"
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an audit log entry. Non-fatal — never throws.
 *
 * @example
 * await logAudit({ tenantId, userId, action: "user.login", ipAddress: req.ip });
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId:   entry.tenantId,
        userId:     entry.userId ?? null,
        action:     entry.action,
        entityType: entry.entityType ?? null,
        entityId:   entry.entityId ?? null,
        metadata:   (entry.metadata ?? null) as any,
        ipAddress:  entry.ipAddress ?? null,
        userAgent:  entry.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, entry }, "[Audit] Failed to write audit log");
  }
}
