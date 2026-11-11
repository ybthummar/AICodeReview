import { generateWithFallback } from "@/module/ai/lib/generate";
import { extractJsonObject } from "@/module/review/lib/insights";
import type { PullRequestDiffResult } from "@/module/github/lib/github";

export const MAX_PROMPT_DIFF = 20000;
export const MAX_TITLE = 256;

export function truncateDiff(diff: string): string {
  const text =
    diff.length > MAX_PROMPT_DIFF ? `${diff.slice(0, MAX_PROMPT_DIFF)}\n...[diff truncated]...` : diff;
  return text.trim() || "(no reviewable changes)";
}

// Shared by the AI Toolkit page and the /repopilot describe command.
export async function composePullRequestDescription(input: {
  repoFullName: string;
  pr: PullRequestDiffResult;
  diffText: string;
}): Promise<{ title: string; body: string }> {
  const { repoFullName, pr, diffText } = input;

  const output = await generateWithFallback(
    `
You write clear, accurate pull request descriptions for ${repoFullName}.

Return ONLY one valid JSON object (no code fences) shaped like:
{
  "title": "concise imperative title, at most 72 characters",
  "body": "Markdown with these sections: ## Summary, ## Changes (bullets grouped by area), ## How to test, ## Risks and notes (omit when there are none)"
}

Only describe what is evidenced by the information below. Do not invent behaviour, tickets or test results.

CURRENT TITLE: ${pr.title}
CURRENT DESCRIPTION: ${pr.description || "(empty)"}
BRANCHES: ${pr.headRef} -> ${pr.baseRef}

COMMITS:
${pr.commitsSummary || "(none)"}

FILES CHANGED:
${pr.filesSummary || "(none)"}

DIFF:
${diffText}
`.trim(),
    { temperature: 0.3 }
  );

  const parsed = extractJsonObject(output) as { title?: unknown; body?: unknown } | null;

  return {
    title:
      typeof parsed?.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, MAX_TITLE)
        : pr.title,
    body:
      typeof parsed?.body === "string" && parsed.body.trim() ? parsed.body.trim() : output.trim(),
  };
}
