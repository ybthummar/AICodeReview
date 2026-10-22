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

export async function getReviews(scope: "all" | "mine" = "all") {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const isAdmin = isAdminUser(session.user);

  // By default ('all'), display reviews across all connected repositories in the workspace so anyone viewing the app can see the code reviews.
  // If the user specifies 'mine' and is not an admin, filter to only their own repositories.
  const whereClause =
    !isAdmin && scope === "mine"
      ? {
          repository: {
            userId: session.user.id,
          },
        }
      : {};

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

export async function getConnectedReposPullRequests(): Promise<ConnectedRepoPR[]> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const isAdmin = isAdminUser(session.user);

  // Fetch connected repositories
  const repositories = await prisma.repository.findMany({
    where: isAdmin ? {} : { userId: session.user.id },
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
