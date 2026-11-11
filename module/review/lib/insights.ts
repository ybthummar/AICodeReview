// Pure helpers (no server-only imports) shared by the AI pipeline, server actions and client components.

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type FindingSeverity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
  "security",
  "bug",
  "performance",
  "maintainability",
  "testing",
  "style",
] as const;
export type FindingCategory = (typeof CATEGORIES)[number];

export const VERDICTS = ["approve", "request_changes", "informational"] as const;
export type ReviewVerdict = (typeof VERDICTS)[number];

export const FINDING_STATUSES = ["open", "resolved", "dismissed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export type FindingSource = "ai" | "scanner" | "rule";
export type RiskLevel = "low" | "moderate" | "high" | "critical";

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  suggestion?: string;
  // Exact replacement for the flagged line, used for one-click GitHub suggestions.
  fix?: string;
  // Text of the flagged line when the review ran; auto-fix refuses to apply when it changed.
  original?: string;
  // Link to the pull request opened by auto-fix.
  fixUrl?: string;
  status: FindingStatus;
  source: FindingSource;
}

export interface WalkthroughFile {
  path: string;
  summary: string;
  additions: number;
  deletions: number;
}

export interface Walkthrough {
  files: WalkthroughFile[];
  // Mermaid source, validated before it is stored.
  diagram?: string;
}

export interface RevisionSnapshot {
  revision: number;
  at: string;
  riskScore: number;
  qualityScore: number;
  securityScore: number;
  open: number;
}

export interface ReviewInsights {
  version: 1;
  verdict: ReviewVerdict;
  summary: string;
  qualityScore: number;
  securityScore: number;
  riskScore: number;
  riskLevel: RiskLevel;
  findings: ReviewFinding[];
  revision: number;
  headSha?: string;
  // Titles of findings that disappeared since the previous run of this PR.
  autoResolved: string[];
  history: RevisionSnapshot[];
  walkthrough?: Walkthrough;
}

export const INSIGHTS_DELIMITER = "=====INSIGHTS_JSON=====";
const STORAGE_MARKER = "REPOPILOT_INSIGHTS";
const STORAGE_PATTERN = new RegExp(`\\s*<!--${STORAGE_MARKER}:([^>]*)-->\\s*$`);

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  security: "Security",
  bug: "Bug",
  performance: "Performance",
  maintainability: "Maintainability",
  testing: "Testing",
  style: "Style",
};

export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  approve: "Approve",
  request_changes: "Request Changes",
  informational: "Informational",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
  critical: "Critical risk",
};

export const STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const SEVERITY_WEIGHTS: Record<FindingSeverity, number> = {
  critical: 35,
  high: 18,
  medium: 7,
  low: 2,
  info: 0,
};

const MAX_FINDINGS = 30;
const MAX_HISTORY = 8;
const MAX_AUTO_RESOLVED = 10;
const MAX_WALKTHROUGH_FILES = 25;
const MAX_DIAGRAM_CHARS = 1800;

const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "may", "can", "not", "this", "that", "from", "into", "when", "which",
]);

function clampScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function countBySeverity(
  findings: Pick<ReviewFinding, "severity">[]
): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function getOpenFindings(insights: Pick<ReviewInsights, "findings">): ReviewFinding[] {
  return insights.findings.filter((f) => f.status === "open");
}

export function computeRiskScore(findings: Pick<ReviewFinding, "severity">[]): number {
  const total = findings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
  return Math.min(100, total);
}

export function getRiskLevel(
  riskScore: number,
  counts: Record<FindingSeverity, number>
): RiskLevel {
  if (counts.critical > 0) return "critical";
  if (counts.high > 0 || riskScore >= 40) return "high";
  if (counts.medium > 0 || riskScore >= 15) return "moderate";
  return "low";
}

export function fingerprintFinding(finding: {
  category: string;
  file?: string;
  title: string;
}): string {
  const words = finding.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w))
    .slice(0, 6)
    .sort();

  const base = `${finding.category}|${(finding.file ?? "").toLowerCase()}|${words.join(" ")}`;
  let hash = 5381;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) + hash + base.charCodeAt(i)) | 0;
  }
  return `f${(hash >>> 0).toString(36)}`;
}

function normalizeFinding(raw: unknown, defaultSource: FindingSource): ReviewFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const title = cleanText(obj.title, 140);
  if (!title) return null;

  const severity = SEVERITIES.includes(obj.severity as FindingSeverity)
    ? (obj.severity as FindingSeverity)
    : "low";
  const category = CATEGORIES.includes(obj.category as FindingCategory)
    ? (obj.category as FindingCategory)
    : "maintainability";

  const file = cleanText(obj.file, 200) || undefined;
  const line = Number(obj.line);
  const suggestion = cleanText(obj.suggestion, 500) || undefined;
  const fix = typeof obj.fix === "string" ? obj.fix.replace(/\s+$/, "").slice(0, 600) : "";
  const original = typeof obj.original === "string" ? obj.original.slice(0, 400) : "";
  const fixUrl = cleanText(obj.fixUrl, 300);

  const finding: ReviewFinding = {
    id: cleanText(obj.id, 40) || fingerprintFinding({ category, file, title }),
    severity,
    category,
    title,
    detail: cleanText(obj.detail, 500),
    status: FINDING_STATUSES.includes(obj.status as FindingStatus)
      ? (obj.status as FindingStatus)
      : "open",
    source:
      obj.source === "scanner" || obj.source === "ai" || obj.source === "rule"
        ? obj.source
        : defaultSource,
  };

  if (file) finding.file = file;
  if (Number.isInteger(line) && line > 0) finding.line = line;
  if (suggestion) finding.suggestion = suggestion;
  if (fix.trim() && finding.line) finding.fix = fix;
  if (original && finding.fix) finding.original = original;
  if (/^https:\/\/github\.com\//.test(fixUrl)) finding.fixUrl = fixUrl;

  return finding;
}

function normalizeFindingList(raw: unknown, defaultSource: FindingSource): ReviewFinding[] {
  const seen = new Map<string, number>();
  const list: ReviewFinding[] = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    const finding = normalizeFinding(item, defaultSource);
    if (!finding) continue;

    const count = (seen.get(finding.id) ?? 0) + 1;
    seen.set(finding.id, count);
    if (count > 1) finding.id = `${finding.id}-${count}`;
    list.push(finding);
  }

  return list
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
    .slice(0, MAX_FINDINGS);
}

function normalizeHistory(raw: unknown): RevisionSnapshot[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): RevisionSnapshot | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const revision = Number(o.revision);
      const riskScore = clampScore(o.riskScore);
      const qualityScore = clampScore(o.qualityScore);
      const securityScore = clampScore(o.securityScore);
      if (!Number.isInteger(revision) || riskScore === null || qualityScore === null || securityScore === null) {
        return null;
      }
      return {
        revision,
        at: cleanText(o.at, 40) || new Date(0).toISOString(),
        riskScore,
        qualityScore,
        securityScore,
        open: Math.max(0, Math.round(Number(o.open) || 0)),
      };
    })
    .filter((s): s is RevisionSnapshot => s !== null)
    .slice(-MAX_HISTORY);
}

const DIAGRAM_TYPES = ["flowchart", "graph", "sequenceDiagram"];
const DIAGRAM_FORBIDDEN = /<script|javascript:|%%\{|\bclick\s|```/i;

// Mermaid renders inside GitHub comments, so only plain diagram types without callbacks are kept.
export function sanitizeDiagram(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const cleaned = raw
    .replace(/^\s*```(?:mermaid)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  if (!cleaned || cleaned.length > MAX_DIAGRAM_CHARS) return undefined;
  if (!DIAGRAM_TYPES.some((type) => cleaned.startsWith(type))) return undefined;
  if (DIAGRAM_FORBIDDEN.test(cleaned)) return undefined;

  return cleaned;
}

export function normalizeWalkthrough(raw: unknown): Walkthrough | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const files = (Array.isArray(obj.files) ? obj.files : [])
    .map((item): WalkthroughFile | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const path = cleanText(o.path ?? o.file, 200);
      if (!path) return null;

      return {
        path,
        summary: cleanText(o.summary, 200),
        additions: Math.max(0, Math.round(Number(o.additions) || 0)),
        deletions: Math.max(0, Math.round(Number(o.deletions) || 0)),
      };
    })
    .filter((f): f is WalkthroughFile => f !== null)
    .slice(0, MAX_WALKTHROUGH_FILES);

  const diagram = sanitizeDiagram(obj.diagram);
  if (files.length === 0 && !diagram) return undefined;

  return diagram ? { files, diagram } : { files };
}

interface InsightsDraft {
  verdict: ReviewVerdict;
  summary: string;
  qualityScore: number;
  securityScore: number;
  findings: ReviewFinding[];
  revision: number;
  headSha?: string;
  autoResolved: string[];
  history: RevisionSnapshot[];
  walkthrough?: Walkthrough;
}

// Single place where derived values (risk, level, verdict floor, history snapshot) are computed.
function build(draft: InsightsDraft): ReviewInsights {
  const open = draft.findings.filter((f) => f.status === "open");
  const counts = countBySeverity(open);
  const riskScore = computeRiskScore(open);
  const blocking = counts.critical + counts.high > 0;

  const snapshot: RevisionSnapshot = {
    revision: draft.revision,
    at: new Date().toISOString(),
    riskScore,
    qualityScore: draft.qualityScore,
    securityScore: draft.securityScore,
    open: open.length,
  };

  const history = [...draft.history];
  const last = history[history.length - 1];
  if (last && last.revision === draft.revision) {
    history[history.length - 1] = { ...snapshot, at: last.at };
  } else {
    history.push(snapshot);
  }

  const insights: ReviewInsights = {
    version: 1,
    verdict: blocking ? "request_changes" : draft.verdict,
    summary: draft.summary,
    qualityScore: draft.qualityScore,
    securityScore: draft.securityScore,
    riskScore,
    riskLevel: getRiskLevel(riskScore, counts),
    findings: draft.findings,
    revision: draft.revision,
    autoResolved: draft.autoResolved.slice(0, MAX_AUTO_RESOLVED),
    history: history.slice(-MAX_HISTORY),
  };
  if (draft.headSha) insights.headSha = draft.headSha;
  if (draft.walkthrough) insights.walkthrough = draft.walkthrough;

  return insights;
}

export function normalizeInsights(raw: unknown): ReviewInsights | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const findings = normalizeFindingList(obj.findings, "ai");
  const open = findings.filter((f) => f.status === "open");
  const risk = computeRiskScore(open);
  const securityPenalty = computeRiskScore(open.filter((f) => f.category === "security"));

  const blocking = open.some((f) => f.severity === "critical" || f.severity === "high");
  const revision = Number(obj.revision);

  return build({
    verdict: VERDICTS.includes(obj.verdict as ReviewVerdict)
      ? (obj.verdict as ReviewVerdict)
      : blocking
        ? "request_changes"
        : "approve",
    summary: cleanText(obj.summary, 300),
    qualityScore: clampScore(obj.qualityScore) ?? 100 - risk,
    securityScore: clampScore(obj.securityScore) ?? 100 - securityPenalty,
    findings,
    revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
    headSha: cleanText(obj.headSha, 64) || undefined,
    autoResolved: (Array.isArray(obj.autoResolved) ? obj.autoResolved : [])
      .map((t) => cleanText(t, 140))
      .filter(Boolean),
    history: normalizeHistory(obj.history),
    walkthrough: normalizeWalkthrough(obj.walkthrough),
  });
}

// Carries state over from the previous run of the same PR: dismissed findings stay dismissed,
// findings that vanished count as fixed, and revision history grows.
export function reconcileInsights(
  next: ReviewInsights,
  previous: ReviewInsights | null
): ReviewInsights {
  if (!previous) return next;

  const previousById = new Map(previous.findings.map((f) => [f.id, f]));
  const nextIds = new Set(next.findings.map((f) => f.id));

  const findings = next.findings.map((f) =>
    previousById.get(f.id)?.status === "dismissed" ? { ...f, status: "dismissed" as const } : f
  );

  const autoResolved = previous.findings
    .filter((f) => f.status === "open" && !nextIds.has(f.id))
    .map((f) => f.title);

  return build({
    verdict: next.verdict,
    summary: next.summary,
    qualityScore: next.qualityScore,
    securityScore: next.securityScore,
    findings,
    revision: previous.revision + 1,
    headSha: next.headSha,
    autoResolved,
    history: previous.history,
    walkthrough: next.walkthrough,
  });
}

export function withHeadSha(insights: ReviewInsights, headSha: string): ReviewInsights {
  return headSha ? { ...insights, headSha } : insights;
}

export type ExtraFinding = Pick<ReviewFinding, "severity" | "category" | "title" | "detail"> &
  Partial<Pick<ReviewFinding, "file" | "line" | "suggestion" | "fix">> & {
    source?: FindingSource;
  };

function rebuild(
  insights: ReviewInsights,
  overrides: Partial<InsightsDraft> & { findings?: ReviewFinding[] } = {}
): ReviewInsights {
  return build({
    verdict: insights.verdict,
    summary: insights.summary,
    qualityScore: insights.qualityScore,
    securityScore: insights.securityScore,
    findings: insights.findings,
    revision: insights.revision,
    headSha: insights.headSha,
    autoResolved: insights.autoResolved,
    history: insights.history,
    walkthrough: insights.walkthrough,
    ...overrides,
  });
}

// Adds deterministic scanner and rule findings to an AI result (or builds one when the AI output was unusable).
export function addScannerFindings(
  insights: ReviewInsights | null,
  extras: ExtraFinding[]
): ReviewInsights | null {
  if (extras.length === 0) return insights;

  const added = normalizeFindingList(
    extras.map((e) => ({ ...e, source: e.source ?? "scanner" })),
    "scanner"
  );
  if (added.length === 0) return insights;

  if (!insights) {
    const open = added.filter((f) => f.status === "open");
    const risk = computeRiskScore(open);
    return build({
      verdict: open.some((f) => f.severity === "critical" || f.severity === "high")
        ? "request_changes"
        : "informational",
      summary: "Automated checks flagged issues in this change.",
      qualityScore: 100 - risk,
      securityScore: 100 - computeRiskScore(open.filter((f) => f.category === "security")),
      findings: added,
      revision: 1,
      autoResolved: [],
      history: [],
    });
  }

  const existingIds = new Set(insights.findings.map((f) => f.id));
  const merged = normalizeFindingList(
    [...insights.findings, ...added.filter((f) => !existingIds.has(f.id))],
    "ai"
  );
  const securityHits = added.filter((f) => f.category === "security" && !existingIds.has(f.id));

  return rebuild(insights, {
    securityScore: Math.max(0, insights.securityScore - Math.min(60, computeRiskScore(securityHits))),
    findings: merged,
  });
}

export function withUpdatedFindings(
  insights: ReviewInsights,
  update: (finding: ReviewFinding) => ReviewFinding
): ReviewInsights {
  return rebuild(insights, { findings: insights.findings.map(update) });
}

// Findings the team repeatedly rated as unhelpful are dismissed up front so they stop adding noise.
export function applyLearnedSuppressions(
  insights: ReviewInsights,
  suppressedIds: Set<string>
): ReviewInsights {
  if (suppressedIds.size === 0) return insights;

  const hasMatch = insights.findings.some((f) => f.status === "open" && suppressedIds.has(f.id));
  if (!hasMatch) return insights;

  return withUpdatedFindings(insights, (f) =>
    f.status === "open" && suppressedIds.has(f.id) ? { ...f, status: "dismissed" } : f
  );
}

export function setFindingFixUrl(
  insights: ReviewInsights,
  findingId: string,
  fixUrl: string
): ReviewInsights {
  return withUpdatedFindings(insights, (f) => (f.id === findingId ? { ...f, fixUrl } : f));
}

export function setWalkthrough(insights: ReviewInsights, walkthrough: Walkthrough): ReviewInsights {
  return rebuild(insights, { walkthrough });
}

export function applyFindingStatus(
  insights: ReviewInsights,
  findingId: string,
  status: FindingStatus
): ReviewInsights | null {
  if (!insights.findings.some((f) => f.id === findingId)) return null;

  const hadBlocking = getOpenFindings(insights).some(
    (f) => f.severity === "critical" || f.severity === "high"
  );

  const findings = insights.findings.map((f) => (f.id === findingId ? { ...f, status } : f));
  const open = findings.filter((f) => f.status === "open");
  const stillBlocking = open.some((f) => f.severity === "critical" || f.severity === "high");

  let verdict = insights.verdict;
  if (hadBlocking && !stillBlocking && verdict === "request_changes") {
    verdict = open.some((f) => f.severity === "medium") ? "informational" : "approve";
  }

  return rebuild(insights, { verdict, findings });
}

export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function extractInsightsFromModelOutput(text: string): {
  markdown: string;
  insights: ReviewInsights | null;
} {
  const index = text.lastIndexOf(INSIGHTS_DELIMITER);
  if (index === -1) {
    return { markdown: text.trim(), insights: null };
  }

  const markdown = text.slice(0, index).trim();
  const insights = normalizeInsights(
    extractJsonObject(text.slice(index + INSIGHTS_DELIMITER.length))
  );
  return { markdown, insights };
}

export function serializeReviewContent(
  markdown: string,
  insights: ReviewInsights | null
): string {
  if (!insights) return markdown;
  const encoded = encodeURIComponent(JSON.stringify(insights));
  return `${markdown}\n\n<!--${STORAGE_MARKER}:${encoded}-->`;
}

export function parseReviewContent(raw: string): {
  markdown: string;
  insights: ReviewInsights | null;
} {
  const match = STORAGE_PATTERN.exec(raw);
  if (!match) return { markdown: raw, insights: null };

  const markdown = raw.slice(0, match.index).trimEnd();
  try {
    const insights = normalizeInsights(JSON.parse(decodeURIComponent(match[1])));
    return { markdown, insights };
  } catch {
    return { markdown, insights: null };
  }
}

export function evaluateQualityGate(insights: ReviewInsights | null): {
  state: "success" | "failure";
  description: string;
} {
  if (!insights) {
    return { state: "success", description: "AI review completed" };
  }

  const counts = countBySeverity(getOpenFindings(insights));
  if (counts.critical + counts.high > 0) {
    return {
      state: "failure",
      description: `Changes requested: ${counts.critical} critical, ${counts.high} high severity finding(s)`.slice(0, 140),
    };
  }

  return {
    state: "success",
    description: `${RISK_LABELS[insights.riskLevel]} (${insights.riskScore}/100), quality ${insights.qualityScore}/100`.slice(0, 140),
  };
}

export function buildGitHubComment(
  markdown: string,
  insights: ReviewInsights | null
): string {
  if (!insights) return markdown;

  const counts = countBySeverity(getOpenFindings(insights));
  const openCount = SEVERITIES.reduce((sum, s) => sum + counts[s], 0);
  const findingSummary =
    openCount === 0
      ? "No open findings"
      : SEVERITIES.filter((s) => counts[s] > 0)
          .map((s) => `${counts[s]} ${SEVERITY_LABELS[s].toLowerCase()}`)
          .join(", ");

  const scorecard = [
    "| Verdict | Risk | Quality | Security | Findings |",
    "| --- | --- | --- | --- | --- |",
    `| **${VERDICT_LABELS[insights.verdict]}** | ${RISK_LABELS[insights.riskLevel]} (${insights.riskScore}/100) | ${insights.qualityScore}/100 | ${insights.securityScore}/100 | ${findingSummary} |`,
  ].join("\n");

  const progress =
    insights.revision > 1
      ? `\n\n_Review revision ${insights.revision}: ${insights.autoResolved.length} earlier finding(s) no longer present._`
      : "";

  return `${scorecard}${progress}${buildWalkthroughMarkdown(insights.walkthrough)}\n\n${markdown}`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function buildWalkthroughMarkdown(walkthrough: Walkthrough | undefined): string {
  if (!walkthrough || (walkthrough.files.length === 0 && !walkthrough.diagram)) return "";

  const parts: string[] = [];

  if (walkthrough.files.length > 0) {
    parts.push(
      [
        "| File | Changes | Summary |",
        "| --- | --- | --- |",
        ...walkthrough.files.map(
          (f) => `| \`${escapeCell(f.path)}\` | +${f.additions} / -${f.deletions} | ${escapeCell(f.summary) || "-"} |`
        ),
      ].join("\n")
    );
  }

  if (walkthrough.diagram) {
    parts.push("```mermaid\n" + walkthrough.diagram + "\n```");
  }

  return `\n\n<details>\n<summary>Walkthrough (${walkthrough.files.length} file${walkthrough.files.length === 1 ? "" : "s"})</summary>\n\n${parts.join("\n\n")}\n\n</details>`;
}

export interface InsightReviewInput {
  id: string;
  prNumber: number;
  prTitle: string;
  repoFullName: string;
  createdAt: Date | string;
  review: string;
}

export interface ReviewInsightsOverview {
  totalReviews: number;
  analyzedReviews: number;
  avgQuality: number | null;
  avgSecurity: number | null;
  avgRisk: number | null;
  verdicts: Record<ReviewVerdict, number>;
  severityCounts: Record<FindingSeverity, number>;
  categoryCounts: Record<FindingCategory, number>;
  resolution: {
    open: number;
    resolved: number;
    dismissed: number;
    autoResolved: number;
    rate: number | null;
  };
  // Thumbs up and down votes on findings; filled in by the server action.
  feedback: { up: number; down: number };
  trend: {
    label: string;
    quality: number;
    security: number;
    risk: number;
    reviews: number;
  }[];
  attention: {
    id: string;
    prNumber: number;
    prTitle: string;
    repoFullName: string;
    riskScore: number;
    riskLevel: RiskLevel;
    verdict: ReviewVerdict;
    createdAt: string;
  }[];
}

function weekStartUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // Monday as first day of week
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function buildInsightsOverview(
  reviews: InsightReviewInput[],
  trendWeeks = 8
): ReviewInsightsOverview {
  const verdicts: Record<ReviewVerdict, number> = {
    approve: 0,
    request_changes: 0,
    informational: 0,
  };
  const severityCounts = countBySeverity([]);
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
    FindingCategory,
    number
  >;
  const resolution = { open: 0, resolved: 0, dismissed: 0, autoResolved: 0 };

  const analyzed: { input: InsightReviewInput; insights: ReviewInsights; date: Date }[] = [];

  for (const input of reviews) {
    const { insights } = parseReviewContent(input.review);
    if (!insights) continue;

    analyzed.push({ input, insights, date: new Date(input.createdAt) });
    verdicts[insights.verdict] += 1;
    resolution.autoResolved += insights.autoResolved.length;

    for (const finding of insights.findings) {
      if (finding.status === "open") {
        severityCounts[finding.severity] += 1;
        categoryCounts[finding.category] += 1;
        resolution.open += 1;
      } else if (finding.status === "resolved") {
        resolution.resolved += 1;
      } else {
        resolution.dismissed += 1;
      }
    }
  }

  const buckets = new Map<number, { quality: number[]; security: number[]; risk: number[] }>();
  for (const { insights, date } of analyzed) {
    const key = weekStartUtc(date).getTime();
    const bucket = buckets.get(key) ?? { quality: [], security: [], risk: [] };
    bucket.quality.push(insights.qualityScore);
    bucket.security.push(insights.securityScore);
    bucket.risk.push(insights.riskScore);
    buckets.set(key, bucket);
  }

  const trend = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-trendWeeks)
    .map(([key, bucket]) => ({
      label: new Date(key).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      quality: average(bucket.quality) ?? 0,
      security: average(bucket.security) ?? 0,
      risk: average(bucket.risk) ?? 0,
      reviews: bucket.quality.length,
    }));

  const attention = analyzed
    .filter(({ insights }) => insights.riskLevel !== "low")
    .sort((a, b) => b.insights.riskScore - a.insights.riskScore)
    .slice(0, 5)
    .map(({ input, insights, date }) => ({
      id: input.id,
      prNumber: input.prNumber,
      prTitle: input.prTitle,
      repoFullName: input.repoFullName,
      riskScore: insights.riskScore,
      riskLevel: insights.riskLevel,
      verdict: insights.verdict,
      createdAt: date.toISOString(),
    }));

  const fixed = resolution.resolved + resolution.autoResolved;
  const tracked = fixed + resolution.open;

  return {
    totalReviews: reviews.length,
    analyzedReviews: analyzed.length,
    avgQuality: average(analyzed.map((a) => a.insights.qualityScore)),
    avgSecurity: average(analyzed.map((a) => a.insights.securityScore)),
    avgRisk: average(analyzed.map((a) => a.insights.riskScore)),
    verdicts,
    severityCounts,
    categoryCounts,
    resolution: {
      ...resolution,
      rate: tracked === 0 ? null : Math.round((fixed / tracked) * 100),
    },
    feedback: { up: 0, down: 0 },
    trend,
    attention,
  };
}
