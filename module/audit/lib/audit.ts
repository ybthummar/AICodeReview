import prisma from "@/lib/db";
import type { AuditAction } from "@/module/audit/lib/actions";

export { AUDIT_ACTIONS, type AuditAction } from "@/module/audit/lib/actions";

// Audit trails must never break the action they describe.
export async function recordAudit(entry: {
  userId?: string | null;
  workspaceId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        workspaceId: entry.workspaceId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        summary: entry.summary.slice(0, 300),
        metadata: entry.metadata ?? {},
      },
    });
  } catch (error) {
    console.warn(`Audit entry "${entry.action}" was not recorded:`, error);
  }
}
