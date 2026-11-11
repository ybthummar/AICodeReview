"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { generateWithFallback } from "@/module/ai/lib/generate";
import {
  getGitHubFileContent,
  getOpenPullRequests,
  getPullRequestDiff,
  listMergedPullRequests,
  updatePullRequest,
} from "@/module/github/lib/github";
import { consumeUsage, QuotaExceededError, refundUsage } from "@/module/billing/lib/usage";
import { prepareDiff } from "@/module/review/lib/pipeline";
import { loadReviewConfig } from "@/module/review-rules/lib/load";
import { runSecurityScan, type SecurityScanResult } from "@/module/security/lib/osv";
import {
  composePullRequestDescription,
  MAX_TITLE,
  truncateDiff,
} from "@/module/toolkit/lib/describe";
import {
  findAccessibleRepository,
  requireRepositoryToken,
  type WorkspaceRole,
} from "@/module/team/lib/access";

const MAX_BODY = 60000;

export interface ToolkitPullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  url: string;
  headRef: string;
  baseRef: string;
}

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

async function loadContext(repositoryId: string, prNumber: number, minimumRole: WorkspaceRole) {
  const session = await requireSession();

  const access = await findAccessibleRepository(session.user, { id: repositoryId }, minimumRole);
  if (!access) {
    throw new Error("Repository not found or you do not have permission to use this tool.");
  }

  const { repository } = access;
  const token = await requireRepositoryToken(repository.userId, repository.owner);
  const pr = await getPullRequestDiff(token, repository.owner, repository.name, prNumber);

  return { session, repository, token, pr };
}

export async function getToolkitPullRequests(
  repositoryId: string
): Promise<ActionResult<ToolkitPullRequest[]>> {
  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { id: repositoryId });
    if (!access) return fail(new Error("Repository not found"));

    const token = await requireRepositoryToken(access.repository.userId, access.repository.owner);
    const pulls = await getOpenPullRequests(token, access.repository.owner, access.repository.name, "all");

    return ok(
      pulls.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user.login,
        url: pr.html_url,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
      }))
    );
  } catch (error) {
    return fail(error, "Could not load pull requests.");
  }
}

export async function generatePullRequestDescription(
  repositoryId: string,
  prNumber: number
): Promise<ActionResult<{ title: string; body: string }>> {
  let billedUserId: string | null = null;

  try {
    const { session, repository, pr } = await loadContext(repositoryId, prNumber, "MEMBER");
    const config = await loadReviewConfig(repository.id);
    const diffText = truncateDiff(prepareDiff(pr.diff, config).diff);

    await consumeUsage(session.user.id, "toolkit");
    billedUserId = session.user.id;

    return ok(await composePullRequestDescription({ repoFullName: repository.fullName, pr, diffText }));
  } catch (error) {
    if (error instanceof QuotaExceededError) return fail(error);
    if (billedUserId) await refundUsage(billedUserId, "toolkit");
    console.error("generatePullRequestDescription failed:", error);
    return fail(error, "Could not generate the description.");
  }
}

export async function applyPullRequestDescription(
  repositoryId: string,
  prNumber: number,
  title: string,
  body: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { id: repositoryId }, "MEMBER");
    if (!access) return fail(new Error("You need member access to update pull requests."));

    const cleanTitle = title.trim().slice(0, MAX_TITLE);
    const cleanBody = body.trim().slice(0, MAX_BODY);
    if (!cleanTitle) return fail(new Error("The title cannot be empty."));

    const token = await requireRepositoryToken(access.repository.userId, access.repository.owner);
    await updatePullRequest(token, access.repository.owner, access.repository.name, prNumber, {
      title: cleanTitle,
      body: cleanBody,
    });

    return ok(null);
  } catch (error) {
    console.error("applyPullRequestDescription failed:", error);
    return fail(error, "GitHub rejected the update. Check that the token has write access.");
  }
}

export async function generateTestsForPullRequest(
  repositoryId: string,
  prNumber: number
): Promise<ActionResult<{ markdown: string }>> {
  let billedUserId: string | null = null;

  try {
    const { session, repository, token, pr } = await loadContext(repositoryId, prNumber, "MEMBER");
    const config = await loadReviewConfig(repository.id);
    const diffText = truncateDiff(prepareDiff(pr.diff, config).diff);

    const manifests = await Promise.all(
      ["package.json", "requirements.txt", "pyproject.toml", "go.mod", "pom.xml"].map(async (path) => {
        const content = await getGitHubFileContent(token, repository.owner, repository.name, path);
        return content ? `--- ${path} ---\n${content.slice(0, 1500)}` : null;
      })
    );

    await consumeUsage(session.user.id, "toolkit");
    billedUserId = session.user.id;

    const markdown = await generateWithFallback(
      `
You are a senior engineer writing unit tests for the changes in a pull request to ${repository.fullName}.

INSTRUCTIONS:
- Detect the test framework from the project manifests below. If none is present, pick the idiomatic default for the language and say so.
- Write tests ONLY for logic added or changed in the diff. Skip config, styling and generated files.
- For every test file output: a "### path/to/file.test.ext" heading followed by one fenced code block with the complete file.
- Cover the happy path, edge cases and error handling. Mock external services and the database.
- Do not invent functions, modules or APIs that are not visible in the diff. State any assumption in one short line under the code.
- Finish with a short "Notes" list of anything that needs manual setup.

PR TITLE: ${pr.title}

FILES CHANGED:
${pr.filesSummary || "(none)"}

PROJECT MANIFESTS:
${manifests.filter(Boolean).join("\n\n") || "(none found)"}

DIFF:
${diffText}
`.trim(),
      { temperature: 0.2 }
    );

    return ok({ markdown: markdown.trim() });
  } catch (error) {
    if (error instanceof QuotaExceededError) return fail(error);
    if (billedUserId) await refundUsage(billedUserId, "toolkit");
    console.error("generateTestsForPullRequest failed:", error);
    return fail(error, "Could not generate tests.");
  }
}

export async function generateReleaseNotes(
  repositoryId: string,
  days: number
): Promise<ActionResult<{ markdown: string; prCount: number }>> {
  let billedUserId: string | null = null;

  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { id: repositoryId }, "MEMBER");
    if (!access) return fail(new Error("Repository not found or you do not have permission."));

    const range = Math.min(90, Math.max(1, Math.round(days) || 7));
    const { repository } = access;
    const token = await requireRepositoryToken(repository.userId, repository.owner);

    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
    const merged = await listMergedPullRequests(token, repository.owner, repository.name, since);

    if (merged.length === 0) {
      return ok({
        markdown: `No pull requests were merged into **${repository.fullName}** in the last ${range} day${range === 1 ? "" : "s"}.`,
        prCount: 0,
      });
    }

    await consumeUsage(session.user.id, "toolkit");
    billedUserId = session.user.id;

    const list = merged
      .slice(0, 40)
      .map(
        (pr) =>
          `- #${pr.number} "${pr.title}" by @${pr.author}${pr.labels.length ? ` [${pr.labels.join(", ")}]` : ""}${pr.body ? `\n  ${pr.body.replace(/\s+/g, " ").slice(0, 300)}` : ""}`
      )
      .join("\n");

    const markdown = await generateWithFallback(
      `
Write user-facing release notes for ${repository.fullName} covering the last ${range} days.

FORMAT:
- Start with "## Release notes" and a one-sentence overview.
- Then use only the sections that apply: "### Features", "### Improvements", "### Fixes", "### Maintenance".
- One bullet per change in plain language: "- What changed and why it matters (#123, @author)".
- Merge closely related pull requests into one bullet. Do not invent changes that are not listed.

MERGED PULL REQUESTS:
${list}
`.trim(),
      { temperature: 0.3 }
    );

    return ok({ markdown: markdown.trim(), prCount: merged.length });
  } catch (error) {
    if (error instanceof QuotaExceededError) return fail(error);
    if (billedUserId) await refundUsage(billedUserId, "toolkit");
    console.error("generateReleaseNotes failed:", error);
    return fail(error, "Could not generate release notes.");
  }
}

export async function scanPullRequestSecurity(
  repositoryId: string,
  prNumber: number
): Promise<ActionResult<SecurityScanResult & { prTitle: string }>> {
  try {
    const { pr } = await loadContext(repositoryId, prNumber, "VIEWER");
    const result = await runSecurityScan(pr.diff);

    return ok({ ...result, prTitle: pr.title });
  } catch (error) {
    console.error("scanPullRequestSecurity failed:", error);
    return fail(error, "Could not scan the pull request.");
  }
}
