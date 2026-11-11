import {
  CATEGORY_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  withUpdatedFindings,
  type ReviewFinding,
  type ReviewInsights,
} from "@/module/review/lib/insights";
import { normalizeDiffPath, type ParsedDiffFile } from "@/module/github/lib/diff";
import { BOT_MARKER, findingMarker } from "@/module/github/lib/markers";

export interface InlineComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

const MAX_INLINE_COMMENTS = 10;
const MAX_LINE_SNAP = 3;

export function findDiffFile(files: ParsedDiffFile[], path: string): ParsedDiffFile | null {
  const target = normalizeDiffPath(path);
  return (
    files.find((f) => f.path === target) ??
    files.find((f) => f.path.endsWith(`/${target}`) || target.endsWith(`/${f.path}`)) ??
    null
  );
}

// Auto-fix only applies a suggestion when the line still matches what the review saw.
export function attachOriginalLines(insights: ReviewInsights, files: ParsedDiffFile[]): ReviewInsights {
  return withUpdatedFindings(insights, (finding) => {
    if (!finding.fix || !finding.file || !finding.line) return finding;

    const original = findDiffFile(files, finding.file)?.lineText.get(finding.line);

    if (original !== undefined && original !== finding.fix) {
      return { ...finding, original };
    }

    const withoutFix = { ...finding };
    delete withoutFix.fix;
    delete withoutFix.original;
    return withoutFix;
  });
}

function snapToVisibleLine(file: ParsedDiffFile, line: number): number | null {
  if (file.visibleLines.has(line)) return line;

  for (let offset = 1; offset <= MAX_LINE_SNAP; offset++) {
    if (file.visibleLines.has(line + offset)) return line + offset;
    if (file.visibleLines.has(line - offset)) return line - offset;
  }
  return null;
}

function buildBody(finding: ReviewFinding, allowSuggestion: boolean): string {
  const parts = [
    `**${SEVERITY_LABELS[finding.severity]} · ${CATEGORY_LABELS[finding.category]}**: ${finding.title}`,
  ];

  if (finding.detail) parts.push(finding.detail);
  if (finding.suggestion) parts.push(`_Suggestion:_ ${finding.suggestion}`);

  if (allowSuggestion && finding.fix && !finding.fix.includes("```")) {
    parts.push("```suggestion\n" + finding.fix + "\n```");
  }

  parts.push(`<sub>RepoPilot AI</sub>\n\n${findingMarker(finding.id)}\n${BOT_MARKER}`);
  return parts.join("\n\n");
}

// Only findings that point at lines GitHub can actually comment on are returned.
export function buildInlineComments(
  findings: ReviewFinding[],
  files: ParsedDiffFile[]
): InlineComment[] {
  const candidates = findings
    .filter((f) => f.status === "open" && f.file && f.line && f.severity !== "info")
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  const comments: InlineComment[] = [];
  const usedLines = new Set<string>();

  for (const finding of candidates) {
    if (comments.length >= MAX_INLINE_COMMENTS) break;

    const file = findDiffFile(files, finding.file as string);
    if (!file || file.isDeleted) continue;

    const line = snapToVisibleLine(file, finding.line as number);
    if (line === null) continue;

    const key = `${file.path}:${line}`;
    if (usedLines.has(key)) continue;
    usedLines.add(key);

    comments.push({
      path: file.path,
      line,
      side: "RIGHT",
      body: buildBody(finding, line === finding.line),
    });
  }

  return comments;
}
