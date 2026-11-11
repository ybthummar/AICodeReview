import prisma from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { isProActive } from "@/lib/subscription";

export const USAGE_KINDS = ["reviews", "chats", "toolkit"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const USAGE_LABELS: Record<UsageKind, string> = {
  reviews: "AI reviews",
  chats: "Codebase questions",
  toolkit: "Toolkit generations",
};

function readLimit(envName: string, fallback: number): number {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getFreeLimits(): Record<UsageKind, number> {
  return {
    reviews: readLimit("FREE_MONTHLY_REVIEW_LIMIT", 10),
    chats: readLimit("FREE_MONTHLY_CHAT_LIMIT", 30),
    toolkit: readLimit("FREE_MONTHLY_TOOLKIT_LIMIT", 20),
  };
}

export class QuotaExceededError extends Error {
  kind: UsageKind;
  limit: number;

  constructor(kind: UsageKind, limit: number) {
    super(
      `You have used all ${limit} ${USAGE_LABELS[kind].toLowerCase()} included in the Free plan this month. Upgrade to PRO for unlimited usage.`
    );
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.limit = limit;
  }
}

export interface UsageItem {
  kind: UsageKind;
  label: string;
  used: number;
  limit: number | null;
}

export interface UsageSnapshot {
  unlimited: boolean;
  period: string;
  resetsAt: string;
  items: UsageItem[];
}

type UsageCounts = Record<string, Partial<Record<UsageKind, number>>>;

function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextReset(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export async function hasUnlimitedPlan(userId: string): Promise<boolean> {
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

  if (isAdminUser(user)) return true;
  return isProActive(user);
}

async function readCounts(userId: string): Promise<UsageCounts> {
  const usage = await prisma.userUsage.findUnique({
    where: { userId },
    select: { reviewCounts: true },
  });

  const raw = usage?.reviewCounts;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as unknown as UsageCounts) : {};
}

export async function getUsageSnapshot(userId: string): Promise<UsageSnapshot> {
  const [unlimited, counts] = await Promise.all([hasUnlimitedPlan(userId), readCounts(userId)]);
  const period = currentPeriod();
  const limits = getFreeLimits();

  return {
    unlimited,
    period,
    resetsAt: nextReset(),
    items: USAGE_KINDS.map((kind) => ({
      kind,
      label: USAGE_LABELS[kind],
      used: counts[period]?.[kind] ?? 0,
      limit: unlimited ? null : limits[kind],
    })),
  };
}

async function writeUsage(userId: string, kind: UsageKind, delta: number): Promise<void> {
  const period = currentPeriod();
  const counts = await readCounts(userId);

  const keepPeriods = Object.keys(counts).sort().slice(-5);
  const next: UsageCounts = {};
  for (const key of keepPeriods) next[key] = counts[key];

  const bucket = { ...(next[period] ?? {}) };
  bucket[kind] = Math.max(0, (bucket[kind] ?? 0) + delta);
  next[period] = bucket;

  const json = JSON.parse(JSON.stringify(next));

  await prisma.userUsage.upsert({
    where: { userId },
    update: { reviewCounts: json },
    create: { userId, reviewCounts: json },
  });
}

// Throws QuotaExceededError for Free users who are out of allowance; PRO/admin usage is only tracked.
export async function consumeUsage(userId: string, kind: UsageKind): Promise<void> {
  const [unlimited, counts] = await Promise.all([hasUnlimitedPlan(userId), readCounts(userId)]);

  if (!unlimited) {
    const limit = getFreeLimits()[kind];
    const used = counts[currentPeriod()]?.[kind] ?? 0;
    if (used >= limit) {
      throw new QuotaExceededError(kind, limit);
    }
  }

  await writeUsage(userId, kind, 1);
}

export async function refundUsage(userId: string, kind: UsageKind): Promise<void> {
  try {
    await writeUsage(userId, kind, -1);
  } catch (error) {
    console.warn(`Could not refund ${kind} usage for ${userId}:`, error);
  }
}
