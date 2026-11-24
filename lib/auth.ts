import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getNeonAuth } from "./neon-auth";
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

export const legacyAuth = betterAuth({
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
      disableImplicitSignUp: true,
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

async function getSession(options: Parameters<typeof legacyAuth.api.getSession>[0]) {
  // Resolve the local GitHub session before contacting the managed email provider.
  const legacySession = await legacyAuth.api.getSession(options);
  if (legacySession) return { ...legacySession, authProvider: "legacy" as const };

  if (process.env.NEON_AUTH_BASE_URL?.trim()) {
    const { data: session, error } = await getNeonAuth().getSession();
    if (error) throw error;

    if (session?.user) {
      let appUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, subscriptionTier: true },
      });

      if (!appUser && session.user.emailVerified) {
        appUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, subscriptionTier: true },
        });
      }

      if (!appUser) {
        await prisma.user.createMany({
          data: [{
            id: session.user.id,
            name: session.user.name || session.user.email,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
            image: session.user.image,
          }],
          skipDuplicates: true,
        });
        appUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, subscriptionTier: true },
        });
        if (!appUser && session.user.emailVerified) {
          appUser = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, subscriptionTier: true },
          });
        }
      }

      if (!appUser) {
        throw new Error("Could not synchronize the Managed Auth user with the application database.");
      }

      return {
        ...session,
        authProvider: "neon" as const,
        user: {
          ...session.user,
          id: appUser.id,
          subscriptionTier: appUser.subscriptionTier,
        },
      };
    }
  }

  return null;
}

export const auth = { api: { getSession } };
