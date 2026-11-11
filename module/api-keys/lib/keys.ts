import crypto from "node:crypto";
import prisma from "@/lib/db";

export const API_KEY_PREFIX = "rp_live_";
export const MAX_ACTIVE_API_KEYS = 5;

const KEY_PATTERN = /^rp_live_[A-Za-z0-9_-]{20,64}$/;
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Only the hash is stored, so the full key can be shown exactly once.
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;

  return {
    key,
    prefix: key.slice(0, API_KEY_PREFIX.length + 4),
    hash: hashApiKey(key),
  };
}

export async function authenticateApiKey(
  request: Request
): Promise<{ userId: string; keyId: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];

  if (!token || !KEY_PATTERN.test(token)) return null;

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(token) },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true },
  });

  if (!record || record.revokedAt) return null;

  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch((error) => console.warn("Could not update the API key usage time:", error));
  }

  return { userId: record.userId, keyId: record.id };
}

const buckets = new Map<string, { count: number; resetAt: number }>();

// Best-effort per-instance limiter that keeps one key from flooding the AI provider.
export function checkRateLimit(keyId: string, limit = 10, windowMs = 60_000): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }

  const bucket = buckets.get(keyId);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(keyId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}
