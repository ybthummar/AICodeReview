import { Octokit } from "octokit";

export type AutoFixMode = "pull_request" | "commit";

export class AutoFixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoFixError";
  }
}

interface AutoFixInput {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  path: string;
  line: number;
  original: string;
  fix: string;
  title: string;
  mode: AutoFixMode;
}

// Applies one single-line suggestion, refusing to touch a file that changed since the review ran.
export async function applySuggestedFix(input: AutoFixInput): Promise<{ url: string; mode: AutoFixMode }> {
  const { token, owner, repo, prNumber, path, line, original, fix, title, mode } = input;
  const octokit = new Octokit({ auth: token });

  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

  if (pr.state !== "open") {
    throw new AutoFixError("This pull request is closed, so it can no longer be changed.");
  }

  if (pr.head.repo?.full_name?.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) {
    throw new AutoFixError("Pull requests from forks cannot be changed automatically. Apply the suggestion on GitHub instead.");
  }

  const headRef = pr.head.ref;
  const headSha = pr.head.sha;

  const { data: file } = await octokit.rest.repos.getContent({ owner, repo, path, ref: headSha });
  if (Array.isArray(file) || file.type !== "file" || !file.content) {
    throw new AutoFixError("The file could not be read from GitHub.");
  }

  const content = Buffer.from(file.content, "base64").toString("utf-8");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);

  if ((lines[line - 1] ?? "").trimEnd() !== original.trimEnd()) {
    throw new AutoFixError("The file changed since this review ran. Re-run the review and try again.");
  }

  lines.splice(line - 1, 1, ...fix.split(/\r?\n/));
  const updated = Buffer.from(lines.join(eol), "utf-8").toString("base64");
  const message = `RepoPilot: ${title}`.slice(0, 72);

  if (mode === "commit") {
    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: updated,
      sha: file.sha,
      branch: headRef,
    });

    return { url: data.commit.html_url ?? pr.html_url, mode };
  }

  const branch = `repopilot/fix-${prNumber}-${Date.now().toString(36)}`;

  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: headSha });
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: updated,
    sha: file.sha,
    branch,
  });

  const { data: fixPr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: message,
    head: branch,
    base: headRef,
    body: `Automated fix suggested by RepoPilot for #${prNumber}.\n\n**Finding:** ${title}\n**File:** \`${path}\` line ${line}\n\nReview the change, then merge this pull request into \`${headRef}\`.`,
  });

  return { url: fixPr.html_url, mode };
}
