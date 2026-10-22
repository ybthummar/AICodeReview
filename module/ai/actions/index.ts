import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { getPullRequestDiff } from "@/module/github/lib/github";
import { performDirectReview } from "@/inngest/functions/review";

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number
) {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner: { equals: owner, mode: "insensitive" },
        name: { equals: repo, mode: "insensitive" },
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                providerId: "github",
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found in database`);
    }

    const githubAccount = repository.user.accounts[0];

    if (!githubAccount?.accessToken) {
      throw new Error("No Github access token found for repository owner");
    }

    const token = githubAccount.accessToken;

    // Validate PR exists on GitHub
    const { title } = await getPullRequestDiff(token, owner, repo, prNumber);
    console.log(`Reviewing ${owner}/${repo}#${prNumber}: "${title}"`);

    // If INNGEST_EVENT_KEY is configured, dispatch to Inngest for background execution
    let queuedWithInngest = false;
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "pr.review.requested",
          data: {
            owner,
            repo,
            prNumber,
            userId: repository.user.id,
          },
        });
        queuedWithInngest = true;
        console.log(`Queued review via Inngest for ${owner}/${repo}#${prNumber}`);
      } catch (inngestError) {
        console.warn(
          "Inngest dispatch failed, falling back to direct review execution:",
          inngestError
        );
      }
    }

    // If Inngest is not configured or sending failed, execute directly in background
    if (!queuedWithInngest) {
      console.log(`Running direct review execution for ${owner}/${repo}#${prNumber}`);
      performDirectReview({
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
      }).catch((directErr) => {
        console.error(`Direct review execution failed for ${owner}/${repo}#${prNumber}:`, directErr);
      });
    }

    return { success: true, message: queuedWithInngest ? "Review Queued" : "Review Started" };
  } catch (error) {
    console.error(`reviewPullRequest failed for ${owner}/${repo}#${prNumber}:`, error);

    try {
      const repository = await prisma.repository.findFirst({
        where: {
          owner: { equals: owner, mode: "insensitive" },
          name: { equals: repo, mode: "insensitive" },
        },
      });

      if (repository) {
        await prisma.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: "Failed to fetch PR",
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: `Error: ${
              error instanceof Error ? error.message : "Unknown Error"
            }`,
            status: "failed",
          },
        });
      }
    } catch (dbError) {
      console.error("Database Error:", dbError);
    }

    throw error;
  }
}
