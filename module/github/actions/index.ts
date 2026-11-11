"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getInstallUrl, isGitHubAppConfigured } from "@/module/github/lib/app";
import { recordAudit } from "@/module/audit/lib/audit";

export interface GitHubAppStatus {
  configured: boolean;
  installUrl: string | null;
  installations: { id: string; accountLogin: string; accountType: string; createdAt: string }[];
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function getGitHubAppStatus(): Promise<GitHubAppStatus> {
  const session = await requireSession();

  const installations = await prisma.gitHubInstallation.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return {
    configured: isGitHubAppConfigured(),
    installUrl: getInstallUrl(session.user.id),
    installations: installations.map((i) => ({
      id: i.id,
      accountLogin: i.accountLogin,
      accountType: i.accountType,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

// Removes the link inside RepoPilot. Uninstalling the app itself happens on GitHub.
export async function unlinkGitHubInstallation(id: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const installation = await prisma.gitHubInstallation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, accountLogin: true },
    });
    if (!installation) return fail(new Error("Installation not found"));

    await prisma.gitHubInstallation.delete({ where: { id: installation.id } });

    await recordAudit({
      userId: session.user.id,
      action: "installation.removed",
      targetType: "github_installation",
      targetId: installation.id,
      summary: `Unlinked the GitHub App installation for ${installation.accountLogin}`,
    });

    return ok(null);
  } catch (error) {
    return fail(error, "Could not unlink the installation.");
  }
}
