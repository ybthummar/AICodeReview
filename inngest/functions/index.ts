import { inngest } from "../client";
import prisma from "@/lib/db";
import { indexCodebase } from "@/module/ai/lib/rag";
import { getRepoFileContent } from "@/module/github/lib/github";

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

  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "github",
    },
  });

  if (!account?.accessToken) {
    throw new Error("No Github access token found for user");
  }

  const files = await getRepoFileContent(account.accessToken, owner, repo);
  console.log(`Fetched ${files.length} code files from ${owner}/${repo}`);

  await indexCodebase(`${owner}/${repo}`, files);
  console.log(`Finished indexing ${files.length} files for ${owner}/${repo}`);

  return { success: true, indexedFiles: files.length };
}

export const indexRepo = inngest.createFunction(
  { id: "index-repo" },
  { event: "repository.connected" },
  async ({ event, step }) => {
    const { owner, repo, userId } = event.data;

    const files = await step.run("fetch-files", async () => {
      const account = await prisma.account.findFirst({
        where: {
          userId: userId,
          providerId: "github",
        },
      });

      if (!account?.accessToken) {
        throw new Error("No Github access token found !!");
      }

      return await getRepoFileContent(account.accessToken, owner, repo);
    });

    await step.run("index-codebase", async () => {
      await indexCodebase(`${owner}/${repo}`, files);
    });

    return { success: true, indexedFiles: files.length };
  }
);
