import { inngest } from "../client";
import { getPullRequestDiff } from "@/module/github/lib/github";
import { retrieveContext } from "@/module/ai/lib/rag";
import { generateStructuredReview } from "@/module/ai/lib/review-generator";
import {
  finalizeInsights,
  loadPreviousInsights,
  MAX_STORED_DIFF_CHARS,
  notifyReviewCompleted,
  postInlineFindings,
  postMainComment,
  prepareDiff,
  publishQualityGate,
} from "@/module/review/lib/pipeline";
import { serializeReviewContent } from "@/module/review/lib/insights";
import { loadReviewConfig } from "@/module/review-rules/lib/load";
import { refundUsage } from "@/module/billing/lib/usage";
import { resolveReviewToken } from "@/module/team/lib/access";
import prisma from "@/lib/db";
import type { ASTSymbolContext } from "@/types/review/types";

const PENDING_TEXT =
  "AI Review in progress... Analyzing code changes and repository context.";

async function retrieveAstContext(
  owner: string,
  repo: string,
  title: string,
  description: string,
  diff: string
): Promise<ASTSymbolContext[]> {
  const query = `PR Title: ${title}\nPR Description: ${description || ""}\nDiff:\n${diff.slice(0, 1500)}`.trim();

  // Pinecone must never block the review, so retrieval is capped at 2.5 seconds.
  try {
    const search = retrieveContext(query, `${owner}/${repo}`, 5) as Promise<ASTSymbolContext[]>;
    const timeout = new Promise<ASTSymbolContext[]>((resolve) =>
      setTimeout(() => resolve([]), 2500)
    );
    return await Promise.race([search, timeout]);
  } catch (err) {
    console.warn("Context retrieval bypassed:", err);
    return [];
  }
}

async function sendReviewEmail(
  userId: string,
  owner: string,
  repo: string,
  prNumber: number,
  prTitle: string,
  markdown: string
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user?.email) {
      const { sendReviewNotificationEmail } = await import("@/lib/mail");
      await sendReviewNotificationEmail({
        to: user.email,
        repoName: `${owner}/${repo}`,
        prNumber,
        prTitle,
        reviewSnippet: markdown,
      });
    }
  } catch (mailErr) {
    console.warn("Review notification email skipped:", mailErr);
  }
}

export async function performDirectReview({
  owner,
  repo,
  prNumber,
  userId,
}: {
  owner: string;
  repo: string;
  prNumber: number;
  userId: string;
}) {
  console.log(`Starting direct PR review for ${owner}/${repo}#${prNumber}`);

  const repository = await prisma.repository.findFirst({
    where: {
      owner: { equals: owner, mode: "insensitive" },
      name: { equals: repo, mode: "insensitive" },
    },
  });

  if (!repository) {
    throw new Error(`Repository ${owner}/${repo} not found in database`);
  }

  const existingReview = await prisma.review.findFirst({
    where: { repositoryId: repository.id, prNumber },
    orderBy: { createdAt: "desc" },
  });

  let reviewRecordId = existingReview?.id;

  if (!reviewRecordId) {
    const created = await prisma.review.create({
      data: {
        repositoryId: repository.id,
        prNumber,
        prTitle: `PR #${prNumber}`,
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        review: PENDING_TEXT,
        status: "pending",
      },
    });
    reviewRecordId = created.id;
  } else {
    // A completed review keeps its text so finding history can be carried into the new run.
    await prisma.review.update({
      where: { id: reviewRecordId },
      data: {
        status: "pending",
        ...(existingReview?.status === "completed" ? {} : { review: PENDING_TEXT }),
      },
    });
  }

  try {
    const token = await resolveReviewToken(userId, owner);
    if (!token) {
      throw new Error("No GitHub access token found for user or admin");
    }

    const config = await loadReviewConfig(repository.id);
    const pr = await getPullRequestDiff(token, owner, repo, prNumber);

    await prisma.review.update({
      where: { id: reviewRecordId },
      data: { prTitle: pr.title },
    });

    const prepared = prepareDiff(pr.diff, config);
    const [previous, astContext] = await Promise.all([
      loadPreviousInsights(repository.id, prNumber),
      retrieveAstContext(owner, repo, pr.title, pr.description, prepared.diff),
    ]);

    const generated = await generateStructuredReview({
      owner,
      repo,
      prNumber,
      title: pr.title,
      description: pr.description,
      headRef: pr.headRef,
      baseRef: pr.baseRef,
      commitsSummary: pr.commitsSummary,
      filesSummary: pr.filesSummary,
      diff: prepared.diff,
      astContext,
      config,
    });

    const insights = await finalizeInsights({
      insights: generated.insights,
      files: prepared.files,
      scanFiles: prepared.allFiles,
      config,
      previous,
      headSha: pr.headSha,
      repositoryId: repository.id,
    });

    try {
      await postMainComment(token, owner, repo, prNumber, generated.markdown, insights);
    } catch (err) {
      console.error(`Failed to post comment to GitHub for ${owner}/${repo}#${prNumber}:`, err);
    }

    await postInlineFindings({
      token,
      owner,
      repo,
      prNumber,
      headSha: pr.headSha,
      insights,
      previous,
      files: prepared.files,
      config,
    });
    await publishQualityGate(userId, token, owner, repo, pr.headSha, insights);

    await prisma.review.update({
      where: { id: reviewRecordId },
      data: {
        prTitle: pr.title,
        review: serializeReviewContent(generated.markdown, insights),
        status: "completed",
      },
    });

    await sendReviewEmail(userId, owner, repo, prNumber, pr.title, generated.markdown);
    await notifyReviewCompleted({ userId, owner, repo, prNumber, prTitle: pr.title, insights });

    return { success: true };
  } catch (error) {
    console.error(`Direct review execution failed for ${owner}/${repo}#${prNumber}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Review generation failed";

    await prisma.review.update({
      where: { id: reviewRecordId },
      data: {
        review: `Error performing AI review: ${errorMessage}`,
        status: "failed",
      },
    });
    await refundUsage(repository.userId, "reviews");

    throw error;
  }
}

export const generateReview = inngest.createFunction(
  {
    id: "generate-review",
    concurrency: 10,
    onFailure: async ({ event, error }) => {
      const { owner, repo, prNumber } = event.data.event.data;

      const repository = await prisma.repository.findFirst({
        where: {
          owner: { equals: owner, mode: "insensitive" },
          name: { equals: repo, mode: "insensitive" },
        },
      });
      if (!repository) return;

      const updated = await prisma.review.updateMany({
        where: { repositoryId: repository.id, prNumber, status: "pending" },
        data: {
          review: `Error performing AI review: ${error.message}`,
          status: "failed",
        },
      });

      if (updated.count > 0) {
        await refundUsage(repository.userId, "reviews");
      }
    },
  },
  { event: "pr.review.requested" },

  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data;

    // Tokens are resolved inside each step so they are never persisted in step output.
    const pr = await step.run("fetch-pr-data", async () => {
      const token = await resolveReviewToken(userId, owner);
      if (!token) {
        throw new Error("No GitHub access token found");
      }

      const repository = await prisma.repository.findFirst({
        where: {
          owner: { equals: owner, mode: "insensitive" },
          name: { equals: repo, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!repository) {
        throw new Error(`Repository ${owner}/${repo} not found in database`);
      }

      const [data, config] = await Promise.all([
        getPullRequestDiff(token, owner, repo, prNumber),
        loadReviewConfig(repository.id),
      ]);

      return {
        ...data,
        diff: data.diff.slice(0, MAX_STORED_DIFF_CHARS),
        config,
        repositoryId: repository.id,
      };
    });

    const astContext = await step.run("retrieve-ast-context", async () => {
      const prepared = prepareDiff(pr.diff, pr.config);
      return await retrieveAstContext(owner, repo, pr.title, pr.description, prepared.diff);
    });

    const generated = await step.run("generate-ai-review", async () => {
      const prepared = prepareDiff(pr.diff, pr.config);

      return await generateStructuredReview({
        owner,
        repo,
        prNumber,
        title: pr.title,
        description: pr.description,
        headRef: pr.headRef,
        baseRef: pr.baseRef,
        commitsSummary: pr.commitsSummary,
        filesSummary: pr.filesSummary,
        diff: prepared.diff,
        astContext,
        config: pr.config,
      });
    });

    const finalized = await step.run("finalize-insights", async () => {
      const prepared = prepareDiff(pr.diff, pr.config);
      const previous = await loadPreviousInsights(pr.repositoryId, prNumber);

      const insights = await finalizeInsights({
        insights: generated.insights,
        files: prepared.files,
        scanFiles: prepared.allFiles,
        config: pr.config,
        previous,
        headSha: pr.headSha,
        repositoryId: pr.repositoryId,
      });

      return { insights, previous };
    });

    await step.run("post-comment", async () => {
      const token = await resolveReviewToken(userId, owner);
      if (!token) throw new Error("No GitHub access token found");

      await postMainComment(token, owner, repo, prNumber, generated.markdown, finalized.insights);
    });

    await step.run("post-inline-comments", async () => {
      const token = await resolveReviewToken(userId, owner);
      if (!token) return 0;

      return await postInlineFindings({
        token,
        owner,
        repo,
        prNumber,
        headSha: pr.headSha,
        insights: finalized.insights,
        previous: finalized.previous,
        files: prepareDiff(pr.diff, pr.config).files,
        config: pr.config,
      });
    });

    await step.run("quality-gate", async () => {
      const token = await resolveReviewToken(userId, owner);
      if (!token) return;

      await publishQualityGate(userId, token, owner, repo, pr.headSha, finalized.insights);
    });

    await step.run("save-review", async () => {
      const review = serializeReviewContent(generated.markdown, finalized.insights);

      const existing = await prisma.review.findFirst({
        where: { repositoryId: pr.repositoryId, prNumber },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        await prisma.review.update({
          where: { id: existing.id },
          data: { prTitle: pr.title, review, status: "completed" },
        });
      } else {
        await prisma.review.create({
          data: {
            repositoryId: pr.repositoryId,
            prNumber,
            prTitle: pr.title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review,
            status: "completed",
          },
        });
      }
    });

    await step.run("notify", async () => {
      await sendReviewEmail(userId, owner, repo, prNumber, pr.title, generated.markdown);
      await notifyReviewCompleted({
        userId,
        owner,
        repo,
        prNumber,
        prTitle: pr.title,
        insights: finalized.insights,
      });
    });

    return { success: true };
  }
);
