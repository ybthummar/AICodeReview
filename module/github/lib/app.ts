import crypto from "node:crypto";
import { App, RequestError } from "octokit";
import prisma from "@/lib/db";

const STATE_TTL_MS = 15 * 60 * 1000;

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_SLUG
  );
}

let appInstance: App | null = null;

function getApp(): App {
  if (!isGitHubAppConfigured()) {
    throw new Error("The GitHub App is not configured");
  }

  if (!appInstance) {
    appInstance = new App({
      appId: process.env.GITHUB_APP_ID as string,
      // Private keys are usually stored in env files with escaped newlines.
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY as string).replace(/\\n/g, "\n"),
    });
  }

  return appInstance;
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const app = getApp();
  const authentication = (await app.octokit.auth({
    type: "installation",
    installationId,
  })) as { token: string };

  return authentication.token;
}

async function findLinkedRepositoryInstallation(owner: string, repo: string, permission?: "pull_requests"): Promise<number | null> {
  if (!isGitHubAppConfigured()) return null;

  const linked = await prisma.gitHubInstallation.findFirst({
    where: { accountLogin: { equals: owner, mode: "insensitive" } },
    select: { installationId: true },
  });
  if (!linked) return null;

  try {
    const { data } = await getApp().octokit.rest.apps.getRepoInstallation({
      owner, repo, request: { signal: AbortSignal.timeout(10_000) },
    });
    if (data.id !== linked.installationId || data.suspended_at) return null;
    if (permission && !data.permissions[permission]) return null;
    return data.id;
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) return null;
    throw error;
  }
}

export async function getInstallationTokenForRepository(owner: string, repo: string, permission?: "pull_requests"): Promise<string | null> {
  try {
    const installationId = await findLinkedRepositoryInstallation(owner, repo, permission);
    return installationId === null ? null : await getInstallationToken(installationId);
  } catch (error) {
    console.warn("GitHub App token unavailable", { owner, repo, status: error instanceof RequestError ? error.status : undefined });
    return null;
  }
}

export async function hasInstallationForRepository(owner: string, repo: string): Promise<boolean> {
  return await findLinkedRepositoryInstallation(owner, repo) !== null;
}

export async function fetchInstallationAccount(
  installationId: number
): Promise<{ login: string; type: string }> {
  const app = getApp();
  const response = await app.octokit.request("GET /app/installations/{installation_id}", {
    installation_id: installationId,
  });

  const account = response.data.account as { login?: string; type?: string; slug?: string } | null;
  const login = account?.login ?? account?.slug;
  if (!login) throw new Error("GitHub did not return the installation account");

  return { login, type: account?.type ?? "User" };
}

function stateSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to link GitHub App installations");
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex");
}

export function createInstallState(userId: string): string {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyInstallState(state: string | null): string | null {
  if (!state) return null;

  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresAt, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${expiresAt}`));
  const received = Buffer.from(signature);

  const matches = expected.length === received.length && crypto.timingSafeEqual(expected, received);

  if (!matches || Number(expiresAt) < Date.now()) return null;
  return userId;
}

export function getInstallUrl(userId: string): string | null {
  if (!isGitHubAppConfigured()) return null;

  const state = encodeURIComponent(createInstallState(userId));
  return `https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new?state=${state}`;
}
