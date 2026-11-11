"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getOpenPullRequests, GitHubPullRequest } from "@/module/github/lib/github";
import {
  applyFindingStatus,
  buildInsightsOverview,
  FINDING_STATUSES,
  parseReviewContent,
  serializeReviewContent,
  setFindingFixUrl,
  type FindingStatus,
  type ReviewInsightsOverview,
  type ReviewVerdict,
  type RiskLevel,
} from "@/module/review/lib/insights";
import { publishQualityGate } from "@/module/review/lib/pipeline";
import { applySuggestedFix, AutoFixError, type AutoFixMode } from "@/module/github/lib/autofix";
import { recordAudit } from "@/module/audit/lib/audit";
import { consumeUsage, QuotaExceededError } from "@/module/billing/lib/usage";
import {
  accessibleRepositoryWhere,
  findAccessibleRepository,
  hasRole,
  requireRepositoryToken,
  resolveReviewToken,
  roleForRepository,
  viewerMembershipInclude,
} from "@/module/team/lib/access";

export interface ConnectedRepoPR {
  repositoryId: string;
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
  canReview: boolean;
}

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function getReviews(scope: "mine" | "all" = "mine") {
  const session = await requireSession();
  const isAdmin = isAdminUser(session.user);

  // Reviews of repositories the user owns or can reach through a workspace.
  // Only admins who explicitly choose scope === "all" can inspect global reviews.
  const whereClause =
    isAdmin && scope === "all"
      ? {}
      : { repository: accessibleRepositoryWhere(session.user.id) };

  const reviews = await prisma.review.findMany({
    where: whereClause,
    include: {
      repository: {
        include: viewerMembershipInclude(session.user.id),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return reviews.map((review) => ({
    ...review,
    canEdit: hasRole(roleForRepository(review.repository, session.user), "MEMBER"),
  }));
}

export async function getReviewInsightsOverview(): Promise<ReviewInsightsOverview> {
  const session = await requireSession();

  const reviews = await prisma.review.findMany({
    where: {
      status: "completed",
      repository: accessibleRepositoryWhere(session.user.id),
    },
    select: {
      id: true,
      prNumber: true,
      prTitle: true,
      review: true,
      createdAt: true,
      repository: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const overview = buildInsightsOverview(
    reviews.map((r) => ({
      id: r.id,
      prNumber: r.prNumber,
      prTitle: r.prTitle,
      repoFullName: r.repository.fullName,
      createdAt: r.createdAt,
      review: r.review,
    }))
  );

  const votes = await prisma.findingFeedback.groupBy({
    by: ["vote"],
    where: { repository: accessibleRepositoryWhere(session.user.id) },
    _count: { _all: true },
  });

  for (const group of votes) {
    if (group.vote === "up") overview.feedback.up = group._count._all;
    if (group.vote === "down") overview.feedback.down = group._count._all;
  }

  return overview;
}

export async function submitFindingFeedback(
  reviewId: string,
  findingId: string,
  vote: "up" | "down"
): Promise<ActionResult<{ vote: "up" | "down" | null }>> {
  try {
    const session = await requireSession();

    if (vote !== "up" && vote !== "down") {
      return fail(new Error("Invalid vote"));
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { repositoryId: true, review: true, status: true },
    });
    if (!review || review.status !== "completed") return fail(new Error("Review not found"));

    const access = await findAccessibleRepository(session.user, { id: review.repositoryId });
    if (!access) return fail(new Error("You do not have access to this review."));

    const finding = parseReviewContent(review.review).insights?.findings.find((f) => f.id === findingId);
    if (!finding) return fail(new Error("Finding not found"));

    const where = {
      reviewId_findingId_userId: { reviewId, findingId, userId: session.user.id },
    };
    const existing = await prisma.findingFeedback.findUnique({ where, select: { vote: true } });

    // Voting the same way twice withdraws the vote.
    if (existing?.vote === vote) {
      await prisma.findingFeedback.delete({ where });
      return ok({ vote: null });
    }

    await prisma.findingFeedback.upsert({
      where,
      update: { vote },
      create: {
        repositoryId: review.repositoryId,
        reviewId,
        findingId,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        vote,
        userId: session.user.id,
      },
    });

    return ok({ vote });
  } catch (error) {
    console.error("Failed to save feedback:", error);
    return fail(error, "Could not save your feedback.");
  }
}

export async function getMyFeedback(reviewIds: string[]): Promise<Record<string, "up" | "down">> {
  const session = await requireSession();
  if (reviewIds.length === 0) return {};

  const rows = await prisma.findingFeedback.findMany({
    where: { userId: session.user.id, reviewId: { in: reviewIds.slice(0, 200) } },
    select: { reviewId: true, findingId: true, vote: true },
  });

  return Object.fromEntries(
    rows.map((row) => [`${row.reviewId}:${row.findingId}`, row.vote as "up" | "down"])
  );
}

export async function applyFindingFix(
  reviewId: string,
  findingId: string,
  mode: AutoFixMode
): Promise<ActionResult<{ url: string; mode: AutoFixMode }>> {
  try {
    const session = await requireSession();

    if (mode !== "pull_request" && mode !== "commit") {
      return fail(new Error("Invalid fix mode"));
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, repositoryId: true, prNumber: true, review: true, status: true },
    });
    if (!review || review.status !== "completed") return fail(new Error("Review not found"));

    const access = await findAccessibleRepository(session.user, { id: review.repositoryId }, "MEMBER");
    if (!access) return fail(new Error("You need member access to apply fixes."));

    const parsed = parseReviewContent(review.review);
    const finding = parsed.insights?.findings.find((f) => f.id === findingId);

    if (!parsed.insights || !finding) return fail(new Error("Finding not found"));
    if (finding.status !== "open") return fail(new Error("This finding is already closed."));
    if (!finding.fix || !finding.original || !finding.file || !finding.line) {
      return fail(new Error("This finding has no safe automatic fix."));
    }

    const { repository } = access;
    const token = await requireRepositoryToken(repository.userId, repository.owner);

    const result = await applySuggestedFix({
      token,
      owner: repository.owner,
      repo: repository.name,
      prNumber: review.prNumber,
      path: finding.file,
      line: finding.line,
      original: finding.original,
      fix: finding.fix,
      title: finding.title,
      mode,
    });

    // A direct commit resolves the finding; a fix pull request stays open until it is merged.
    const updated =
      mode === "commit"
        ? applyFindingStatus(parsed.insights, findingId, "resolved")
        : setFindingFixUrl(parsed.insights, findingId, result.url);

    if (updated) {
      await prisma.review.update({
        where: { id: review.id },
        data: { review: serializeReviewContent(parsed.markdown, updated) },
      });
    }

    await recordAudit({
      userId: session.user.id,
      action: "finding.autofix_applied",
      targetType: "review",
      targetId: review.id,
      summary: `${mode === "commit" ? "Committed" : "Opened a pull request for"} a fix: ${finding.title}`,
      metadata: { url: result.url, repository: repository.fullName },
    });

    return ok(result);
  } catch (error) {
    if (error instanceof AutoFixError) return fail(error);
    console.error("Auto-fix failed:", error);
    return fail(error, "GitHub rejected the change. Check that the token has write access to this repository.");
  }
}

export async function getConnectedReposPullRequests(
  scope: "mine" | "all" = "mine"
): Promise<ConnectedRepoPR[]> {
  const session = await requireSession();
  const isAdmin = isAdminUser(session.user);

  const repositories = await prisma.repository.findMany({
    where: isAdmin && scope === "all" ? {} : accessibleRepositoryWhere(session.user.id),
    include: {
      user: {
        include: {
          accounts: {
            where: { providerId: "github" },
          },
        },
      },
      reviews: true,
      ...viewerMembershipInclude(session.user.id),
    },
  });

  if (repositories.length === 0) {
    return [];
  }

  const prs: ConnectedRepoPR[] = [];

  await Promise.allSettled(
    repositories.map(async (repo) => {
      const token = await resolveReviewToken(repo.userId, repo.owner);
      if (!token) return;

      const canReview = hasRole(roleForRepository(repo, session.user), "MEMBER");
      const repoPRs = await getOpenPullRequests(token, repo.owner, repo.name, "all");

      for (const pr of repoPRs) {
        const matchingReview = repo.reviews.find((r) => r.prNumber === pr.number);
        prs.push({
          repositoryId: repo.id,
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
          canReview,
        });
      }
    })
  );

  // Open PRs needing review first, then open reviewed PRs, then closed PRs
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
  const session = await requireSession();

  const access = await findAccessibleRepository(session.user, { owner, name: repo });
  if (!access) {
    return [];
  }

  const token = await resolveReviewToken(access.repository.userId, access.repository.owner);
  if (!token) {
    return [];
  }

  return await getOpenPullRequests(token, access.repository.owner, access.repository.name, "all");
}

export async function triggerManualReview(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { owner, name: repo }, "MEMBER");
    if (!access) {
      return fail(
        new Error(`Repository ${owner}/${repo} is not connected to your account or you only have view access.`)
      );
    }

    // Reviews are billed to whoever connected the repository.
    await consumeUsage(access.repository.userId, "reviews");

    const { performDirectReview } = await import("@/inngest/functions/review");
    await performDirectReview({
      owner: access.repository.owner,
      repo: access.repository.name,
      prNumber,
      userId: access.repository.userId,
    });

    return ok(null);
  } catch (error) {
    if (error instanceof QuotaExceededError) return fail(error);
    console.error("Manual review failed:", error);
    return fail(error, "The AI review failed. Please try again.");
  }
}

export async function updateFindingStatus(
  reviewId: string,
  findingId: string,
  status: FindingStatus
): Promise<
  ActionResult<{ verdict: ReviewVerdict; riskLevel: RiskLevel; riskScore: number }>
> {
  try {
    const session = await requireSession();

    if (!FINDING_STATUSES.includes(status)) {
      return fail(new Error("Invalid finding status"));
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, repositoryId: true, review: true, status: true },
    });

    if (!review || review.status !== "completed") {
      return fail(new Error("Review not found"));
    }

    const access = await findAccessibleRepository(
      session.user,
      { id: review.repositoryId },
      "MEMBER"
    );
    if (!access) {
      return fail(new Error("You do not have permission to update this review."));
    }

    const parsed = parseReviewContent(review.review);
    if (!parsed.insights) {
      return fail(new Error("This review has no structured findings."));
    }

    const updated = applyFindingStatus(parsed.insights, findingId, status);
    if (!updated) {
      return fail(new Error("Finding not found"));
    }

    await prisma.review.update({
      where: { id: review.id },
      data: { review: serializeReviewContent(parsed.markdown, updated) },
    });

    // Keep the GitHub commit status in sync once blocking findings are cleared or reopened.
    if (updated.headSha) {
      const token = await resolveReviewToken(access.repository.userId, access.repository.owner);
      if (token) {
        await publishQualityGate(
          access.repository.userId,
          token,
          access.repository.owner,
          access.repository.name,
          updated.headSha,
          updated
        );
      }
    }

    return ok({
      verdict: updated.verdict,
      riskLevel: updated.riskLevel,
      riskScore: updated.riskScore,
    });
  } catch (error) {
    console.error("Failed to update finding status:", error);
    return fail(error, "Could not update the finding.");
  }
}
