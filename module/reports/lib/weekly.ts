import {
  buildInsightsOverview,
  CATEGORY_LABELS,
  getOpenFindings,
  parseReviewContent,
  RISK_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  VERDICT_LABELS,
  type ReviewFinding,
} from "@/module/review/lib/insights";
import { escapeHtml, type ExportReview } from "@/module/reports/lib/export";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#be123c",
  high: "#c2410c",
  medium: "#b45309",
  low: "#0369a1",
  info: "#475569",
};

interface LatestReview {
  review: ExportReview;
  findings: ReviewFinding[];
}

function latestPerPullRequest(reviews: ExportReview[]): LatestReview[] {
  const seen = new Set<string>();
  const latest: LatestReview[] = [];

  // Reviews arrive newest first, so the first one per pull request is the current state.
  for (const review of reviews) {
    const key = `${review.repoFullName}#${review.prNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const insights = parseReviewContent(review.review).insights;
    latest.push({ review, findings: insights ? getOpenFindings(insights) : [] });
  }

  return latest;
}

export function buildWeeklyReportHtml(input: {
  reviews: ExportReview[];
  days: number;
  scopeLabel: string;
  generatedAt?: Date;
}): string {
  const generatedAt = input.generatedAt ?? new Date();
  const since = new Date(generatedAt.getTime() - input.days * 24 * 60 * 60 * 1000);
  const overview = buildInsightsOverview(input.reviews);
  const latest = latestPerPullRequest(input.reviews);

  const blocking = latest
    .flatMap(({ review, findings }) =>
      findings
        .filter((f) => f.severity === "critical" || f.severity === "high")
        .map((finding) => ({ review, finding }))
    )
    .sort((a, b) => SEVERITIES.indexOf(a.finding.severity) - SEVERITIES.indexOf(b.finding.severity))
    .slice(0, 12);

  const date = (d: Date) => d.toISOString().slice(0, 10);
  const value = (n: number | null) => (n === null ? "-" : String(n));

  const severityRows = SEVERITIES.map(
    (s) =>
      `<tr><td><span class="dot" style="background:${SEVERITY_COLORS[s]}"></span>${escapeHtml(SEVERITY_LABELS[s])}</td><td class="num">${overview.severityCounts[s]}</td></tr>`
  ).join("");

  const pullRequestRows = latest
    .slice(0, 40)
    .map(({ review }) => {
      const insights = parseReviewContent(review.review).insights;
      return `<tr>
        <td>${escapeHtml(review.repoFullName)}</td>
        <td>#${review.prNumber} ${escapeHtml(review.prTitle)}</td>
        <td>${insights ? escapeHtml(VERDICT_LABELS[insights.verdict]) : "-"}</td>
        <td>${insights ? escapeHtml(RISK_LABELS[insights.riskLevel]) : "-"}</td>
        <td class="num">${insights ? insights.riskScore : "-"}</td>
      </tr>`;
    })
    .join("");

  const blockingRows = blocking
    .map(
      ({ review, finding }) => `<tr>
        <td><span class="dot" style="background:${SEVERITY_COLORS[finding.severity]}"></span>${escapeHtml(SEVERITY_LABELS[finding.severity])}</td>
        <td>${escapeHtml(finding.title)}<div class="muted">${escapeHtml(CATEGORY_LABELS[finding.category])}${
          finding.file ? ` · ${escapeHtml(finding.file)}${finding.line ? `:${finding.line}` : ""}` : ""
        }</div></td>
        <td>${escapeHtml(review.repoFullName)} #${review.prNumber}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RepoPilot report ${escapeHtml(date(since))} to ${escapeHtml(date(generatedAt))}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 32px; background: #f8fafc; }
  main { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
  h1 { margin: 0; font-size: 26px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin: 28px 0 10px; }
  .muted { color: #64748b; font-size: 12px; margin-top: 2px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 20px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
  .kpi b { display: block; font-size: 24px; }
  .kpi span { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
  .note { margin-top: 24px; font-size: 12px; color: #64748b; }
  @media print { body { background: #fff; padding: 0; } main { border: 0; padding: 0; } .note { display: none; } }
</style>
</head>
<body>
<main>
  <h1>RepoPilot code review report</h1>
  <div class="muted">${escapeHtml(input.scopeLabel)} · ${escapeHtml(date(since))} to ${escapeHtml(date(generatedAt))}</div>

  <div class="kpis">
    <div class="kpi"><b>${overview.analyzedReviews}</b><span>Reviews</span></div>
    <div class="kpi"><b>${value(overview.avgQuality)}</b><span>Avg quality</span></div>
    <div class="kpi"><b>${value(overview.avgSecurity)}</b><span>Avg security</span></div>
    <div class="kpi"><b>${value(overview.avgRisk)}</b><span>Avg risk</span></div>
  </div>

  <h2>Verdicts</h2>
  <table>
    <tr><td>Approve</td><td class="num">${overview.verdicts.approve}</td></tr>
    <tr><td>Request changes</td><td class="num">${overview.verdicts.request_changes}</td></tr>
    <tr><td>Informational</td><td class="num">${overview.verdicts.informational}</td></tr>
  </table>

  <h2>Open findings by severity</h2>
  <table>${severityRows}</table>
  <div class="muted">Fix rate: ${overview.resolution.rate === null ? "no findings tracked" : `${overview.resolution.rate}%`} (${
    overview.resolution.resolved + overview.resolution.autoResolved
  } fixed, ${overview.resolution.open} open, ${overview.resolution.dismissed} dismissed)</div>

  <h2>Open critical and high findings</h2>
  ${
    blocking.length === 0
      ? `<div class="muted">None. No pull request in this period has open critical or high findings.</div>`
      : `<table><thead><tr><th>Severity</th><th>Finding</th><th>Pull request</th></tr></thead><tbody>${blockingRows}</tbody></table>`
  }

  <h2>Pull requests reviewed</h2>
  ${
    latest.length === 0
      ? `<div class="muted">No completed reviews in this period.</div>`
      : `<table><thead><tr><th>Repository</th><th>Pull request</th><th>Verdict</th><th>Risk</th><th class="num">Score</th></tr></thead><tbody>${pullRequestRows}</tbody></table>`
  }

  <p class="note">Print this page or choose "Save as PDF" in your browser's print dialog to share it.</p>
</main>
</body>
</html>`;
}
