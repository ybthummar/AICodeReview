"use server";

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

  const webhook = await createWebhook(owner, repo);

  if (webhook) {
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
  }

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
