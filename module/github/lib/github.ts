/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";

export const getGitHubToken = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("No session found");
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      providerId: "github",
    },
  });

  if (!account) {
    throw new Error("No GitHub account linked");
  }

  return account.accessToken;
};

export async function fetchUserContribution(
  token: string | null,
  username: string
) {
  const octokit = new Octokit({
    auth: token,
  });

  const query = `
    query($username: String!) {
        user(login: $username) {
            contributionsCollection {
                contributionCalendar {
                    totalContributions
                    weeks{
                    contributionDays {
                        contributionCount 
                        date
                        color
                    }}
                }  
             }
        }
    }`;

  try {
    const response: any = await octokit.graphql(query, { username });
    return response.user.contributionsCollection.contributionCalendar;
  } catch (error) {
    console.error("Error fetching contributions:", error);
    throw error;
  }
}

export const getRepositories = async (
  page: number = 1,
  perPage: number = 10
) => {
  const token = await getGitHubToken();

  const octokit = new Octokit({
    auth: token,
  });

  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    direction: "desc",
    visibility: "all",
    per_page: perPage,
    page: page,
  });

  return data;
};

export const createWebhook = async (owner: string, repo: string) => {
  const token = await getGitHubToken();
  const octokit = new Octokit({
    auth: token,
  });

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/webhooks/github`;

  const { data: hooks } = await octokit.rest.repos.listWebhooks({
    owner,
    repo,
  });

  const existingHook = hooks.find((hook) => hook.config.url === webhookUrl);

  if (existingHook) {
    return existingHook;
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    },
    events: ["pull_request"],
  });

  return data;
};

export const deleteWebhook = async (owner: string, repo: string) => {
  const token = await getGitHubToken();
  const octokit = new Octokit({
    auth: token,
  });
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/webhooks/github`;

  try {
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });

    const hookToDelete = hooks.find((hook) => hook.config.url === webhookUrl);

    if (hookToDelete) {
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hookToDelete.id,
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error deleting webhook:", error);
    return false;
  }
};

// Directories to skip when recursively indexing repo content
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
  ".turbo",
  ".output",
  "vendor",
  "public",
  ".idea",
  ".vscode",
]);

export const getRepoFileContent = async (
  token: string,
  owner: string,
  repo: string,
  path: string = ""
): Promise<{ path: string; content: string }[]> => {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });

  if (!Array.isArray(data)) {
    if (data.type === "file" && data.content) {
      return [
        {
          path: data.path,
          content: Buffer.from(data.content, "base64").toString("utf-8"),
        },
      ];
    }

    return [];
  }

  let files: { path: string; content: string }[] = [];

  for (const item of data) {
    if (item.type === "file") {
      // Skip non-code and large binary files early to conserve rate limits
      if (item.path.match(/\.(png|jpg|jpeg|gif|svg|ico|pdf|zip|tar|gz|woff|woff2|ttf|eot|lock|map|mp4|webm|mp3|wav|ogg)$/i)) {
        continue;
      }

      // Only fetch code and text files
      const ext = item.name.split(".").pop()?.toLowerCase();
      if (!ext || !["js", "ts", "jsx", "tsx", "py", "go", "java", "rs", "cpp", "c", "cs", "php", "rb", "html", "css", "json", "md", "sql", "prisma", "yaml", "yml"].includes(ext)) {
        continue;
      }

      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: item.path,
        });

        if (
          !Array.isArray(fileData) &&
          fileData.type === "file" &&
          fileData.content
        ) {
          files.push({
            path: item.path,
            content: Buffer.from(fileData.content, "base64").toString("utf-8"),
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch file content for ${item.path}:`, err);
      }
    } else if (item.type === "dir") {
      const dirName = item.name || item.path.split("/").pop() || "";
      if (IGNORED_DIRS.has(dirName)) {
        continue;
      }

      try {
        const subFiles = await getRepoFileContent(token, owner, repo, item.path);
        files = files.concat(subFiles);
      } catch (err) {
        console.warn(`Failed to fetch directory ${item.path}:`, err);
      }
    }
  }

  return files;
};

export async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = new Octokit({ auth: token });
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: "diff",
    },
  });

  return {
    diff: typeof diff === "string" ? diff : String(diff || ""),
    title: pr.title || `PR #${prNumber}`,
    description: pr.body || "",
  };
}

export async function postReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  review: string
) {
  const octokit = new Octokit({ auth: token });

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `## 🤖 AI Code Review\n\n${review}\n\n---\n*Automated review powered by RepoPilot AI.*`,
  });
}
