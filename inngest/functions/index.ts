import { inngest } from "../client";
import { indexCodebase, purgeRepositoryVectors } from "@/module/ai/lib/rag";
import { getRepoFileContent } from "@/module/github/lib/github";
import { resolveReviewToken } from "@/module/team/lib/access";

async function fetchRepositoryFiles(userId: string, owner: string, repo: string) {
  const token = await resolveReviewToken(userId, owner);

  if (!token) {
    throw new Error("No Github access token found for user");
  }

  return await getRepoFileContent(token, owner, repo);
}

export async function performDirectRepoIndex({
  owner,
  repo,
  userId,
}: {
  owner: string;
  repo: string;
  userId: string;
}) {
  console.log(`Starting direct indexing for repository ${owner}/${repo}`);

  const files = await fetchRepositoryFiles(userId, owner, repo);
  console.log(`Fetched ${files.length} code files from ${owner}/${repo}`);

  // Old vectors are removed first so deleted files and renamed symbols cannot linger in search results.
  await purgeRepositoryVectors(`${owner}/${repo}`);
  const { indexed } = await indexCodebase(`${owner}/${repo}`, files);
  console.log(`Finished indexing ${files.length} files (${indexed} vectors) for ${owner}/${repo}`);

  return { success: true, indexedFiles: files.length, vectors: indexed };
}

export const indexRepo = inngest.createFunction(
  { id: "index-repo" },
  { event: "repository.connected" },
  async ({ event, step }) => {
    const { owner, repo, userId } = event.data;

    // File contents can exceed Inngest's step output limit, so only counts leave the step.
    const result = await step.run("index-repository", async () => {
      const files = await fetchRepositoryFiles(userId, owner, repo);

      await purgeRepositoryVectors(`${owner}/${repo}`);
      const { indexed } = await indexCodebase(`${owner}/${repo}`, files);

      return { indexedFiles: files.length, vectors: indexed };
    });

    return { success: true, ...result };
  }
);
