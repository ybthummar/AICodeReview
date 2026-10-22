"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";

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
