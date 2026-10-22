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
    .map((s) => {
      if (s.type === "symbol" || s.symbolName) {
        return `File: ${s.path}
Symbol: ${s.symbolName ?? "unknown"}
Type: ${s.symbolType ?? "unknown"}
Lines: ${s.startLine ?? "?"}-${s.endLine ?? "?"}`;
      } else if (s.content) {
        return `File: ${s.path}\nSnippet:\n${s.content.slice(0, 500)}`;
      }
      return `File: ${s.path}`;
    })
    .join("\n\n");
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

  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "github",
    },
  });

  if (!account?.accessToken) {
    throw new Error("No GitHub access token found");
  }

  const { diff, title, description } = await getPullRequestDiff(
    account.accessToken,
    owner,
    repo,
    prNumber
  );

  const query = `
PR Title: ${title}
PR Description: ${description || ""}
Diff Summary:
${diff.slice(0, 2000)}
  `.trim();

  let astContext: ASTSymbolContext[] = [];
  try {
    astContext = (await retrieveContext(
      query,
      `${owner}/${repo}`
    )) as ASTSymbolContext[];
  } catch (err) {
    console.warn("Failed to retrieve context from Pinecone:", err);
  }

  const formattedASTContext = formatASTContext(astContext);
  const truncatedDiff = diff.length > 25000 ? diff.slice(0, 25000) + "\n\n...[Diff truncated due to size]..." : diff;

  const prompt = `
You are a senior software engineer performing a thorough, constructive code review.

This repository uses RAG indexing. The context below represents specific functions, routes, or classes related to the pull request.

====================
PR METADATA
====================
Title: ${title}
Description: ${description || "No description provided"}

====================
RELEVANT CODE CONTEXT (from RAG)
====================
${formattedASTContext || "No relevant indexed symbols found"}

====================
CODE CHANGES (DIFF)
====================
\`\`\`diff
${truncatedDiff}
\`\`\`

====================
REVIEW TASKS
====================
1. Walk through the changes: explain WHAT changed and WHY.
2. Identify logical, architectural, performance, or security issues (if any).
3. Comment specifically on affected functions, routes, or handlers.
4. Suggest concrete improvements with code snippets and reasoning.
5. If applicable, generate a SIMPLE Mermaid sequence diagram illustrating the flow.
   - Valid Mermaid syntax only (\`\`\`mermaid ... \`\`\`)
   - Keep it minimal and avoid special characters in node labels.

Respond in clear, professional Markdown.
  `;

  // Use the verified working Gemini model
  const { text: review } = await generateText({
    model: google("gemini-flash-latest"),
    prompt,
  });

  // Post the review comment back to GitHub PR
  try {
    await postReviewComment(account.accessToken, owner, repo, prNumber, review);
    console.log(`Successfully posted review comment on GitHub PR ${owner}/${repo}#${prNumber}`);
  } catch (err) {
    console.error(`Failed to post comment to GitHub for ${owner}/${repo}#${prNumber}:`, err);
  }

  // Save the review to the database
  const repository = await prisma.repository.findFirst({
    where: {
      owner: { equals: owner, mode: "insensitive" },
      name: { equals: repo, mode: "insensitive" },
    },
  });

  if (repository) {
    // Check if an existing review for this PR is pending or failed and update it, or create a new one
    const existing = await prisma.review.findFirst({
      where: {
        repositoryId: repository.id,
        prNumber,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing && existing.status !== "completed") {
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
  }

  return { success: true, review };
}

export const generateReview = inngest.createFunction(
  { id: "generate-review", concurrency: 5 },
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

    const astContext = await step.run("retrieve-ast-context", async () => {
      const query = `
          PR Title: ${title}
          PR Description: ${description || ""}
          Diff Summary:
          ${diff.slice(0, 2000)}
                `.trim();

      try {
        return (await retrieveContext(
          query,
          `${owner}/${repo}`
        )) as ASTSymbolContext[];
      } catch (err) {
        console.warn("RAG retrieval failed, proceeding without extra context:", err);
        return [] as ASTSymbolContext[];
      }
    });

    const review = await step.run("generate-ai-review", async () => {
      const formattedASTContext = formatASTContext(astContext);
      const truncatedDiff = diff.length > 25000 ? diff.slice(0, 25000) + "\n\n...[Diff truncated due to size]..." : diff;

      const prompt = `
          You are a senior software engineer performing a professional code review.

          This system uses AST-based indexing. The context below represents
          specific functions, routes, or classes related to the pull request.

          ====================
          PR METADATA
          ====================
          Title: ${title}
          Description: ${description || "No description provided"}

          ====================
          AST CONTEXT (Symbol-Level)
          ====================
          ${formattedASTContext || "No relevant symbols found"}

          ====================
          CODE CHANGES (DIFF)
          ====================
          \`\`\`diff
          ${truncatedDiff}
          \`\`\`

          ====================
          REVIEW TASKS
          ====================
          1. Walk through the changes and explain WHAT changed and WHY.
          2. Identify logical, architectural, performance, or security issues.
          3. Comment on affected functions, routes, or handlers.
          4. Suggest concrete improvements with reasoning.
          5. If applicable, generate a SIMPLE Mermaid sequence diagram.
            - Valid Mermaid syntax only
            - Keep it minimal
            - Avoid special characters in labels

          Respond in clear, professional Markdown.
        `;

      const { text } = await generateText({
        model: google("gemini-flash-latest"),
        prompt,
      });

      return text;
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

      if (existing && existing.status !== "completed") {
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
