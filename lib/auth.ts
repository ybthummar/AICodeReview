import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db";

const configuredAppUrl =
  process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

if (process.env.NODE_ENV === "production" && !configuredAppUrl) {
  throw new Error(
    "Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL to the canonical production URL."
  );
}

if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error("Set BETTER_AUTH_SECRET before deploying the application.");
}

export const authOrigin = new URL(configuredAppUrl || "http://localhost:3000").origin;

const vercelOrigin = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;

export const auth = betterAuth({
  baseURL: authOrigin,
  secret: authSecret,
  onAPIError: {
    errorURL: `${authOrigin}/login`,
    throw: true,
  },
  logger: {
    log(level, message, ...details) {
      // These library messages include OAuth state. The callback route logs the safe error code.
      if (message === "Failed to parse state" || message === "State not found") return;
      console[level]("[Better Auth]", message, ...details);
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    github: {
      enabled: Boolean(githubClientId && githubClientSecret),
      clientId: githubClientId || "",
      clientSecret: githubClientSecret || "",
      scope: ["repo"],
    },
  },
  trustedOrigins: [
    authOrigin,
    ...(vercelOrigin ? [vercelOrigin] : []),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000",
    "https://repopilot.team",
    "https://www.repopilot.team",
  ],
});
