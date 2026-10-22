"use server";

import { isAdminUser } from "@/lib/admin";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createWebhook, getRepositories } from "@/module/github/lib/github";
import { inngest } from "@/inngest/client";
import { performDirectRepoIndex } from "@/inngest/functions";
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

export const connectRepository = async (
  owner: string,
  repo: string,
  githubId: number
) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  // Check subscription and enforce 1 repository limit for Free users (Admin has unlimited repos)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, subscriptionTier: true, subscriptionStatus: true },
  });

  const isPro =
    user?.subscriptionTier === "PRO" && user?.subscriptionStatus === "ACTIVE";
  const isAdmin = isAdminUser(user || session.user);

  const alreadyConnected = await prisma.repository.findFirst({
    where: {
      githubId: BigInt(githubId),
      userId: session.user.id,
    },
  });

  if (!isPro && !isAdmin && !alreadyConnected) {
    const connectedCount = await prisma.repository.count({
      where: { userId: session.user.id },
    });

    if (connectedCount >= 1) {
      throw new Error(
        "Free plan is limited to 1 repository. Upgrade to PRO (₹149/month) or contact Admin to connect multiple repositories."
      );
    }
  }

  const webhook = await createWebhook(owner, repo);

  // Always save and connect repository in DB, even if webhook registration was not possible (e.g. localhost or org perms)
  await prisma.repository.upsert({
    where: {
      githubId: BigInt(githubId),
    },
    update: {
      name: repo,
      owner,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
      userId: session.user.id,
    },
    create: {
      githubId: BigInt(githubId),
      name: repo,
      owner,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
      userId: session.user.id,
    },
  });

  // Trigger indexing for RAG: try Inngest first, fall back to direct execution
  let queuedWithInngest = false;
  if (process.env.INNGEST_EVENT_KEY) {
    try {
      await inngest.send({
        name: "repository.connected",
        data: {
          owner,
          repo,
          userId: session.user.id,
        },
      });
      queuedWithInngest = true;
    } catch (error) {
      console.warn("Failed to trigger repository indexing via Inngest:", error);
    }
  }

  if (!queuedWithInngest) {
    // Run direct indexing in background
    performDirectRepoIndex({
      owner,
      repo,
      userId: session.user.id,
    }).catch((err) => {
      console.error("Direct repository indexing error:", err);
    });
  }

  revalidatePath("/dashboard/repositories", "page");
  revalidatePath("/dashboard/settings", "page");

  return webhook;
};
