import prisma from "@/lib/db";
import { ADMIN_EMAILS, isAdminUser } from "@/lib/admin";
import { getInstallationTokenForAccount } from "@/module/github/lib/app";
import { hasRole, normalizeRole, type WorkspaceRole } from "@/module/team/lib/roles";

export { hasRole, normalizeRole, ROLE_LABELS, WORKSPACE_ROLES } from "@/module/team/lib/roles";
export type { WorkspaceRole } from "@/module/team/lib/roles";

export interface Viewer {
  id: string;
  email?: string | null;
  name?: string | null;
}

// Repositories the user owns or can reach through a workspace membership.
export function accessibleRepositoryWhere(userId: string) {
  return {
    OR: [
      { userId },
      { workspaceLink: { workspace: { members: { some: { userId } } } } },
    ],
  };
}

export interface RepositoryFilter {
  id?: string;
  owner?: string;
  name?: string;
}

export interface RoleSource {
  userId: string;
  workspaceLink?: { workspace: { members: { role: string }[] } } | null;
}

// `workspaceLink.workspace.members` must be pre-filtered to the viewer's own membership row.
export function roleForRepository(repository: RoleSource, viewer: Viewer): WorkspaceRole {
  if (isAdminUser(viewer) || repository.userId === viewer.id) return "OWNER";
  return normalizeRole(repository.workspaceLink?.workspace.members[0]?.role);
}

export function viewerMembershipInclude(userId: string) {
  return {
    workspaceLink: {
      select: {
        workspaceId: true,
        workspace: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    },
  };
}

export async function findAccessibleRepository(
  viewer: Viewer,
  filter: RepositoryFilter,
  minimumRole: WorkspaceRole = "VIEWER"
) {
  const repository = await prisma.repository.findFirst({
    where: {
      AND: [
        {
          ...(filter.id ? { id: filter.id } : {}),
          ...(filter.owner ? { owner: { equals: filter.owner, mode: "insensitive" as const } } : {}),
          ...(filter.name ? { name: { equals: filter.name, mode: "insensitive" as const } } : {}),
        },
        isAdminUser(viewer) ? {} : accessibleRepositoryWhere(viewer.id),
      ],
    },
    include: viewerMembershipInclude(viewer.id),
  });

  if (!repository) return null;

  const role = roleForRepository(repository, viewer);
  if (!hasRole(role, minimumRole)) return null;

  return { repository, role };
}

export async function requireRepositoryAccess(
  viewer: Viewer,
  filter: RepositoryFilter,
  minimumRole: WorkspaceRole = "VIEWER"
) {
  const access = await findAccessibleRepository(viewer, filter, minimumRole);

  if (!access) {
    throw new Error("Repository not found or you do not have permission to use it.");
  }

  return access;
}

// Reviews, chat and tooling always use the GitHub token of whoever connected the repository.
export async function getGitHubTokenForUser(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github", accessToken: { not: null } },
    select: { accessToken: true },
  });

  return account?.accessToken ?? null;
}

export async function requireRepositoryToken(
  repositoryOwnerId: string,
  accountLogin?: string
): Promise<string> {
  if (accountLogin) {
    const installationToken = await getInstallationTokenForAccount(accountLogin);
    if (installationToken) return installationToken;
  }

  const token = await getGitHubTokenForUser(repositoryOwnerId);

  if (!token) {
    throw new Error("The repository owner has no GitHub access token. Ask them to sign in again.");
  }

  return token;
}

// Webhook-driven reviews fall back to an admin or any linked token so public repos keep working.
export async function resolveReviewToken(
  repositoryOwnerId: string,
  accountLogin?: string
): Promise<string | null> {
  if (accountLogin) {
    const installationToken = await getInstallationTokenForAccount(accountLogin);
    if (installationToken) return installationToken;
  }

  const own = await getGitHubTokenForUser(repositoryOwnerId);
  if (own) return own;

  const admin = await prisma.account.findFirst({
    where: {
      providerId: "github",
      accessToken: { not: null },
      user: { email: { in: ADMIN_EMAILS } },
    },
    select: { accessToken: true },
  });
  if (admin?.accessToken) return admin.accessToken;

  const any = await prisma.account.findFirst({
    where: { providerId: "github", accessToken: { not: null } },
    select: { accessToken: true },
  });

  return any?.accessToken ?? null;
}
