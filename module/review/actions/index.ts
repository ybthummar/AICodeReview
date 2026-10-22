"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { getOpenPullRequests, GitHubPullRequest } from "@/module/github/lib/github";

export interface ConnectedRepoPR {
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  htmlUrl: string;
  createdAt: string;
  author: string;
  authorAvatar: string;
  headRef: string;
  baseRef: string;
  hasReview: boolean;
  reviewId?: string;
  reviewStatus?: string;
}

export async function getReviews(scope: "mine" | "all" = "mine") {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const isAdmin = isAdminUser(session.user);

  // Strictly user-wise: by default, show ONLY reviews for repositories owned by THIS user.
  // Only authorized admins who explicitly choose scope === "all" can inspect global reviews.
  const whereClause =
    isAdmin && scope === "all"
      ? {}
      : {
          repository: {
            userId: session.user.id,
          },
        };

  const reviews = await prisma.review.findMany({
    where: whereClause,
    include: {
      repository: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return reviews;
}

export async function getConnectedReposPullRequests(
  scope: "mine" | "all" = "mine"
): Promise<ConnectedRepoPR[]> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const isAdmin = isAdminUser(session.user);

  // Strictly user-wise: only fetch pull requests from repositories connected by THIS user.
  // Global PRs are only loaded if an admin explicitly toggles scope === "all".
  const repositories = await prisma.repository.findMany({
    where: isAdmin && scope === "all" ? {} : { userId: session.user.id },
    include: {
      user: {
        include: {
          accounts: {
            where: { providerId: "github" },
          },
        },
      },
      reviews: true,
    },
  });

  if (repositories.length === 0) {
    return [];
  }

  // Fallback token resolution
  const currentUserAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "github" },
  });
  const adminAccount = await prisma.account.findFirst({
    where: {
      providerId: "github",
      accessToken: { not: null },
      user: { email: "yugthummar001@gmail.com" },
    },
  });
  const fallbackAccount = await prisma.account.findFirst({
    where: { providerId: "github", accessToken: { not: null } },
  });
  const fallbackToken = currentUserAccount?.accessToken || adminAccount?.accessToken || fallbackAccount?.accessToken;

  const prs: ConnectedRepoPR[] = [];

  // Fetch PRs concurrently across repositories
  await Promise.allSettled(
    repositories.map(async (repo) => {
      const token = repo.user.accounts[0]?.accessToken || fallbackToken;
      if (!token) return;

      const repoPRs = await getOpenPullRequests(token, repo.owner, repo.name, "all");

      for (const pr of repoPRs) {
        const matchingReview = repo.reviews.find((r) => r.prNumber === pr.number);
        prs.push({
          repoOwner: repo.owner,
          repoName: repo.name,
          repoFullName: repo.fullName,
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          htmlUrl: pr.html_url,
          createdAt: pr.created_at,
          author: pr.user.login,
          authorAvatar: pr.user.avatar_url,
          headRef: pr.head.ref,
          baseRef: pr.base.ref,
          hasReview: !!matchingReview,
          reviewId: matchingReview?.id,
          reviewStatus: matchingReview?.status,
        });
      }
    })
  );

  // Prioritize open PRs needing review, then open reviewed PRs, then closed PRs
  prs.sort((a, b) => {
    if (a.state === "open" && b.state !== "open") return -1;
    if (a.state !== "open" && b.state === "open") return 1;
    if (a.state === "open" && b.state === "open") {
      if (!a.hasReview && b.hasReview) return -1;
      if (a.hasReview && !b.hasReview) return 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return prs;
}

export async function getRepoPullRequests(
  owner: string,
  repo: string
): Promise<GitHubPullRequest[]> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const currentUserAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "github" },
  });
  const adminAccount = await prisma.account.findFirst({
    where: {
      providerId: "github",
      accessToken: { not: null },
      user: { email: "yugthummar001@gmail.com" },
    },
  });
  const fallbackAccount = await prisma.account.findFirst({
    where: { providerId: "github", accessToken: { not: null } },
  });
  const token = currentUserAccount?.accessToken || adminAccount?.accessToken || fallbackAccount?.accessToken;

  if (!token) {
    return [];
  }

  return await getOpenPullRequests(token, owner, repo, "all");
}

export async function triggerManualReview(
  owner: string,
  repo: string,
  prNumber: number
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  // Find repository (admins can trigger review on any repository in the system)
  const isAdmin = isAdminUser(session.user);
  const repository = await prisma.repository.findFirst({
    where: {
      owner: { equals: owner, mode: "insensitive" },
      name: { equals: repo, mode: "insensitive" },
      ...(isAdmin ? {} : { userId: session.user.id }),
    },
  });

  if (!repository) {
    throw new Error(
      `Repository ${owner}/${repo} is not connected to your account.`
    );
  }

  const { performDirectReview } = await import("@/inngest/functions/review");
  return await performDirectReview({
    owner,
    repo,
    prNumber,
    userId: repository.userId,
  });
}
