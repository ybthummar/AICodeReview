/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { BOT_MARKER } from "@/module/github/lib/markers";
import {
  isIndexablePath,
  MAX_INDEXED_FILE_BYTES,
  MAX_INDEXED_FILES,
} from "@/module/ai/lib/indexable";

export async function getGitHubIssueContext(token: string, owner: string, repo: string, issueNumber: number) {
  const octokit = new Octokit({ auth: token });
  const params = { owner, repo, issue_number: issueNumber };
  const [{ data: issue }, { data: repository }] = await Promise.all([
    octokit.rest.issues.get(params),
    octokit.rest.repos.get({ owner, repo }),
  ]);
  if (issue.pull_request) return null;

  const comments = issue.comments > 0
    ? (await octokit.rest.issues.listComments({ ...params, per_page: 20 })).data
    : [];

  return {
    title: issue.title,
    body: issue.body?.slice(0, 8000) ?? "",
    state: issue.state,
    url: issue.html_url,
    publicRepository: repository.visibility === "public",
    discussion: comments.map((comment) => comment.body?.slice(0, 750) ?? "").filter(Boolean),
  };
}

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

const WEBHOOK_EVENTS = ["pull_request", "issue_comment", "pull_request_review_comment"] as const;

// Confirms the signed-in user really has write access to the repository they are connecting.
export const verifyRepositoryAccess = async (owner: string, repo: string, githubId: number) => {
  const token = await getGitHubToken();
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.rest.repos.get({ owner, repo });

  if (data.id !== githubId) {
    throw new Error("The repository details do not match GitHub. Refresh the page and try again.");
  }

  if (!data.permissions?.push && !data.permissions?.admin) {
    throw new Error("You need write access to this repository to connect it.");
  }

  return { owner: data.owner.login, name: data.name };
};

export const createWebhook = async (owner: string, repo: string) => {
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

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    const config = {
      url: webhookUrl,
      content_type: "json",
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    };

    const existingHook = hooks.find((hook) => hook.config.url === webhookUrl);

    if (existingHook) {
      // Hooks created before slash commands existed only listen to pull_request.
      const missingEvents = WEBHOOK_EVENTS.some((event) => !existingHook.events.includes(event));

      if (missingEvents) {
        const { data } = await octokit.rest.repos.updateWebhook({
          owner,
          repo,
          hook_id: existingHook.id,
          config,
          events: [...WEBHOOK_EVENTS],
        });
        return data;
      }

      return existingHook;
    }

    const { data } = await octokit.rest.repos.createWebhook({
      owner,
      repo,
      config,
      events: [...WEBHOOK_EVENTS],
    });

    return data;
  } catch (error) {
    console.warn(`Could not register GitHub webhook for ${owner}/${repo}:`, error);
    return null;
  }
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

const BLOB_FETCH_CONCURRENCY = 8;

export interface RepositoryIndexFile {
  path: string;
  sha: string;
}

export async function getRepositoryIndexFiles(
  token: string,
  owner: string,
  repo: string
): Promise<RepositoryIndexFile[]> {
  const octokit = new Octokit({ auth: token });
  const { data: repository } = await octokit.rest.repos.get({
    owner, repo, request: { signal: AbortSignal.timeout(15_000) },
  });
  const result = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: repository.default_branch,
    recursive: "true",
    request: { signal: AbortSignal.timeout(20_000) },
  }).catch((error: unknown) => {
    if (error instanceof Error && "status" in error && error.status === 409 && /repository is empty/i.test(error.message)) {
      return null;
    }
    throw error;
  });

  if (!result) return [];
  if (result.data.truncated) {
    throw new Error(`GitHub returned an incomplete file tree for ${owner}/${repo}.`);
  }

  const candidates = result.data.tree
    .flatMap(({ type, mode, path, sha, size }) => (
      type === "blob" && mode !== "120000" && path && sha &&
      (size ?? 0) <= MAX_INDEXED_FILE_BYTES && isIndexablePath(path) ? [{ path, sha }] : []
    ))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (candidates.length > MAX_INDEXED_FILES) {
    console.warn(`Indexing ${MAX_INDEXED_FILES} of ${candidates.length} eligible files in ${owner}/${repo}.`);
  }

  return candidates.slice(0, MAX_INDEXED_FILES);
}

interface IndexBlob {
  isBinary: boolean;
  isTruncated: boolean;
  text: string | null;
}

export async function getRepositoryIndexFileContents(
  token: string,
  owner: string,
  repo: string,
  files: RepositoryIndexFile[]
) {
  if (!files.length) return [];
  const octokit = new Octokit({ auth: token });
  const shas = Array.from(new Set(files.map((file) => file.sha)));
  const variables = shas.map((_, i) => `$blob${i}: GitObjectID!`);
  const selections = shas.map((_, i) => `blob${i}: object(oid: $blob${i}) { ... on Blob { isBinary isTruncated text } }`);
  const blobs = await octokit.graphql<{ repository: Record<string, IndexBlob | null> | null }>(
    `query($owner: String!, $repo: String!, ${variables.join(", ")}) {
      repository(owner: $owner, name: $repo) { ${selections.join("\n")} }
    }`,
    {
      owner,
      repo,
      ...Object.fromEntries(shas.map((sha, i) => [`blob${i}`, sha])),
      request: { signal: AbortSignal.timeout(12_000) },
    },
  ).then((result) => result.repository).catch((error: unknown) => {
    const status =
      typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;
    const message = error instanceof Error ? error.message : "";
    const graphQlAccessDenied = status === 401 || status === 403;
    const rateLimited = /rate.?limit|secondary rate/i.test(message);
    if (!graphQlAccessDenied || rateLimited) throw error;

    console.warn("[repository-index] GitHub GraphQL blob read failed; using REST fallback", {
      owner,
      repo,
      blobs: shas.length,
      status,
    });
    return null;
  });

  const contents = new Map<string, string>();
  const missing: string[] = [];
  for (const [i, sha] of shas.entries()) {
    const blob = blobs?.[`blob${i}`];
    if (blob?.isBinary) continue;
    if (blob && !blob.isTruncated && typeof blob.text === "string") contents.set(sha, blob.text);
    else missing.push(sha);
  }

  // Some GitHub tokens cannot use GraphQL, and large blobs may be truncated.
  for (let i = 0; i < missing.length; i += BLOB_FETCH_CONCURRENCY) {
    await Promise.all(missing.slice(i, i + BLOB_FETCH_CONCURRENCY).map(async (sha) => {
      const { data } = await octokit.rest.git.getBlob({
        owner, repo, file_sha: sha, request: { signal: AbortSignal.timeout(15_000) },
      });
      if (data.encoding !== "base64") throw new Error("GitHub returned an unsupported blob encoding.");
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      if (!content.includes("\0")) contents.set(sha, content);
    }));
  }

  return files.flatMap(({ path, sha }) => {
    const content = contents.get(sha);
    return content === undefined ? [] : [{ path, content }];
  });
}

export interface PullRequestDiffResult {
  diff: string;
  title: string;
  description: string;
  state: string;
  merged: boolean;
  headRef: string;
  baseRef: string;
  headSha: string;
  filesSummary: string;
  commitsSummary: string;
}

export async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestDiffResult> {
  const octokit = new Octokit({ auth: token });
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  let diffText = "";
  try {
    const diffRes = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
    });
    diffText = typeof diffRes.data === "string" ? diffRes.data : "";
  } catch (err) {
    console.warn(`Could not fetch direct diff for ${owner}/${repo}#${prNumber}:`, err);
  }

  let filesSummary = "";
  try {
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 30,
    });
    if (files && files.length > 0) {
      filesSummary = files
        .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
        .join("\n");

      if (!diffText || diffText.trim().length === 0) {
        const patchParts = files
          .filter((f) => f.patch)
          .map((f) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}`);
        if (patchParts.length > 0) {
          diffText = patchParts.join("\n\n");
        }
      }
    }
  } catch (err) {
    console.warn(`Could not fetch files for ${owner}/${repo}#${prNumber}:`, err);
  }

  let commitsSummary = "";
  try {
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 15,
    });
    if (commits && commits.length > 0) {
      commitsSummary = commits
        .map(
          (c) =>
            `- [${c.sha.slice(0, 7)}] ${c.commit.message.split("\n")[0]} (by ${c.commit.author?.name || "contributor"})`
        )
        .join("\n");
    }
  } catch (err) {
    console.warn(`Could not fetch commits for ${owner}/${repo}#${prNumber}:`, err);
  }

  return {
    diff: diffText,
    title: pr.title || `PR #${prNumber}`,
    description: pr.body || "",
    state: pr.state,
    merged: !!pr.merged,
    headRef: pr.head?.ref || "source",
    baseRef: pr.base?.ref || "target",
    headSha: pr.head?.sha || "",
    filesSummary,
    commitsSummary,
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
    body: `## 🤖 AI Code Review\n\n${review}\n\n---\n*Automated review powered by RepoPilot AI.*\n${BOT_MARKER}`,
  });
}

// Comments are posted with the connected user's token, so this marker is how we recognise our own messages.
export { BOT_MARKER };

export async function postPlainComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const octokit = new Octokit({ auth: token });

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `${body}\n\n${BOT_MARKER}`,
  });
}

export async function replyToReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  commentId: number,
  body: string
) {
  const octokit = new Octokit({ auth: token });

  await octokit.rest.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    comment_id: commentId,
    body: `${body}\n\n${BOT_MARKER}`,
  });
}

export async function getReviewCommentBody(
  token: string,
  owner: string,
  repo: string,
  commentId: number
): Promise<string | null> {
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.rest.pulls.getReviewComment({
      owner,
      repo,
      comment_id: commentId,
    });
    return data.body;
  } catch {
    return null;
  }
}

export async function reactToComment(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  kind: "issue" | "review",
  content: "eyes" | "+1" | "-1" | "rocket"
) {
  const octokit = new Octokit({ auth: token });

  try {
    if (kind === "issue") {
      await octokit.rest.reactions.createForIssueComment({ owner, repo, comment_id: commentId, content });
    } else {
      await octokit.rest.reactions.createForPullRequestReviewComment({ owner, repo, comment_id: commentId, content });
    }
  } catch {
    // Reactions are cosmetic.
  }
}

export async function postCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  state: "success" | "failure" | "pending" | "error",
  description: string,
  targetUrl?: string
) {
  const octokit = new Octokit({ auth: token });

  await octokit.rest.repos.createCommitStatus({
    owner,
    repo,
    sha,
    state,
    context: "RepoPilot / AI Review",
    description: description.slice(0, 140),
    ...(targetUrl ? { target_url: targetUrl } : {}),
  });
}


export interface InlineReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

// A single bad line makes GitHub reject the whole review, so fall back to one comment at a time.
export async function postInlineReview(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  comments: InlineReviewComment[]
): Promise<number> {
  if (comments.length === 0 || !headSha) return 0;

  const octokit = new Octokit({ auth: token });

  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: headSha,
      event: "COMMENT",
      body: "RepoPilot left inline findings on the lines below.",
      comments,
    });
    return comments.length;
  } catch (error) {
    console.warn(`Batched inline review failed for ${owner}/${repo}#${prNumber}, retrying individually:`, error);
  }

  let posted = 0;
  for (const comment of comments) {
    try {
      await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: headSha,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        body: comment.body,
      });
      posted += 1;
    } catch (error) {
      console.warn(`Skipped inline comment on ${comment.path}:${comment.line}:`, error);
    }
  }

  return posted;
}

export async function getGitHubFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string | null> {
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    });

    if (Array.isArray(data) || data.type !== "file" || !data.content) return null;
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

export async function updatePullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  changes: { title?: string; body?: string }
) {
  const octokit = new Octokit({ auth: token });

  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    ...(changes.title ? { title: changes.title } : {}),
    ...(changes.body !== undefined ? { body: changes.body } : {}),
  });
}

export interface MergedPullRequest {
  number: number;
  title: string;
  body: string | null;
  author: string;
  url: string;
  mergedAt: string;
  labels: string[];
}

export async function listMergedPullRequests(
  token: string,
  owner: string,
  repo: string,
  since: Date
): Promise<MergedPullRequest[]> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 60,
  });

  return data
    .filter((pr) => pr.merged_at && new Date(pr.merged_at) >= since)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      author: pr.user?.login || "unknown",
      url: pr.html_url,
      mergedAt: pr.merged_at as string,
      labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name || "")).filter(Boolean),
    }));
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

export async function getOpenPullRequests(
  token: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
  options: { propagateErrors?: boolean } = {}
): Promise<GitHubPullRequest[]> {
  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state,
      sort: "updated",
      direction: "desc",
      per_page: 30,
    });

    return data.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title || `PR #${pr.number}`,
      body: pr.body || null,
      state: pr.state,
      html_url: pr.html_url,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      user: {
        login: pr.user?.login || "unknown",
        avatar_url: pr.user?.avatar_url || "",
      },
      head: {
        ref: pr.head?.ref || "unknown",
      },
      base: {
        ref: pr.base?.ref || "main",
      },
    }));
  } catch (error) {
    if (options.propagateErrors) throw new Error("Could not load pull requests from GitHub.");
    console.error(`Failed to list pull requests for ${owner}/${repo}:`, error);
    return [];
  }
}

export interface ClosedPullRequest {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

// Throws when GitHub rejects the request so callers can tell "no pull requests" from "no access".
export async function listClosedPullRequests(
  token: string,
  owner: string,
  repo: string
): Promise<ClosedPullRequest[]> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title || `PR #${pr.number}`,
    author: pr.user?.login || "unknown",
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
  }));
}
