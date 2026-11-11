import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { accessibleRepositoryWhere } from "@/module/team/lib/access";
import type { ExportReview } from "@/module/reports/lib/export";

const MAX_REVIEWS = 1000;

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// Only repositories the signed-in user owns or reaches through a workspace are ever exported.
export async function loadExportReviews(
  userId: string,
  options: { repositoryId?: string | null; since?: Date } = {}
): Promise<ExportReview[]> {
  const reviews = await prisma.review.findMany({
    where: {
      status: "completed",
      ...(options.since ? { createdAt: { gte: options.since } } : {}),
      repository: {
        AND: [
          accessibleRepositoryWhere(userId),
          options.repositoryId ? { id: options.repositoryId } : {},
        ],
      },
    },
    select: {
      id: true,
      prNumber: true,
      prTitle: true,
      prUrl: true,
      review: true,
      createdAt: true,
      repository: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_REVIEWS,
  });

  return reviews.map((r) => ({
    id: r.id,
    repoFullName: r.repository.fullName,
    prNumber: r.prNumber,
    prTitle: r.prTitle,
    prUrl: r.prUrl,
    createdAt: r.createdAt,
    review: r.review,
  }));
}
