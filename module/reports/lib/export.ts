import { parseReviewContent } from "@/module/review/lib/insights";

export interface ExportReview {
  id: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  createdAt: Date;
  review: string;
}

// Spreadsheet applications run cells that start with these characters as formulas.
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const FINDINGS_CSV_HEADER = [
  "repository",
  "pull_request",
  "pull_request_title",
  "pull_request_url",
  "reviewed_at",
  "revision",
  "finding_id",
  "severity",
  "category",
  "title",
  "detail",
  "file",
  "line",
  "status",
  "source",
] as const;

export function buildFindingsCsv(reviews: ExportReview[]): string {
  const lines = [FINDINGS_CSV_HEADER.join(",")];

  for (const review of reviews) {
    const { insights } = parseReviewContent(review.review);
    if (!insights) continue;

    for (const finding of insights.findings) {
      lines.push(
        [
          review.repoFullName,
          review.prNumber,
          review.prTitle,
          review.prUrl,
          review.createdAt.toISOString(),
          insights.revision,
          finding.id,
          finding.severity,
          finding.category,
          finding.title,
          finding.detail,
          finding.file ?? "",
          finding.line ?? "",
          finding.status,
          finding.source,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  // The BOM keeps Excel from mangling UTF-8 characters.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
