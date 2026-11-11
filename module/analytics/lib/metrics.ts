import {
  getOpenFindings,
  parseReviewContent,
  type ReviewInsights,
} from "@/module/review/lib/insights";

export interface AnalyticsPullRequest {
  repoFullName: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface AnalyticsReview {
  repoFullName: string;
  prNumber: number;
  createdAt: Date | string;
  review: string;
}

export interface AuthorStats {
  author: string;
  merged: number;
  reviewed: number;
  avgRisk: number | null;
  avgQuality: number | null;
  medianCycleHours: number | null;
}

export interface RiskyFile {
  file: string;
  repoFullName: string;
  findings: number;
  blocking: number;
}

export interface WeeklyThroughput {
  label: string;
  merged: number;
  medianCycleHours: number | null;
}

export interface EngineeringAnalytics {
  windowDays: number;
  pullRequests: { merged: number; closedUnmerged: number };
  medianCycleHours: number | null;
  medianFirstReviewMinutes: number | null;
  reviewedBeforeMergeRate: number | null;
  mergedWithBlockingFindings: number;
  weekly: WeeklyThroughput[];
  authors: AuthorStats[];
  riskyFiles: RiskyFile[];
  skippedRepositories: string[];
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function weekStartUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

function prKey(repoFullName: string, number: number): string {
  return `${repoFullName.toLowerCase()}#${number}`;
}

interface PullRequestReviews {
  firstAt: Date;
  latest: ReviewInsights | null;
}

// Pulls the first review time and the latest structured insights for each pull request.
function groupReviews(reviews: AnalyticsReview[]): Map<string, PullRequestReviews> {
  const grouped = new Map<string, PullRequestReviews & { latestAt: number }>();

  for (const review of reviews) {
    const createdAt = new Date(review.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;

    const key = prKey(review.repoFullName, review.prNumber);
    const insights = parseReviewContent(review.review).insights;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, { firstAt: createdAt, latest: insights, latestAt: createdAt.getTime() });
      continue;
    }

    if (createdAt < existing.firstAt) existing.firstAt = createdAt;
    if (createdAt.getTime() > existing.latestAt && insights) {
      existing.latest = insights;
      existing.latestAt = createdAt.getTime();
    }
  }

  return grouped;
}

export function buildEngineeringAnalytics(
  pullRequests: AnalyticsPullRequest[],
  reviews: AnalyticsReview[],
  windowDays: number,
  now: Date = new Date(),
  skippedRepositories: string[] = []
): EngineeringAnalytics {
  const since = new Date(now.getTime() - windowDays * 24 * HOUR_MS);
  const reviewsByPr = groupReviews(reviews);

  const merged = pullRequests.filter((pr) => pr.mergedAt && new Date(pr.mergedAt) >= since);
  const closedUnmerged = pullRequests.filter(
    (pr) => !pr.mergedAt && pr.closedAt && new Date(pr.closedAt) >= since
  );

  const cycleHours = (pr: AnalyticsPullRequest): number | null => {
    if (!pr.mergedAt) return null;
    const hours = (new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / HOUR_MS;
    return hours >= 0 ? hours : null;
  };

  const allCycles = merged.map(cycleHours).filter((h): h is number => h !== null);

  // Time between a pull request opening and its first completed AI review.
  const firstReviewMinutes: number[] = [];
  for (const pr of [...merged, ...closedUnmerged]) {
    const grouped = reviewsByPr.get(prKey(pr.repoFullName, pr.number));
    if (!grouped) continue;
    const minutes = (grouped.firstAt.getTime() - new Date(pr.createdAt).getTime()) / MINUTE_MS;
    if (minutes >= 0) firstReviewMinutes.push(minutes);
  }

  let reviewedMerged = 0;
  let mergedWithBlocking = 0;
  for (const pr of merged) {
    const grouped = reviewsByPr.get(prKey(pr.repoFullName, pr.number));
    if (!grouped) continue;
    reviewedMerged += 1;
    if (
      grouped.latest &&
      getOpenFindings(grouped.latest).some((f) => f.severity === "critical" || f.severity === "high")
    ) {
      mergedWithBlocking += 1;
    }
  }

  // Throughput per week.
  const weeks = new Map<number, { merged: number; cycles: number[] }>();
  for (const pr of merged) {
    const key = weekStartUtc(new Date(pr.mergedAt as string)).getTime();
    const bucket = weeks.get(key) ?? { merged: 0, cycles: [] };
    bucket.merged += 1;
    const hours = cycleHours(pr);
    if (hours !== null) bucket.cycles.push(hours);
    weeks.set(key, bucket);
  }

  const weekly = Array.from(weeks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, bucket]) => ({
      label: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      merged: bucket.merged,
      medianCycleHours: round1(median(bucket.cycles)),
    }));

  // Per-author stats use every pull request touched in the window.
  const authors = new Map<
    string,
    { merged: number; cycles: number[]; risk: number[]; quality: number[]; reviewed: number }
  >();
  for (const pr of [...merged, ...closedUnmerged]) {
    const entry = authors.get(pr.author) ?? { merged: 0, cycles: [], risk: [], quality: [], reviewed: 0 };

    if (pr.mergedAt) {
      entry.merged += 1;
      const hours = cycleHours(pr);
      if (hours !== null) entry.cycles.push(hours);
    }

    const insights = reviewsByPr.get(prKey(pr.repoFullName, pr.number))?.latest;
    if (insights) {
      entry.reviewed += 1;
      entry.risk.push(insights.riskScore);
      entry.quality.push(insights.qualityScore);
    }

    authors.set(pr.author, entry);
  }

  const authorStats: AuthorStats[] = Array.from(authors.entries())
    .map(([author, entry]) => ({
      author,
      merged: entry.merged,
      reviewed: entry.reviewed,
      avgRisk: average(entry.risk),
      avgQuality: average(entry.quality),
      medianCycleHours: round1(median(entry.cycles)),
    }))
    .sort((a, b) => b.merged - a.merged || b.reviewed - a.reviewed)
    .slice(0, 12);

  // Files that repeatedly attract findings across the pull requests in the window.
  const windowKeys = new Set([...merged, ...closedUnmerged].map((pr) => prKey(pr.repoFullName, pr.number)));
  const files = new Map<string, RiskyFile>();
  const repoByKey = new Map<string, string>();
  for (const pr of [...merged, ...closedUnmerged]) repoByKey.set(prKey(pr.repoFullName, pr.number), pr.repoFullName);

  for (const [key, grouped] of reviewsByPr) {
    if (!windowKeys.has(key) || !grouped.latest) continue;
    const repoFullName = repoByKey.get(key) ?? "";

    for (const finding of grouped.latest.findings) {
      if (!finding.file) continue;
      const fileKey = `${repoFullName}::${finding.file}`;
      const entry = files.get(fileKey) ?? { file: finding.file, repoFullName, findings: 0, blocking: 0 };
      entry.findings += 1;
      if (finding.severity === "critical" || finding.severity === "high") entry.blocking += 1;
      files.set(fileKey, entry);
    }
  }

  const riskyFiles = Array.from(files.values())
    .sort((a, b) => b.blocking - a.blocking || b.findings - a.findings)
    .slice(0, 10);

  return {
    windowDays,
    pullRequests: { merged: merged.length, closedUnmerged: closedUnmerged.length },
    medianCycleHours: round1(median(allCycles)),
    medianFirstReviewMinutes: round1(median(firstReviewMinutes)),
    reviewedBeforeMergeRate: merged.length === 0 ? null : Math.round((reviewedMerged / merged.length) * 100),
    mergedWithBlockingFindings: mergedWithBlocking,
    weekly,
    authors: authorStats,
    riskyFiles,
    skippedRepositories,
  };
}
