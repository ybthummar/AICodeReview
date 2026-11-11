import prisma from "@/lib/db";
import { applyLearnedSuppressions, type ReviewInsights } from "@/module/review/lib/insights";

// A finding is only learned away after at least two net thumbs-down, and never for critical or high severity.
const SUPPRESSION_THRESHOLD = 2;
const NEVER_SUPPRESSED = new Set(["critical", "high"]);

export async function loadSuppressedFindingIds(repositoryId: string): Promise<Set<string>> {
  const groups = await prisma.findingFeedback.groupBy({
    by: ["findingId", "vote", "severity"],
    where: { repositoryId },
    _count: { _all: true },
  });

  const net = new Map<string, number>();
  const severities = new Map<string, string>();

  for (const group of groups) {
    const delta = group.vote === "down" ? group._count._all : -group._count._all;
    net.set(group.findingId, (net.get(group.findingId) ?? 0) + delta);
    severities.set(group.findingId, group.severity);
  }

  const suppressed = new Set<string>();
  for (const [findingId, score] of net) {
    if (score >= SUPPRESSION_THRESHOLD && !NEVER_SUPPRESSED.has(severities.get(findingId) ?? "")) {
      suppressed.add(findingId);
    }
  }

  return suppressed;
}

export async function suppressLearnedFindings(
  insights: ReviewInsights,
  repositoryId: string
): Promise<ReviewInsights> {
  try {
    return applyLearnedSuppressions(insights, await loadSuppressedFindingIds(repositoryId));
  } catch (error) {
    console.warn("Learned suppressions skipped:", error);
    return insights;
  }
}
