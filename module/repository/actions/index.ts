"use server";

import { isAdminUser } from "@/lib/admin";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { RequestError } from "octokit";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isProActive } from "@/lib/subscription";
import {
  createWebhook,
  getRepositories,
  verifyRepositoryAccess,
} from "@/module/github/lib/github";
import { hasInstallationForRepository } from "@/module/github/lib/app";
import { queueRepositoryIndex } from "@/module/repository/lib/index-jobs";
import { recordAudit } from "@/module/audit/lib/audit";
import { getGitHubTokenForUser } from "@/module/team/lib/access";
import type { RepositoryFetchResult } from "@/types/repository/types";
import { revalidatePath } from "next/cache";

export const fetchRepositories = async (
  page = 1,
  perPage = 10,
): Promise<RepositoryFetchResult> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { ok: false, code: "unauthorized", message: "Sign in to load your repositories." };
    }

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
      return { ok: false, code: "unavailable", message: "This repository page could not be loaded. Refresh the page and try again." };
    }

    const userId = session.user.id;
    const token = await getGitHubTokenForUser(userId);
    if (!token) {
      return { ok: false, code: "github_auth_required", message: "Authorize GitHub to load the repositories available to your account." };
    }

    const { repositories, hasNextPage, needsRepoScope } = await getRepositories(token, page, perPage);
    const connected = repositories.length > 0
      ? await prisma.repository.findMany({
          where: { userId, githubId: { in: repositories.map((repo) => BigInt(repo.id)) } },
          select: { githubId: true },
        })
      : [];
    const connectedIds = new Set(connected.map((repo) => repo.githubId));

    return {
      ok: true,
      hasNextPage,
      needsRepoScope,
      repositories: repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        stargazers_count: repo.stargazers_count,
        language: repo.language,
        topics: repo.topics,
        isConnected: connectedIds.has(BigInt(repo.id)),
      })),
    };
  } catch (error) {
    if (error instanceof RequestError) {
      const responseHeaders = error.response?.headers;
      if (error.status === 401) {
        return { ok: false, code: "github_auth_required", message: "GitHub rejected your saved access. Reconnect your GitHub account to load repositories." };
      }
      if (error.status === 429 || (error.status === 403 && (
        responseHeaders?.["x-ratelimit-remaining"] === "0" ||
        responseHeaders?.["retry-after"] || /rate limit/i.test(error.message)
      ))) {
        return { ok: false, code: "github_rate_limited", message: "GitHub is limiting repository requests. Wait before trying again." };
      }
      if (error.status === 403) {
        return { ok: false, code: "github_forbidden", message: "GitHub blocked repository access. Reconnect GitHub and check whether your organization requires OAuth app approval or SSO authorization." };
      }
    }

    console.error("[repository] Could not load repositories", {
      type: error instanceof Error ? error.name : typeof error,
      status: error instanceof RequestError ? error.status : undefined,
    });
    return { ok: false, code: "unavailable", message: "Could not load repositories right now. Please try again." };
  }
};

export type WebhookMode = "registered" | "app" | "failed";

export const connectRepository = async (
  owner: string,
  repo: string,
  githubId: number
): Promise<ActionResult<{ webhook: WebhookMode; indexingQueued: boolean }>> => {
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
    let webhook: WebhookMode = "failed";
    try {
      if (await hasInstallationForRepository(canonical.owner, canonical.name)) {
        webhook = "app";
      } else if (await createWebhook(canonical.owner, canonical.name)) {
        webhook = "registered";
      }
    } catch (error) {
      console.warn("Could not set up the repository webhook", {
        owner: canonical.owner, repo: canonical.name, status: error instanceof RequestError ? error.status : undefined,
      });
    }

    // The repository is saved even when the webhook is not possible (for example on localhost).
    const connectedRepository = await prisma.repository.upsert({
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
      select: { id: true },
    });

    let indexingQueued = false;
    try {
      indexingQueued = await queueRepositoryIndex({
        id: connectedRepository.id,
        owner: canonical.owner,
        name: canonical.name,
        userId: session.user.id,
      });
    } catch (error) {
      console.error(`Failed to queue indexing for ${canonical.owner}/${canonical.name}:`, error);
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

    return ok({ webhook, indexingQueued });
  } catch (error) {
    console.error("connectRepository failed:", error);
    return fail(error, "Could not connect the repository.");
  }
};
