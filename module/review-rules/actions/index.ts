"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { findAccessibleRepository } from "@/module/team/lib/access";
import { recordAudit } from "@/module/audit/lib/audit";
import { loadReviewConfig } from "@/module/review-rules/lib/load";
import { normalizeReviewConfig, type ReviewConfig } from "@/module/review-rules/lib/config";

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function getRepositoryReviewConfig(
  repositoryId: string
): Promise<ActionResult<ReviewConfig>> {
  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { id: repositoryId });
    if (!access) return fail(new Error("Repository not found"));

    return ok(await loadReviewConfig(repositoryId));
  } catch (error) {
    return fail(error, "Could not load review rules.");
  }
}

export async function saveRepositoryReviewConfig(
  repositoryId: string,
  config: ReviewConfig
): Promise<ActionResult<ReviewConfig>> {
  try {
    const session = await requireSession();

    // Only the owner (or a workspace admin) may change how reviews behave.
    const access = await findAccessibleRepository(session.user, { id: repositoryId }, "ADMIN");
    if (!access) return fail(new Error("Only repository admins can change review rules."));

    const normalized = normalizeReviewConfig(config);
    const json = JSON.parse(JSON.stringify(normalized));

    await prisma.repositorySettings.upsert({
      where: { repositoryId },
      update: { config: json },
      create: { repositoryId, config: json },
    });

    await recordAudit({
      userId: session.user.id,
      action: "rules.updated",
      targetType: "repository",
      targetId: repositoryId,
      summary: `Updated review rules for ${access.repository.fullName}`,
      metadata: {
        strictness: normalized.strictness,
        rulePacks: normalized.rulePacks.join(","),
        customRules: normalized.customRules.length,
      },
    });

    return ok(normalized);
  } catch (error) {
    console.error("Failed to save review rules:", error);
    return fail(error, "Could not save review rules.");
  }
}
