import { RequestError } from "octokit";

export function isGitHubRateLimit(error: unknown): boolean {
  if (!(error instanceof RequestError)) return false;
  const headers = error.response?.headers;
  return error.status === 429 || (error.status === 403 && (
    headers?.["x-ratelimit-remaining"] === "0" || Boolean(headers?.["retry-after"]) || /rate limit/i.test(error.message)
  ));
}

export function isGitHubAccessError(error: unknown): boolean {
  return error instanceof RequestError && [401, 403, 404].includes(error.status) && !isGitHubRateLimit(error);
}
