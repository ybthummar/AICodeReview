import { createNeonAuth } from "@neon/auth/next/server";

export class NeonAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeonAuthConfigurationError";
  }
}

let authInstance: ReturnType<typeof createNeonAuth> | undefined;

export function isNeonAuthConfigured() {
  return Boolean(
    process.env.NEON_AUTH_BASE_URL?.trim() &&
    (process.env.NEON_AUTH_COOKIE_SECRET?.length ?? 0) >= 32
  );
}

export function getNeonAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim();
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl) {
    throw new NeonAuthConfigurationError("Set NEON_AUTH_BASE_URL to enable email sign-in.");
  }

  if (!cookieSecret || cookieSecret.length < 32) {
    throw new NeonAuthConfigurationError("Set NEON_AUTH_COOKIE_SECRET to a secret with at least 32 characters.");
  }

  authInstance ??= createNeonAuth({
    baseUrl,
    cookies: { secret: cookieSecret },
  });

  return authInstance;
}
