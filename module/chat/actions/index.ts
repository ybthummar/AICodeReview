"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { consumeUsage, QuotaExceededError, refundUsage } from "@/module/billing/lib/usage";
import {
  answerCodebaseQuestion,
  type ChatAnswer,
  type ChatMessage,
} from "@/module/chat/lib/answer";
import { findAccessibleRepository, requireRepositoryToken } from "@/module/team/lib/access";
import { performDirectRepoIndex } from "@/inngest/functions";

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

    const question = input.question.trim();
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

    const token = await requireRepositoryToken(repository.userId, repository.owner);
    const result = await answerCodebaseQuestion({
      repository,
      token,
      question,
      history: input.history,
    });

    if ("empty" in result) {
      await refundUsage(billedUserId, "chats");
      return ok({
        answer:
          "I could not find any indexed code for this repository yet. Use **Re-index** to build the code index, then ask again in a few minutes.",
        sources: [],
        indexed: false,
      });
    }

    return ok(result);
  } catch (error) {
    if (error instanceof QuotaExceededError) return fail(error);

    if (billedUserId) await refundUsage(billedUserId, "chats");
    console.error("askCodebase failed:", error);
    return fail(error, "The assistant could not answer right now. Please try again.");
  }
}

export async function reindexRepository(repositoryId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const access = await findAccessibleRepository(session.user, { id: repositoryId }, "OWNER");
    if (!access) return fail(new Error("Only the person who connected the repository can re-index it."));

    // Indexing can take minutes, so it runs in the background.
    performDirectRepoIndex({
      owner: access.repository.owner,
      repo: access.repository.name,
      userId: access.repository.userId,
    }).catch((error) => {
      console.error("Re-index failed:", error);
    });

    return ok(null);
  } catch (error) {
    return fail(error, "Could not start indexing.");
  }
}
