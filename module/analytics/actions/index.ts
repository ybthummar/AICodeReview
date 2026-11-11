"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { listClosedPullRequests } from "@/module/github/lib/github";
import { accessibleRepositoryWhere, requireRepositoryToken } from "@/module/team/lib/access";
import {
  buildEngineeringAnalytics,
  type AnalyticsPullRequest,
  type EngineeringAnalytics,
} from "@/module/analytics/lib/metrics";

const ALLOWED_WINDOWS = [7, 30, 90] as const;
const MAX_REPOSITORIES = 15;

export async function getEngineeringAnalytics(
  windowDays: number = 30
): Promise<ActionResult<EngineeringAnalytics>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return fail(new Error("Unauthorized"));

    const days = ALLOWED_WINDOWS.find((d) => d === windowDays) ?? 30;
    const since = new Date(Date.now() - (days + 30) * 24 * 60 * 60 * 1000);

    const repositories = await prisma.repository.findMany({
      where: isAdminUser(session.user) ? {} : accessibleRepositoryWhere(session.user.id),
      select: { id: true, owner: true, name: true, fullName: true, userId: true },
      orderBy: { createdAt: "desc" },
      take: MAX_REPOSITORIES,
    });

    if (repositories.length === 0) {
      return ok(buildEngineeringAnalytics([], [], days));
    }

    const skipped: string[] = [];

    const pullRequestGroups = await Promise.all(
      repositories.map(async (repository): Promise<AnalyticsPullRequest[]> => {
        try {
          const token = await requireRepositoryToken(repository.userId, repository.owner);
          const closed = await listClosedPullRequests(token, repository.owner, repository.name);

          return closed.map((pr) => ({ ...pr, repoFullName: repository.fullName }));
        } catch (error) {
          console.warn(`Analytics skipped ${repository.fullName}:`, error);
          skipped.push(repository.fullName);
          return [];
        }
      })
    );

    const reviews = await prisma.review.findMany({
      where: {
        repositoryId: { in: repositories.map((r) => r.id) },
        status: "completed",
        createdAt: { gte: since },
      },
      select: {
        prNumber: true,
        review: true,
        createdAt: true,
        repository: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 600,
    });

    return ok(
      buildEngineeringAnalytics(
        pullRequestGroups.flat(),
        reviews.map((r) => ({
          repoFullName: r.repository.fullName,
          prNumber: r.prNumber,
          createdAt: r.createdAt,
          review: r.review,
        })),
        days,
        new Date(),
        skipped
      )
    );
  } catch (error) {
    console.error("Failed to build analytics:", error);
    return fail(error, "Could not load engineering analytics.");
  }
}
