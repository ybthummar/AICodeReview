"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { AUDIT_ACTIONS, type AuditAction } from "@/module/audit/lib/actions";

const PAGE_SIZE = 40;

export interface AuditEntryView {
  id: string;
  action: AuditAction | string;
  summary: string;
  targetType: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
  scope: "personal" | "workspace";
}

export interface AuditPage {
  entries: AuditEntryView[];
  nextCursor: string | null;
}

// Everyone sees their own activity. Workspace owners and admins also see activity inside their workspaces.
// System admins see everything.
export async function getAuditLog(input: {
  cursor?: string | null;
  action?: string | null;
} = {}): Promise<ActionResult<AuditPage>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return fail(new Error("Unauthorized"));

    const action = AUDIT_ACTIONS.includes(input.action as AuditAction) ? input.action : undefined;

    let scope: object = {};
    if (!isAdminUser(session.user)) {
      const adminWorkspaces = await prisma.workspaceMember.findMany({
        where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
        select: { workspaceId: true },
      });

      scope = {
        OR: [
          { userId: session.user.id },
          ...(adminWorkspaces.length > 0
            ? [{ workspaceId: { in: adminWorkspaces.map((w) => w.workspaceId) } }]
            : []),
        ],
      };
    }

    const rows = await prisma.auditLog.findMany({
      where: { AND: [scope, action ? { action } : {}] },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return ok({
      entries: page.map((row) => ({
        id: row.id,
        action: row.action,
        summary: row.summary,
        targetType: row.targetType,
        createdAt: row.createdAt.toISOString(),
        actor: row.user ? { name: row.user.name, email: row.user.email } : null,
        scope: row.workspaceId ? "workspace" : "personal",
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Failed to load the audit log:", error);
    return fail(error, "Could not load the audit log.");
  }
}
