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

    let token = account?.accessToken;
    if (!token) {
      // Prioritize admin account with verified active token
      const adminAcc = await prisma.account.findFirst({
        where: {
          providerId: "github",
          accessToken: { not: null },
          user: { email: "yugthummar001@gmail.com" },
        },
      });
      token = adminAcc?.accessToken || undefined;

      if (!token) {
        const fallback = await prisma.account.findFirst({
          where: {
            providerId: "github",
            accessToken: { not: null },
          },
        });
        token = fallback?.accessToken || undefined;
      }
    }

    if (!token) {
      throw new Error("No GitHub access token found for user or admin");
    }

    const { diff, title, description, headRef, baseRef, filesSummary, commitsSummary } = await getPullRequestDiff(
      token,
      owner,
      repo,
      prNumber
    );

    // Update PR title in database immediately
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
Repository: ${owner}/${repo}
PR Number: #${prNumber}
Title: ${title}
Description: ${description || "No description provided"}
${headRef && baseRef ? `Branch Tracking: ${headRef} -> ${baseRef}` : ""}
${commitsSummary ? `\nCOMMITS ON THIS PR:\n${commitsSummary}\n` : ""}
${filesSummary ? `\nFILES CHANGED:\n${filesSummary}\n` : ""}

RELEVANT CODE CONTEXT:
${formattedASTContext || "No indexed symbols"}

DIFF / CODE CHANGES:
${
  truncatedDiff && truncatedDiff.trim().length > 0
    ? `\`\`\`diff\n${truncatedDiff}\n\`\`\``
    : "Note: Direct diff comparison shows 0 net file changes between source and target branches (e.g. reverse merge, branch sync, or fast-forward integration). Please evaluate the branch architecture, commit synchronization, and CI/CD workflow implications."
}

TASKS:
1. **Summary**: What changed, architectural intent, and branch relationship (2-3 sentences).
2. **Key Findings**: Architectural, logical, performance, or security observations. Use bullet points.
3. **Suggestions**: Concrete code improvements, testing guidance, or branch hygiene recommendations.
4. **Conclusion**: Concise verdict (Approve / Request Changes / Informational).

Respond in clean, professional GitHub Markdown.
    `;

    // Generate review using the fastest active Gemini model
    const review = await generateFastReviewText(prompt);

    // Post comment to GitHub
    try {
      await postReviewComment(
        token,
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

    const { diff, title, description, token, headRef, baseRef, filesSummary, commitsSummary } = await step.run(
      "fetch-pr-data",
      async (): Promise<{ diff: string; title: string; description: string; token: string; headRef: string; baseRef: string; filesSummary: string; commitsSummary: string }> => {
        const account = await prisma.account.findFirst({
          where: {
            userId,
            providerId: "github",
          },
        });

        let ghToken: string | null = account?.accessToken ?? null;
        if (!ghToken) {
          const adminAcc = await prisma.account.findFirst({
            where: {
              providerId: "github",
              accessToken: { not: null },
              user: { email: "yugthummar001@gmail.com" },
            },
          });
          ghToken = adminAcc?.accessToken ?? null;
        }

        if (!ghToken) {
          const fallback = await prisma.account.findFirst({
            where: {
              providerId: "github",
              accessToken: { not: null },
            },
          });
          ghToken = fallback?.accessToken ?? null;
        }

        if (!ghToken) {
          throw new Error("No GitHub access token found");
        }

        const data = await getPullRequestDiff(
          ghToken,
          owner,
          repo,
          prNumber
        );

        return { ...data, token: ghToken };
      }
    );



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
You are a senior software engineer performing a constructive, high-speed code review.

PR METADATA:
Repository: ${owner}/${repo}
PR Number: #${prNumber}
Title: ${title}
Description: ${description || "No description provided"}
${headRef && baseRef ? `Branch Tracking: ${headRef} -> ${baseRef}` : ""}
${commitsSummary ? `\nCOMMITS ON THIS PR:\n${commitsSummary}\n` : ""}
${filesSummary ? `\nFILES CHANGED:\n${filesSummary}\n` : ""}

RELEVANT CODE CONTEXT:
${formattedASTContext || "No indexed symbols"}

DIFF / CODE CHANGES:
${
  truncatedDiff && truncatedDiff.trim().length > 0
    ? `\`\`\`diff\n${truncatedDiff}\n\`\`\``
    : "Note: Direct diff comparison shows 0 net file changes between source and target branches (e.g. reverse merge, branch sync, or fast-forward integration). Please evaluate the branch architecture, commit synchronization, and CI/CD workflow implications."
}

TASKS:
1. **Summary**: What changed, architectural intent, and branch relationship (2-3 sentences).
2. **Key Findings**: Architectural, logical, performance, or security observations. Use bullet points.
3. **Suggestions**: Concrete code improvements, testing guidance, or branch hygiene recommendations.
4. **Conclusion**: Concise verdict (Approve / Request Changes / Informational).

Respond in clean, professional GitHub Markdown.
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
