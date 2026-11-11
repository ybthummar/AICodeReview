"use server";

import { isAdminUser } from "@/lib/admin";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isProActive } from "@/lib/subscription";
import {
  createWebhook,
  getRepositories,
  verifyRepositoryAccess,
} from "@/module/github/lib/github";
import { hasInstallationForAccount } from "@/module/github/lib/app";
import { inngest } from "@/inngest/client";
import { performDirectRepoIndex } from "@/inngest/functions";
import { recordAudit } from "@/module/audit/lib/audit";
import { revalidatePath } from "next/cache";

export const fetchRepositories = async (
  page: number = 1,
  perPage: number = 10
) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const githubRepos = await getRepositories(page, perPage);

  const dbRepos = await prisma.repository.findMany({
    where: {
      userId: session.user.id,
    },
  });

  const connectedReposIds = new Set(dbRepos.map((repo) => repo.githubId));

  return githubRepos.map((repo) => ({
    ...repo,
    isConnected: connectedReposIds.has(BigInt(repo.id)),
  }));
};

export type WebhookMode = "registered" | "app" | "failed";

export const connectRepository = async (
  owner: string,
  repo: string,
  githubId: number
): Promise<ActionResult<{ webhook: WebhookMode }>> => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return fail(new Error("Unauthorized"));
    }

    let canonical: { owner: string; name: string };
    try {
      canonical = await verifyRepositoryAccess(owner, repo, githubId);
    } catch (error) {
      return fail(
        error instanceof Error && error.message.startsWith("You need")
          ? error
          : new Error("Could not verify this repository on GitHub. Check your connection and permissions.")
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });

    const isAdmin = isAdminUser(user || session.user);

    const existing = await prisma.repository.findUnique({
      where: { githubId: BigInt(githubId) },
      select: { id: true, userId: true },
    });

    // Reconnecting must never move a repository to a different account.
    if (existing && existing.userId !== session.user.id) {
      return fail(new Error("This repository is already connected by another RepoPilot account."));
    }

    if (!existing && !isProActive(user) && !isAdmin) {
      const connectedCount = await prisma.repository.count({
        where: { userId: session.user.id },
      });

      if (connectedCount >= 1) {
        return fail(
          new Error(
            "Free plan is limited to 1 repository. Upgrade to PRO (₹149/month) or contact Admin to connect multiple repositories."
          )
        );
      }
    }

    // The GitHub App delivers events itself, so a second repository webhook would double every review.
    let webhook: WebhookMode;
    if (await hasInstallationForAccount(canonical.owner)) {
      webhook = "app";
    } else {
      webhook = (await createWebhook(canonical.owner, canonical.name)) ? "registered" : "failed";
    }

    // The repository is saved even when the webhook is not possible (for example on localhost).
    await prisma.repository.upsert({
      where: {
        githubId: BigInt(githubId),
      },
      update: {
        name: canonical.name,
        owner: canonical.owner,
        fullName: `${canonical.owner}/${canonical.name}`,
        url: `https://github.com/${canonical.owner}/${canonical.name}`,
      },
      create: {
        githubId: BigInt(githubId),
        name: canonical.name,
        owner: canonical.owner,
        fullName: `${canonical.owner}/${canonical.name}`,
        url: `https://github.com/${canonical.owner}/${canonical.name}`,
        userId: session.user.id,
      },
    });

    // Index for RAG: try Inngest first, fall back to direct execution
    let queuedWithInngest = false;
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "repository.connected",
          data: {
            owner: canonical.owner,
            repo: canonical.name,
            userId: session.user.id,
          },
        });
        queuedWithInngest = true;
      } catch (error) {
        console.warn("Failed to trigger repository indexing via Inngest:", error);
      }
    }

    if (!queuedWithInngest) {
      performDirectRepoIndex({
        owner: canonical.owner,
        repo: canonical.name,
        userId: session.user.id,
      }).catch((err) => {
        console.error("Direct repository indexing error:", err);
      });
    }

    await recordAudit({
      userId: session.user.id,
      action: "repository.connected",
      targetType: "repository",
      targetId: String(githubId),
      summary: `Connected ${canonical.owner}/${canonical.name}`,
    });

    revalidatePath("/dashboard/repositories", "page");
    revalidatePath("/dashboard/settings", "page");

    return ok({ webhook });
  } catch (error) {
    console.error("connectRepository failed:", error);
    return fail(error, "Could not connect the repository.");
  }
};
