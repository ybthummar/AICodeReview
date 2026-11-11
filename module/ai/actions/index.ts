import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { getPullRequestDiff } from "@/module/github/lib/github";
import { performDirectReview } from "@/inngest/functions/review";
import { loadReviewConfig } from "@/module/review-rules/lib/load";
import { consumeUsage, QuotaExceededError, refundUsage } from "@/module/billing/lib/usage";
import { parseReviewContent } from "@/module/review/lib/insights";
import { resolveReviewToken } from "@/module/team/lib/access";

const PENDING_TEXT =
  "AI Review in progress... Fetching repository AST context and generating insights.";

// Never overwrites a completed review: its insights are needed for finding history.
async function recordFailure(
  repositoryId: string,
  owner: string,
  repo: string,
  prNumber: number,
  title: string,
  message: string
) {
  const existing = await prisma.review.findFirst({
    where: { repositoryId, prNumber },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    if (existing.status === "completed" && parseReviewContent(existing.review).insights) return;

    await prisma.review.update({
      where: { id: existing.id },
      data: { review: `Error: ${message}`, status: "failed" },
    });
    return;
  }

  await prisma.review.create({
    data: {
      repositoryId,
      prNumber,
      prTitle: title,
      prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
      review: `Error: ${message}`,
      status: "failed",
    },
  });
}

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  options: { source?: "webhook" | "manual" | "command" } = {}
): Promise<{ success: boolean; message: string }> {
  let repositoryId: string | null = null;
  let repositoryOwnerId: string | null = null;
  let consumed = false;
  let dispatched = false;

  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner: { equals: owner, mode: "insensitive" },
        name: { equals: repo, mode: "insensitive" },
      },
      select: { id: true, userId: true },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found in database`);
    }

    repositoryId = repository.id;
    repositoryOwnerId = repository.userId;

    // GitHub retries deliveries and a repo webhook can coexist with the App webhook.
    if (options.source !== "manual") {
      const running = await prisma.review.findFirst({
        where: {
          repositoryId: repository.id,
          prNumber,
          status: "pending",
          updatedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
        },
        select: { id: true },
      });

      if (running) {
        return { success: true, message: "Skipped: a review is already running for this pull request" };
      }
    }

    const config = await loadReviewConfig(repository.id);
    if (options.source === "webhook" && !config.autoReview) {
      return {
        success: true,
        message: "Skipped: automatic reviews are disabled for this repository",
      };
    }

    const token = await resolveReviewToken(repository.userId, owner);
    if (!token) {
      throw new Error("No Github access token found for repository owner or admin");
    }

    // Validate that the PR exists on GitHub and get its title
    const { title } = await getPullRequestDiff(token, owner, repo, prNumber);
    console.log(`Reviewing ${owner}/${repo}#${prNumber}: "${title}"`);

    try {
      await consumeUsage(repository.userId, "reviews");
      consumed = true;
    } catch (quotaError) {
      if (quotaError instanceof QuotaExceededError) {
        await recordFailure(repository.id, owner, repo, prNumber, title, quotaError.message);
        return { success: false, message: quotaError.message };
      }
      throw quotaError;
    }

    const existing = await prisma.review.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      await prisma.review.update({
        where: { id: existing.id },
        data: {
          prTitle: title,
          status: "pending",
          ...(existing.status === "completed" ? {} : { review: PENDING_TEXT }),
        },
      });
    } else {
      await prisma.review.create({
        data: {
          repositoryId: repository.id,
          prNumber,
          prTitle: title,
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review: PENDING_TEXT,
          status: "pending",
        },
      });
    }

    let queuedWithInngest = false;
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "pr.review.requested",
          data: { owner, repo, prNumber, userId: repository.userId },
        });
        queuedWithInngest = true;
        console.log(`Queued review via Inngest for ${owner}/${repo}#${prNumber}`);
      } catch (inngestError) {
        console.warn("Inngest dispatch failed, falling back to direct review execution:", inngestError);
      }
    }

    dispatched = true;

    if (!queuedWithInngest) {
      console.log(`Running direct review execution for ${owner}/${repo}#${prNumber}`);
      performDirectReview({
        owner,
        repo,
        prNumber,
        userId: repository.userId,
      }).catch((directErr) => {
        console.error(`Direct review execution failed for ${owner}/${repo}#${prNumber}:`, directErr);
      });
    }

    return {
      success: true,
      message: queuedWithInngest ? "Review Queued" : "Review Started",
    };
  } catch (error) {
    console.error(`reviewPullRequest failed for ${owner}/${repo}#${prNumber}:`, error);

    if (consumed && !dispatched && repositoryOwnerId) {
      await refundUsage(repositoryOwnerId, "reviews");
    }

    try {
      if (repositoryId) {
        await recordFailure(
          repositoryId,
          owner,
          repo,
          prNumber,
          "Failed to fetch PR",
          error instanceof Error ? error.message : "Unknown Error"
        );
      }
    } catch (dbError) {
      console.error("Database Error:", dbError);
    }

    throw error;
  }
}
