import prisma from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { isProActive } from "@/lib/subscription";
import {
  postCommitStatus,
  postInlineReview,
  postReviewComment,
} from "@/module/github/lib/github";
import { parseUnifiedDiff, type ParsedDiffFile } from "@/module/github/lib/diff";
import { attachOriginalLines, buildInlineComments } from "@/module/review/lib/inline";
import {
  addScannerFindings,
  buildGitHubComment,
  evaluateQualityGate,
  getOpenFindings,
  parseReviewContent,
  reconcileInsights,
  setWalkthrough,
  withHeadSha,
  type ExtraFinding,
  type ReviewInsights,
} from "@/module/review/lib/insights";
import { suppressLearnedFindings } from "@/module/review/lib/feedback";
import { buildWalkthrough } from "@/module/review/lib/walkthrough";
import { createIgnoreMatcher, type ReviewConfig } from "@/module/review-rules/lib/config";
import { runRules } from "@/module/review-rules/lib/rules";
import { runSecurityScan } from "@/module/security/lib/osv";
import { sendReviewAlert } from "@/module/notifications/lib/notify";

import { APP_BASE_URL } from "@/lib/app-url";

export { APP_BASE_URL };

// Step output and prompts never need more than this much of a diff.
export const MAX_STORED_DIFF_CHARS = 500_000;

export async function loadPreviousInsights(
  repositoryId: string,
  prNumber: number
): Promise<ReviewInsights | null> {
  // Pending rows keep the previous review text, so insights survive until the new run finishes.
  const previous = await prisma.review.findFirst({
    where: { repositoryId, prNumber },
    orderBy: { createdAt: "desc" },
    select: { review: true },
  });

  return previous ? parseReviewContent(previous.review).insights : null;
}

export function prepareDiff(
  diff: string,
  config: ReviewConfig
): {
  diff: string;
  files: ParsedDiffFile[];
  allFiles: ParsedDiffFile[];
  ignoredFiles: string[];
} {
  const allFiles = parseUnifiedDiff(diff);

  // An unparseable diff is still sent to the model as-is.
  if (allFiles.length === 0) {
    return { diff, files: [], allFiles: [], ignoredFiles: [] };
  }

  const isIgnored = createIgnoreMatcher(config.ignoredPaths);
  const files = allFiles.filter((f) => !isIgnored(f.path));

  return {
    diff: files.map((f) => f.text).join("\n"),
    files,
    allFiles,
    ignoredFiles: allFiles.filter((f) => isIgnored(f.path)).map((f) => f.path),
  };
}

export async function finalizeInsights(input: {
  insights: ReviewInsights | null;
  files: ParsedDiffFile[];
  // Files excluded from AI review are still scanned for secrets.
  scanFiles?: ParsedDiffFile[];
  config: ReviewConfig;
  previous: ReviewInsights | null;
  headSha: string;
  repositoryId?: string;
}): Promise<ReviewInsights | null> {
  const scanFiles = input.scanFiles ?? input.files;
  const extras: ExtraFinding[] = [];

  if (input.config.securityScan && scanFiles.length > 0) {
    try {
      extras.push(...(await runSecurityScan(scanFiles)).findings);
    } catch (error) {
      console.warn("Security scan skipped:", error);
    }
  }

  try {
    extras.push(...runRules(input.files, input.config));
  } catch (error) {
    console.warn("Custom rules skipped:", error);
  }

  let insights = addScannerFindings(input.insights, extras);
  if (!insights) return null;

  if (input.config.walkthrough) {
    const walkthrough = buildWalkthrough(insights.walkthrough, input.files);
    if (walkthrough) insights = setWalkthrough(insights, walkthrough);
  }

  insights = attachOriginalLines(withHeadSha(insights, input.headSha), input.files);
  insights = reconcileInsights(insights, input.previous);

  return input.repositoryId ? await suppressLearnedFindings(insights, input.repositoryId) : insights;
}

export async function postMainComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  markdown: string,
  insights: ReviewInsights | null
) {
  await postReviewComment(token, owner, repo, prNumber, buildGitHubComment(markdown, insights));
}

export async function postInlineFindings(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  insights: ReviewInsights | null;
  previous: ReviewInsights | null;
  files: ParsedDiffFile[];
  config: ReviewConfig;
}): Promise<number> {
  if (!input.config.inlineComments || !input.insights || !input.headSha) return 0;

  // Re-runs only comment on findings that were not already raised on this PR.
  const known = new Set(input.previous?.findings.map((f) => f.id) ?? []);
  const fresh = input.insights.findings.filter((f) => !known.has(f.id));

  const comments = buildInlineComments(fresh, input.files);

  try {
    return await postInlineReview(
      input.token,
      input.owner,
      input.repo,
      input.prNumber,
      input.headSha,
      comments
    );
  } catch (error) {
    console.warn(`Inline comments skipped for ${input.owner}/${input.repo}#${input.prNumber}:`, error);
    return 0;
  }
}

// Commit-status quality gate is a PRO/admin feature and never fails the review itself.
export async function publishQualityGate(
  userId: string,
  token: string,
  owner: string,
  repo: string,
  headSha: string,
  insights: ReviewInsights | null
) {
  if (!headSha) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });

    if (!isProActive(user) && !isAdminUser(user)) return;

    const gate = evaluateQualityGate(insights);
    await postCommitStatus(
      token,
      owner,
      repo,
      headSha,
      gate.state,
      gate.description,
      `${APP_BASE_URL}/dashboard/reviews`
    );
  } catch (err) {
    console.warn(`Could not publish quality gate status for ${owner}/${repo}@${headSha.slice(0, 7)}:`, err);
  }
}

export async function notifyReviewCompleted(input: {
  userId: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  insights: ReviewInsights | null;
}) {
  if (!input.insights) return;

  const open = getOpenFindings(input.insights);

  await sendReviewAlert(input.userId, {
    repoFullName: `${input.owner}/${input.repo}`,
    prNumber: input.prNumber,
    prTitle: input.prTitle,
    prUrl: `https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber}`,
    dashboardUrl: `${APP_BASE_URL}/dashboard/reviews`,
    verdict: input.insights.verdict,
    riskLevel: input.insights.riskLevel,
    riskScore: input.insights.riskScore,
    qualityScore: input.insights.qualityScore,
    securityScore: input.insights.securityScore,
    topFindings: open.slice(0, 3).map((f) => ({ severity: f.severity, title: f.title })),
  });
}
