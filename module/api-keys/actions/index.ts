"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/module/audit/lib/audit";
import { generateApiKey, MAX_ACTIVE_API_KEYS } from "@/module/api-keys/lib/keys";

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function listApiKeys(): Promise<ApiKeyView[]> {
  const session = await requireSession();

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
  }));
}

// The secret is returned once. Only its hash is stored.
export async function createApiKey(name: string): Promise<ActionResult<{ key: string; id: string }>> {
  try {
    const session = await requireSession();

    const cleanName = name.trim().slice(0, 60);
    if (!cleanName) return fail(new Error("Give the key a name, for example the machine it is for."));

    const active = await prisma.apiKey.count({ where: { userId: session.user.id, revokedAt: null } });
    if (active >= MAX_ACTIVE_API_KEYS) {
      return fail(new Error(`You can have up to ${MAX_ACTIVE_API_KEYS} active keys. Revoke one first.`));
    }

    const { key, prefix, hash } = generateApiKey();
    const record = await prisma.apiKey.create({
      data: { userId: session.user.id, name: cleanName, prefix, keyHash: hash },
      select: { id: true },
    });

    await recordAudit({
      userId: session.user.id,
      action: "apikey.created",
      targetType: "api_key",
      targetId: record.id,
      summary: `Created the API key "${cleanName}"`,
    });

    return ok({ key, id: record.id });
  } catch (error) {
    console.error("Failed to create an API key:", error);
    return fail(error, "Could not create the API key.");
  }
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const revoked = await prisma.apiKey.updateMany({
      where: { id, userId: session.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) return fail(new Error("Key not found"));

    await recordAudit({
      userId: session.user.id,
      action: "apikey.revoked",
      targetType: "api_key",
      targetId: id,
      summary: "Revoked an API key",
    });

    return ok(null);
  } catch (error) {
    return fail(error, "Could not revoke the API key.");
  }
}
