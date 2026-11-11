export const PRO_PERIOD_DAYS = 30;
export const MAX_PREPAID_DAYS = 330;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionFields {
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// A PRO plan without an end date was granted by an admin (or paid before expiry existed) and never lapses.
export function isProActive(user: SubscriptionFields | null | undefined, now = new Date()): boolean {
  if (!user) return false;
  if (user.subscriptionTier !== "PRO" || user.subscriptionStatus !== "ACTIVE") return false;

  const endsAt = toDate(user.subscriptionEndsAt);
  return endsAt === null || endsAt.getTime() > now.getTime();
}

export function nextPeriodEnd(currentEnd: Date | string | null | undefined, now = new Date()): Date {
  const end = toDate(currentEnd);
  const start = end && end.getTime() > now.getTime() ? end : now;
  return new Date(start.getTime() + PRO_PERIOD_DAYS * DAY_MS);
}

export function daysUntil(date: Date | string | null | undefined, now = new Date()): number | null {
  const target = toDate(date);
  if (!target) return null;
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

export function canExtend(currentEnd: Date | string | null | undefined, now = new Date()): boolean {
  const remaining = daysUntil(currentEnd, now);
  return remaining === null || remaining <= MAX_PREPAID_DAYS;
}
