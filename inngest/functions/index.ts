import { inngest } from "../client";
import { indexCodebase } from "@/module/ai/lib/rag";
import { getRepoFileContent } from "@/module/github/lib/github";
import { resolveReviewToken } from "@/module/team/lib/access";

async function fetchRepositoryFiles(userId: string, owner: string, repo: string) {
  const token = await resolveReviewToken(userId, owner);

  if (!token) {
    throw new Error("No Github access token found for user");
  }

  return await getRepoFileContent(token, owner, repo);
}

export async function queueRepositoryIndex({
  owner,
  repo,
  userId,
}: {
  owner: string;
  repo: string;
  userId: string;
}) {
  return inngest.send({
    name: "repository.connected",
    data: { owner, repo, userId },
  });
}

export const indexRepo = inngest.createFunction(
  {
    id: "index-repo",
    retries: 3,
    concurrency: {
      limit: 1,
      key: "event.data.owner + '/' + event.data.repo",
    },
  },
  { event: "repository.connected" },
  async ({ event, step }) => {
    const { owner, repo, userId } = event.data;

    const result = await step.run("index-repository", async () => {
      const files = await fetchRepositoryFiles(userId, owner, repo);
      const { indexed } = await indexCodebase(`${owner}/${repo}`, files);

      return { indexedFiles: files.length, vectors: indexed };
    });

    return { success: true, ...result };
  }
);
