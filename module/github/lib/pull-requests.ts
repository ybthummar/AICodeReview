import { RequestError } from "octokit";
import { getInstallationTokenForRepository } from "@/module/github/lib/app";
import { getPullRequestDiff, listRepositoryPullRequests } from "@/module/github/lib/github";
import { isGitHubAccessError, isGitHubRateLimit } from "@/module/github/lib/read-errors";
import { getGitHubTokenForUser } from "@/module/team/lib/access";

type ConnectedRepository = { owner: string; name: string; userId: string };

export class PullRequestLoadError extends Error {
  constructor(message: string, readonly reconnect = false) {
    super(message);
  }
}

async function readWithPullRequestAccess<T>(repository: ConnectedRepository, viewerId: string, read: (token: string) => Promise<T>) {
  const { owner, name, userId } = repository;
  const ownsConnection = userId === viewerId;
  const credentials = [
    () => getInstallationTokenForRepository(owner, name, "pull_requests"),
    () => getGitHubTokenForUser(userId),
    ...(!ownsConnection ? [() => getGitHubTokenForUser(viewerId)] : []),
  ];
  const tried = new Set<string>();

  for (const getCredential of credentials) {
    const token = await getCredential();
    if (!token || tried.has(token)) continue;
    tried.add(token);

    try {
      return await read(token);
    } catch (error) {
      if (isGitHubAccessError(error)) continue;
      if (isGitHubRateLimit(error)) {
        throw new PullRequestLoadError("GitHub is limiting pull request requests. Wait before trying again.");
      }
      console.warn("[pull-requests] GitHub fetch failed", { owner, name, status: error instanceof RequestError ? error.status : undefined });
      throw new PullRequestLoadError("Could not load pull requests from GitHub. Try again in a moment.");
    }
  }

  throw new PullRequestLoadError(
    ownsConnection
      ? "Authorize GitHub again or check the GitHub App’s Pull requests permission and organization access."
      : "Ask the repository owner to restore GitHub access, or authorize your own GitHub account if you have access to the repository.",
    true,
  );
}

export function readRepositoryPullRequests(repository: ConnectedRepository, viewerId: string) {
  return readWithPullRequestAccess(repository, viewerId, (token) =>
    listRepositoryPullRequests(token, repository.owner, repository.name),
  );
}

export function readRepositoryPullRequest(repository: ConnectedRepository, viewerId: string, number: number) {
  return readWithPullRequestAccess(repository, viewerId, async (token) => ({
    token,
    pr: await getPullRequestDiff(token, repository.owner, repository.name, number),
  }));
}
