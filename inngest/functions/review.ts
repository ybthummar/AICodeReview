/* eslint-disable @typescript-eslint/no-explicit-any */
import { inngest } from "../client";
import {
  getPullRequestDiff,
  postReviewComment,
} from "@/module/github/lib/github";
import { retrieveContext } from "@/module/ai/lib/rag";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import prisma from "@/lib/db";
import type { ASTSymbolContext } from "@/types/review/types";

function formatASTContext(symbols: any[]) {
  if (!symbols || symbols.length === 0) return "";

  return symbols
    .slice(0, 5)
    .map((s) => {
      if (s.type === "symbol" || s.symbolName) {
        return `File: ${s.path} | Symbol: ${s.symbolName ?? "unknown"} (${s.symbolType ?? "unknown"}) | Lines: ${s.startLine ?? "?"}-${s.endLine ?? "?"}`;
      } else if (s.content) {
        return `File: ${s.path}\nSnippet:\n${s.content.slice(0, 300)}`;
      }
      return `File: ${s.path}`;
    })
    .join("\n\n");
}

async function generateFastReviewText(prompt: string): Promise<string> {
  const modelsToTry = [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.5-flash",
  ];

  let lastError: unknown;
  for (const modelName of modelsToTry) {
    try {
      const { text } = await generateText({
        model: google(modelName),
        prompt,
      });
      return text;
    } catch (err) {
      console.warn(`Model ${modelName} failed or busy, trying fallback...`);
      lastError = err;
    }
  }

  throw lastError;
}

function buildEmptyDiffReview(title: string, prNumber: number): string {
  return `### 🤖 AI Code Review

#### Code Review Report

**Summary:**
- **Status:** ⚠️ Changes Requested / Empty PR
- The Pull Request #${prNumber} titled **"${title}"** contains an empty code diff (0 files changed, 0 additions, 0 deletions).

#### Review Analysis
- **Reason:** The pull request was likely created from a branch that has already been merged into the base branch or has no new commits pushed yet.
- **Action Required:** Please commit and push your changes to the remote branch, or verify the source and target branch comparison on GitHub.
`;
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
  console.log(`Starting lightning direct PR review for ${owner}/${repo}#${prNumber}`);

  const repository = await prisma.repository.findFirst({
    where: {
      owner: { equals: owner, mode: "insensitive" },
      name: { equals: repo, mode: "insensitive" },
    },
  });

  if (!repository) {
    throw new Error(`Repository ${owner}/${repo} not found in database`);
  }

  // Ensure an existing review record exists in DB with 'pending'
  const existingReview = await prisma.review.findFirst({
    where: {
      repositoryId: repository.id,
      prNumber,
    },
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
        review: "AI Review in progress... Analyzing code changes and repository context.",
        status: "pending",
      },
    });
    reviewRecordId = created.id;
  } else if (existingReview?.status !== "completed") {
    await prisma.review.update({
      where: { id: reviewRecordId },
      data: {
        status: "pending",
        review: "AI Review in progress... Analyzing code changes and repository context.",
      },
    });
  }

  try {
    const account = await prisma.account.findFirst({
      where: {
        userId,
        providerId: "github",
      },
    });

    if (!account?.accessToken) {
      throw new Error("No GitHub access token found for user");
    }

    const { diff, title, description } = await getPullRequestDiff(
      account.accessToken,
      owner,
      repo,
      prNumber
    );

    // Fast-path: Handle empty diffs instantly (< 200ms)
    if (!diff || diff.trim().length === 0) {
      const emptyReview = buildEmptyDiffReview(title, prNumber);

      try {
        await postReviewComment(
          account.accessToken,
          owner,
          repo,
          prNumber,
          emptyReview
        );
      } catch (err) {
        console.error("Failed to post comment to GitHub:", err);
      }

      await prisma.review.update({
        where: { id: reviewRecordId },
        data: {
          prTitle: title,
          review: emptyReview,
          status: "completed",
        },
      });

      return { success: true, review: emptyReview };
    }

    // Update PR title in database
    await prisma.review.update({
      where: { id: reviewRecordId },
      data: { prTitle: title },
    });

    // Retrieve RAG context with a 2.5-second timeout so Pinecone never blocks the AI review
    const query = `PR Title: ${title}\nPR Description: ${description || ""}\nDiff:\n${diff.slice(0, 1500)}`.trim();
    let astContext: ASTSymbolContext[] = [];

    try {
      const astPromise = retrieveContext(query, `${owner}/${repo}`, 5) as Promise<ASTSymbolContext[]>;
      const timeoutPromise = new Promise<ASTSymbolContext[]>((resolve) =>
        setTimeout(() => resolve([]), 2500)
      );
      astContext = await Promise.race([astPromise, timeoutPromise]);
    } catch (err) {
      console.warn("Context retrieval bypassed:", err);
    }

    const formattedASTContext = formatASTContext(astContext);
    const truncatedDiff =
      diff.length > 20000
        ? diff.slice(0, 20000) + "\n\n...[Diff truncated due to length]..."
        : diff;

    const prompt = `
You are a senior software engineer performing a constructive, high-speed code review.

PR METADATA:
Title: ${title}
Description: ${description || "No description provided"}

RELEVANT CODE CONTEXT:
${formattedASTContext || "No indexed symbols"}

DIFF:
\`\`\`diff
${truncatedDiff}
\`\`\`

TASKS:
1. **Summary**: What changed and why (2-3 sentences).
2. **Key Findings**: Architectural, logical, performance, or security issues (if any). Use bullet points.
3. **Suggestions**: Concrete code improvements or snippets.
4. **Conclusion**: Concise verdict (Approve / Request Changes).

Respond in clean, professional GitHub Markdown.
    `;

    // Generate review using the fastest active Gemini model
    const review = await generateFastReviewText(prompt);

    // Post comment to GitHub
    try {
      await postReviewComment(
        account.accessToken,
        owner,
        repo,
        prNumber,
        review
      );
    } catch (err) {
      console.error(
        `Failed to post comment to GitHub for ${owner}/${repo}#${prNumber}:`,
        err
      );
    }

    // Save completed review to the database
    await prisma.review.update({
      where: { id: reviewRecordId },
      data: {
        prTitle: title,
        review,
        status: "completed",
      },
    });

    return { success: true, review };
  } catch (error) {
    console.error(
      `Direct review execution failed for ${owner}/${repo}#${prNumber}:`,
      error
    );

    const errorMessage =
      error instanceof Error ? error.message : "Review generation failed";

    await prisma.review.update({
      where: { id: reviewRecordId },
      data: {
        review: `Error performing AI review: ${errorMessage}`,
        status: "failed",
      },
    });

    throw error;
  }
}

export const generateReview = inngest.createFunction(
  { id: "generate-review", concurrency: 10 },
  { event: "pr.review.requested" },

  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data;

    const { diff, title, description, token } = await step.run(
      "fetch-pr-data",
      async () => {
        const account = await prisma.account.findFirst({
          where: {
            userId,
            providerId: "github",
          },
        });

        if (!account?.accessToken) {
          throw new Error("No GitHub access token found");
        }

        const data = await getPullRequestDiff(
          account.accessToken,
          owner,
          repo,
          prNumber
        );

        return { ...data, token: account.accessToken };
      }
    );

    // Fast-path: Handle empty diff immediately
    if (!diff || diff.trim().length === 0) {
      const emptyReview = buildEmptyDiffReview(title, prNumber);

      await step.run("post-empty-comment", async () => {
        await postReviewComment(token, owner, repo, prNumber, emptyReview);
      });

      await step.run("save-empty-review", async () => {
        const repository = await prisma.repository.findFirst({
          where: {
            owner: { equals: owner, mode: "insensitive" },
            name: { equals: repo, mode: "insensitive" },
          },
        });

        if (repository) {
          const existing = await prisma.review.findFirst({
            where: { repositoryId: repository.id, prNumber },
          });

          if (existing) {
            await prisma.review.update({
              where: { id: existing.id },
              data: { prTitle: title, review: emptyReview, status: "completed" },
            });
          } else {
            await prisma.review.create({
              data: {
                repositoryId: repository.id,
                prNumber,
                prTitle: title,
                prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
                review: emptyReview,
                status: "completed",
              },
            });
          }
        }
      });

      return { success: true };
    }

    const astContext = await step.run("retrieve-ast-context", async () => {
      const query = `PR Title: ${title}\nPR Description: ${description || ""}\nDiff:\n${diff.slice(0, 1500)}`.trim();

      try {
        const astPromise = retrieveContext(query, `${owner}/${repo}`, 5) as Promise<ASTSymbolContext[]>;
        const timeoutPromise = new Promise<ASTSymbolContext[]>((resolve) =>
          setTimeout(() => resolve([]), 2500)
        );
        return await Promise.race([astPromise, timeoutPromise]);
      } catch (err) {
        console.warn("RAG retrieval skipped:", err);
        return [] as ASTSymbolContext[];
      }
    });

    const review = await step.run("generate-ai-review", async () => {
      const formattedASTContext = formatASTContext(astContext);
      const truncatedDiff =
        diff.length > 20000
          ? diff.slice(0, 20000) + "\n\n...[Diff truncated due to size]..."
          : diff;

      const prompt = `
You are a senior software engineer performing a professional code review.

PR METADATA:
Title: ${title}
Description: ${description || "No description provided"}

AST CONTEXT:
${formattedASTContext || "No relevant symbols found"}

CODE CHANGES:
\`\`\`diff
${truncatedDiff}
\`\`\`

TASKS:
1. Summary of changes.
2. Bugs, performance, or security concerns.
3. Concrete recommendations with code snippets.
4. Overall verdict.

Respond in clear, professional Markdown.
      `;

      return await generateFastReviewText(prompt);
    });

    await step.run("post-comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, review);
    });

    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner: { equals: owner, mode: "insensitive" },
          name: { equals: repo, mode: "insensitive" },
        },
      });

      if (!repository) {
        return;
      }

      const existing = await prisma.review.findFirst({
        where: {
          repositoryId: repository.id,
          prNumber,
        },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        await prisma.review.update({
          where: { id: existing.id },
          data: {
            prTitle: title,
            review,
            status: "completed",
          },
        });
      } else {
        await prisma.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review,
            status: "completed",
          },
        });
      }
    });

    return { success: true };
  }
);
