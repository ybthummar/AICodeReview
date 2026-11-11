import { Octokit } from "octokit";
import prisma from "@/lib/db";
import { recordAudit } from "@/module/audit/lib/audit";
import { fetchInstallationAccount, isGitHubAppConfigured } from "@/module/github/lib/app";
import { getGitHubTokenForUser } from "@/module/team/lib/access";

export class InstallationLinkError extends Error {}

// The installation id arrives through a browser redirect, so confirm the user really controls the account.
async function userControlsAccount(
  userId: string,
  account: { login: string; type: string }
): Promise<boolean> {
  const token = await getGitHubTokenForUser(userId);
  if (!token) return false;

  const octokit = new Octokit({ auth: token });

  try {
    const me = await octokit.rest.users.getAuthenticated();
    if (me.data.login.toLowerCase() === account.login.toLowerCase()) return true;
  } catch {
    // Fall through to the organization checks.
  }

  if (account.type === "Organization") {
    try {
      const membership = await octokit.rest.orgs.getMembershipForAuthenticatedUser({ org: account.login });
      if (membership.data.state === "active" && membership.data.role === "admin") return true;
    } catch {
      // Tokens without the read:org scope cannot read memberships.
    }
  }

  // Connecting a repository already required write access to it on GitHub.
  const connected = await prisma.repository.count({
    where: { userId, owner: { equals: account.login, mode: "insensitive" } },
  });

  return connected > 0;
}

export async function linkInstallation(userId: string, installationId: number) {
  if (!isGitHubAppConfigured()) {
    throw new InstallationLinkError("The GitHub App is not configured on this server.");
  }

  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new InstallationLinkError("Invalid installation.");
  }

  const account = await fetchInstallationAccount(installationId);

  if (!(await userControlsAccount(userId, account))) {
    throw new InstallationLinkError(
      `Only an owner of ${account.login} can link this installation. Connect one of its repositories first, then try again.`
    );
  }

  const existing = await prisma.gitHubInstallation.findUnique({
    where: { installationId },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw new InstallationLinkError("This installation is already linked to another RepoPilot account.");
  }

  const installation = await prisma.gitHubInstallation.upsert({
    where: { installationId },
    update: { accountLogin: account.login, accountType: account.type },
    create: { installationId, accountLogin: account.login, accountType: account.type, userId },
  });

  await recordAudit({
    userId,
    action: "installation.linked",
    targetType: "github_installation",
    targetId: installation.id,
    summary: `Linked the GitHub App installation for ${account.login}`,
  });

  return installation;
}
