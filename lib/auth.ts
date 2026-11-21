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

if (
  process.env.NODE_ENV === "production" &&
  (!githubClientId || !githubClientSecret)
) {
  throw new Error(
    "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET before deploying the application."
  );
}

const appUrl = configuredAppUrl || "http://localhost:3000";

const vercelOrigin = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;

export const auth = betterAuth({
  baseURL: appUrl,
  secret: authSecret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    github: {
      clientId: githubClientId || "",
      clientSecret: githubClientSecret || "",
      scope: ["repo"],
    },
  },
  trustedOrigins: [
    appUrl,
    ...(vercelOrigin ? [vercelOrigin] : []),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000",
    "https://repopilot.team",
    "https://www.repopilot.team",
  ],
});
