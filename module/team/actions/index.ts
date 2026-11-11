"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { hasUnlimitedPlan } from "@/module/billing/lib/usage";
import { recordAudit } from "@/module/audit/lib/audit";
import {
  accessibleRepositoryWhere,
  hasRole,
  normalizeRole,
  roleForRepository,
  viewerMembershipInclude,
  type WorkspaceRole,
} from "@/module/team/lib/access";

const MAX_OWNED_WORKSPACES = 3;
const FREE_MAX_MEMBERS = 3;

export interface TeamMemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
}

export interface TeamRepositoryView {
  id: string;
  fullName: string;
  ownerId: string;
}

export interface WorkspaceView {
  id: string;
  name: string;
  ownerId: string;
  myRole: WorkspaceRole;
  members: TeamMemberView[];
  repositories: TeamRepositoryView[];
  memberLimit: number | null;
}

export interface TeamOverview {
  workspaces: WorkspaceView[];
  shareableRepositories: { id: string; fullName: string; workspaceId: string | null }[];
}

export interface AccessibleRepositoryView {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  role: WorkspaceRole;
}

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

async function getMyRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  return member ? normalizeRole(member.role) : null;
}

function refresh() {
  revalidatePath("/dashboard/team", "page");
}

export async function getTeamOverview(): Promise<TeamOverview> {
  const session = await requireSession();
  const userId = session.user.id;

  const [workspaces, ownedRepositories] = await Promise.all([
    prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
          orderBy: { createdAt: "asc" },
        },
        repositories: {
          include: { repository: { select: { id: true, fullName: true, userId: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.repository.findMany({
      where: { userId },
      select: { id: true, fullName: true, workspaceLink: { select: { workspaceId: true } } },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const ownerPlans = new Map<string, boolean>();
  for (const workspace of workspaces) {
    if (!ownerPlans.has(workspace.ownerId)) {
      ownerPlans.set(workspace.ownerId, await hasUnlimitedPlan(workspace.ownerId));
    }
  }

  return {
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.ownerId,
      myRole: normalizeRole(workspace.members.find((m) => m.userId === userId)?.role),
      members: workspace.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: normalizeRole(m.role),
      })),
      repositories: workspace.repositories.map((r) => ({
        id: r.repository.id,
        fullName: r.repository.fullName,
        ownerId: r.repository.userId,
      })),
      memberLimit: ownerPlans.get(workspace.ownerId) ? null : FREE_MAX_MEMBERS,
    })),
    shareableRepositories: ownedRepositories.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      workspaceId: r.workspaceLink?.workspaceId ?? null,
    })),
  };
}

export async function getAccessibleRepositories(
  minimumRole: WorkspaceRole = "VIEWER"
): Promise<AccessibleRepositoryView[]> {
  const session = await requireSession();

  const repositories = await prisma.repository.findMany({
    where: accessibleRepositoryWhere(session.user.id),
    include: viewerMembershipInclude(session.user.id),
    orderBy: { fullName: "asc" },
  });

  return repositories
    .map((repository) => ({
      id: repository.id,
      fullName: repository.fullName,
      owner: repository.owner,
      name: repository.name,
      role: roleForRepository(repository, session.user),
    }))
    .filter((repository) => hasRole(repository.role, minimumRole));
}

export async function createWorkspace(name: string): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    const cleanName = name.trim().slice(0, 60);

    if (cleanName.length < 2) {
      return fail(new Error("Workspace name must be at least 2 characters"));
    }

    const owned = await prisma.workspace.count({ where: { ownerId: session.user.id } });
    if (owned >= MAX_OWNED_WORKSPACES) {
      return fail(new Error(`You can own up to ${MAX_OWNED_WORKSPACES} workspaces.`));
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: cleanName,
        ownerId: session.user.id,
        members: { create: { userId: session.user.id, role: "OWNER" } },
      },
      select: { id: true },
    });

    await recordAudit({
      userId: session.user.id,
      workspaceId: workspace.id,
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspace.id,
      summary: `Created workspace "${cleanName}"`,
    });

    refresh();
    return ok({ id: workspace.id });
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return fail(error, "Could not create the workspace.");
  }
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const role = await getMyRole(workspaceId, session.user.id);

    if (!role || !hasRole(role, "ADMIN")) {
      return fail(new Error("Only workspace admins can rename it."));
    }

    const cleanName = name.trim().slice(0, 60);
    if (cleanName.length < 2) {
      return fail(new Error("Workspace name must be at least 2 characters"));
    }

    await prisma.workspace.update({ where: { id: workspaceId }, data: { name: cleanName } });
    refresh();
    return ok(null);
  } catch (error) {
    return fail(error, "Could not rename the workspace.");
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const role = await getMyRole(workspaceId, session.user.id);

    if (role !== "OWNER") {
      return fail(new Error("Only the workspace owner can delete it."));
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    await prisma.workspace.delete({ where: { id: workspaceId } });

    // The workspace row is gone, so the entry is not linked to it and stays visible to the actor.
    await recordAudit({
      userId: session.user.id,
      action: "workspace.deleted",
      targetType: "workspace",
      targetId: workspaceId,
      summary: `Deleted workspace "${workspace?.name ?? workspaceId}"`,
    });

    refresh();
    revalidatePath("/dashboard/reviews", "page");
    return ok(null);
  } catch (error) {
    return fail(error, "Could not delete the workspace.");
  }
}

export async function addWorkspaceMember(
  workspaceId: string,
  email: string,
  role: Exclude<WorkspaceRole, "OWNER">
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const myRole = await getMyRole(workspaceId, session.user.id);

    if (!myRole || !hasRole(myRole, "ADMIN")) {
      return fail(new Error("Only workspace admins can add members."));
    }

    if (role === "ADMIN" && myRole !== "OWNER") {
      return fail(new Error("Only the owner can add another admin."));
    }

    if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
      return fail(new Error("Invalid role"));
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true, _count: { select: { members: true } } },
    });
    if (!workspace) return fail(new Error("Workspace not found"));

    if (!(await hasUnlimitedPlan(workspace.ownerId)) && workspace._count.members >= FREE_MAX_MEMBERS) {
      return fail(
        new Error(`Free workspaces can have up to ${FREE_MAX_MEMBERS} members. Upgrade the owner to PRO for more.`)
      );
    }

    const target = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (!target) {
      return fail(new Error("No RepoPilot user has that email yet. Ask them to sign in with GitHub first."));
    }

    const existing = await getMyRole(workspaceId, target.id);
    if (existing) return fail(new Error("That person is already in this workspace."));

    await prisma.workspaceMember.create({
      data: { workspaceId, userId: target.id, role },
    });

    await recordAudit({
      userId: session.user.id,
      workspaceId,
      action: "workspace.member_added",
      targetType: "user",
      targetId: target.id,
      summary: `Added ${email.trim()} as ${role.toLowerCase()}`,
    });

    refresh();
    return ok(null);
  } catch (error) {
    console.error("Failed to add workspace member:", error);
    return fail(error, "Could not add the member.");
  }
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  role: Exclude<WorkspaceRole, "OWNER">
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const myRole = await getMyRole(workspaceId, session.user.id);

    if (!myRole || !hasRole(myRole, "ADMIN")) {
      return fail(new Error("Only workspace admins can change roles."));
    }

    if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
      return fail(new Error("Invalid role"));
    }

    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { role: true },
    });
    if (!member) return fail(new Error("Member not found"));

    const currentRole = normalizeRole(member.role);
    if (currentRole === "OWNER") return fail(new Error("The owner's role cannot be changed."));

    if ((currentRole === "ADMIN" || role === "ADMIN") && myRole !== "OWNER") {
      return fail(new Error("Only the owner can promote or demote admins."));
    }

    await prisma.workspaceMember.update({ where: { id: memberId }, data: { role } });

    await recordAudit({
      userId: session.user.id,
      workspaceId,
      action: "workspace.role_changed",
      targetType: "member",
      targetId: memberId,
      summary: `Changed a member role from ${currentRole.toLowerCase()} to ${role.toLowerCase()}`,
    });

    refresh();
    return ok(null);
  } catch (error) {
    return fail(error, "Could not change the role.");
  }
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const myRole = await getMyRole(workspaceId, session.user.id);
    if (!myRole) return fail(new Error("Workspace not found"));

    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, userId: true, role: true },
    });
    if (!member) return fail(new Error("Member not found"));

    const targetRole = normalizeRole(member.role);
    const leavingSelf = member.userId === session.user.id;

    if (targetRole === "OWNER") {
      return fail(new Error("The owner cannot be removed. Delete the workspace instead."));
    }

    if (!leavingSelf) {
      if (!hasRole(myRole, "ADMIN")) return fail(new Error("Only workspace admins can remove members."));
      if (targetRole === "ADMIN" && myRole !== "OWNER") {
        return fail(new Error("Only the owner can remove an admin."));
      }
    }

    await prisma.workspaceMember.delete({ where: { id: member.id } });

    // Repositories a departing member shared stop being shared with the team.
    await prisma.workspaceRepository.deleteMany({
      where: { workspaceId, repository: { userId: member.userId } },
    });

    await recordAudit({
      userId: session.user.id,
      workspaceId,
      action: "workspace.member_removed",
      targetType: "user",
      targetId: member.userId,
      summary: leavingSelf ? "Left the workspace" : "Removed a member from the workspace",
    });

    refresh();
    revalidatePath("/dashboard/reviews", "page");
    return ok(null);
  } catch (error) {
    return fail(error, "Could not remove the member.");
  }
}

export async function shareRepositoryWithWorkspace(
  workspaceId: string,
  repositoryId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const myRole = await getMyRole(workspaceId, session.user.id);

    if (!myRole || !hasRole(myRole, "MEMBER")) {
      return fail(new Error("You need member access to share repositories."));
    }

    const repository = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: session.user.id },
      select: { id: true, workspaceLink: { select: { workspaceId: true } } },
    });
    if (!repository) return fail(new Error("You can only share repositories you connected."));

    if (repository.workspaceLink) {
      return fail(new Error("This repository is already shared. Unshare it first."));
    }

    await prisma.workspaceRepository.create({ data: { workspaceId, repositoryId } });

    await recordAudit({
      userId: session.user.id,
      workspaceId,
      action: "workspace.repository_shared",
      targetType: "repository",
      targetId: repositoryId,
      summary: "Shared a repository with the workspace",
    });

    refresh();
    revalidatePath("/dashboard/reviews", "page");
    return ok(null);
  } catch (error) {
    console.error("Failed to share repository:", error);
    return fail(error, "Could not share the repository.");
  }
}

export async function unshareRepository(repositoryId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const link = await prisma.workspaceRepository.findUnique({
      where: { repositoryId },
      select: { id: true, workspaceId: true, repository: { select: { userId: true } } },
    });
    if (!link) return fail(new Error("This repository is not shared."));

    const myRole = await getMyRole(link.workspaceId, session.user.id);
    const isRepositoryOwner = link.repository.userId === session.user.id;

    if (!isRepositoryOwner && !(myRole && hasRole(myRole, "ADMIN"))) {
      return fail(new Error("Only the repository owner or a workspace admin can unshare it."));
    }

    await prisma.workspaceRepository.delete({ where: { id: link.id } });

    await recordAudit({
      userId: session.user.id,
      workspaceId: link.workspaceId,
      action: "workspace.repository_unshared",
      targetType: "repository",
      targetId: repositoryId,
      summary: "Stopped sharing a repository with the workspace",
    });

    refresh();
    revalidatePath("/dashboard/reviews", "page");
    return ok(null);
  } catch (error) {
    return fail(error, "Could not unshare the repository.");
  }
}
