import { generateWithFallback } from "@/module/ai/lib/generate";
import {
  extractInsightsFromModelOutput,
  INSIGHTS_DELIMITER,
  type ReviewInsights,
} from "@/module/review/lib/insights";
import { buildRulesPrompt, type ReviewConfig } from "@/module/review-rules/lib/config";
import type { ASTSymbolContext } from "@/types/review/types";

const MAX_DIFF_CHARS = 20000;

export interface ReviewPromptInput {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description: string;
  headRef: string;
  baseRef: string;
  commitsSummary: string;
  filesSummary: string;
  diff: string;
  astContext: ASTSymbolContext[];
  config: ReviewConfig;
}

function formatASTContext(symbols: ASTSymbolContext[]) {
  if (!symbols || symbols.length === 0) return "";

  return symbols
    .slice(0, 5)
    .map((s) => {
      if (s.symbolName) {
        const header = `File: ${s.path} | Symbol: ${s.symbolName} (${s.symbolType ?? "unknown"}) | Lines: ${s.startLine ?? "?"}-${s.endLine ?? "?"}`;
        return s.content ? `${header}\n${s.content.slice(0, 500)}` : header;
      }
      if (s.content) {
        return `File: ${s.path}\nSnippet:\n${s.content.slice(0, 300)}`;
      }
      return `File: ${s.path}`;
    })
    .join("\n\n");
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const { owner, repo, prNumber, title, description, headRef, baseRef } = input;

  const diff =
    input.diff.length > MAX_DIFF_CHARS
      ? input.diff.slice(0, MAX_DIFF_CHARS) + "\n\n...[Diff truncated due to length]..."
      : input.diff;

  const diffSection =
    diff.trim().length > 0
      ? `\`\`\`diff\n${diff}\n\`\`\``
      : "Note: There are no reviewable changes in this diff (empty, reverse merge, branch sync, or only ignored files). Evaluate branch hygiene and CI/CD implications instead.";

  const walkthroughShape = input.config.walkthrough
    ? `,
  "walkthrough": {
    "files": [{ "path": "file path from the diff", "summary": "at most 15 words describing what changed in that file" }],
    "diagram": "Mermaid source (flowchart TD) with at most 12 nodes showing how the changed parts interact, or omit"
  }`
    : "";

  const walkthroughRules = input.config.walkthrough
    ? `
- walkthrough.files: at most 15 of the most important changed files. walkthrough.diagram must start with "flowchart TD", quote every node label, and must not use click, style or init directives.`
    : "";

  return `
You are a senior software engineer performing a constructive, high-speed code review.

REVIEW RULES:
${buildRulesPrompt(input.config)}

PR METADATA:
Repository: ${owner}/${repo}
PR Number: #${prNumber}
Title: ${title}
Description: ${description || "No description provided"}
${headRef && baseRef ? `Branch Tracking: ${headRef} -> ${baseRef}` : ""}
${input.commitsSummary ? `\nCOMMITS ON THIS PR:\n${input.commitsSummary}\n` : ""}
${input.filesSummary ? `\nFILES CHANGED:\n${input.filesSummary}\n` : ""}

RELEVANT CODE CONTEXT:
${formatASTContext(input.astContext) || "No indexed symbols"}

DIFF / CODE CHANGES:
${diffSection}

OUTPUT FORMAT (follow exactly):

PART 1 - GitHub Markdown review with these sections:
1. **Summary**: What changed, architectural intent, and branch relationship (2-3 sentences).
2. **Key Findings**: Architectural, logical, performance, or security observations. Use bullet points.
3. **Suggestions**: Concrete code improvements, testing guidance, or branch hygiene recommendations.
4. **Conclusion**: Concise verdict (Approve / Request Changes / Informational).

PART 2 - After the markdown, write a line containing exactly ${INSIGHTS_DELIMITER} and then ONE valid JSON object (no code fences, no commentary) shaped like:
{
  "verdict": "approve" | "request_changes" | "informational",
  "summary": "one sentence, max 200 characters",
  "qualityScore": integer 0-100 (higher = better correctness and maintainability),
  "securityScore": integer 0-100 (higher = safer),
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "category": "security" | "bug" | "performance" | "maintainability" | "testing" | "style",
      "title": "short title",
      "detail": "1-2 sentences explaining the problem",
      "file": "path from the diff (omit if unknown)",
      "line": line number in the NEW version of the file, taken from the diff (omit if unknown),
      "suggestion": "concrete fix described in words (omit if none)",
      "fix": "exact replacement text for that single line, no diff markers (omit unless you are certain)"
    }
  ]${walkthroughShape}
}

JSON RULES:
- Only report problems evidenced by the diff. Never invent files or line numbers.
- critical = exploitable vulnerability, data loss or crash on a main code path. high = likely bug or serious security weakness. medium/low = real but non-blocking. info = observation.
- Use "fix" only when one replacement line fully fixes the issue and the line is an added line in the diff.
- At most 10 findings, most severe first. Use an empty array when the change is clean.${walkthroughRules}
  `.trim();
}

export async function generateStructuredReview(
  input: ReviewPromptInput
): Promise<{ markdown: string; insights: ReviewInsights | null }> {
  const text = await generateWithFallback(buildReviewPrompt(input));
  return extractInsightsFromModelOutput(text);
}
