"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { consumeUsage, QuotaExceededError, refundUsage } from "@/module/billing/lib/usage";
import {
  answerCodebaseQuestion,
  CodebaseAnswerError,
  type ChatAnswer,
  type ChatMessage,
} from "@/module/chat/lib/answer";
import { findAccessibleRepository, hasRole, requireRepositoryToken } from "@/module/team/lib/access";
import { getGitHubFileContent } from "@/module/github/lib/github";
import { queueRepositoryIndex } from "@/module/repository/lib/index-jobs";

const MAX_QUESTION_LENGTH = 1000;

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function askCodebase(input: {
  repositoryId: string;
  question: string;
  history?: ChatMessage[];
}): Promise<ActionResult<ChatAnswer>> {
  let billedUserId: string | null = null;

  try {
    const session = await requireSession();

    if (!input || typeof input.repositoryId !== "string" || !input.repositoryId.trim()) {
      return fail(new Error("Select a repository first."));
    }
    const question = typeof input.question === "string" ? input.question.trim() : "";
    if (!question) return fail(new Error("Ask a question about the code."));
    if (question.length > MAX_QUESTION_LENGTH) {
      return fail(new Error(`Questions are limited to ${MAX_QUESTION_LENGTH} characters.`));
    }

    const access = await findAccessibleRepository(session.user, { id: input.repositoryId });
    if (!access) return fail(new Error("Repository not found or you do not have access."));
    const { repository } = access;

    // Every question is billed to the person asking.
    await consumeUsage(session.user.id, "chats");
    billedUserId = session.user.id;

    let legacyToken: Promise<string | null> | undefined;
    const result = await answerCodebaseQuestion({
      repository,
      question,
      history: input.history,
      loadLegacyFile: async (path) => {
        legacyToken ??= requireRepositoryToken(repository.userId, repository.owner, repository.name).catch(() => null);
        const token = await legacyToken;
        return token ? getGitHubFileContent(token, repository.owner, repository.name, path) : null;
      },
    });

    if ("empty" in result) {
      await refundUsage(billedUserId, "chats");
      return ok({
        answer: hasRole(access.role, "OWNER")
          ? "No searchable code was found for this repository. Use **Re-index**, then ask again when indexing is ready."
          : "No searchable code was found for this repository. Ask the repository owner to re-index it.",
        sources: [],
        indexed: false,
      });
    }

    return ok(result);
  } catch (error) {
    if (error instanceof QuotaExceededError) return fail(error);

    if (billedUserId) await refundUsage(billedUserId, "chats");
    console.error("[codebase-chat] Question failed", {
      type: error instanceof Error ? error.constructor.name : typeof error,
      cause: error instanceof Error && error.cause instanceof Error ? error.cause.name : undefined,
    });
    return fail(error instanceof CodebaseAnswerError ? error : null, "The assistant could not answer right now. Please try again.");
  }
}

export async function reindexRepository(repositoryId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { id: repositoryId }, "OWNER");
    if (!access) return fail(new Error("Only the person who connected the repository can re-index it."));

    const queued = await queueRepositoryIndex({
      id: access.repository.id,
      owner: access.repository.owner,
      name: access.repository.name,
      userId: access.repository.userId,
    });

    return queued ? ok(null) : fail(new Error("Could not queue indexing for this repository. Refresh and try again."));
  } catch (error) {
    console.error("[codebase-chat] Could not queue indexing", { type: error instanceof Error ? error.name : typeof error });
    return fail(null, "Could not queue indexing. Check that the indexing worker is available and try again.");
  }
}
