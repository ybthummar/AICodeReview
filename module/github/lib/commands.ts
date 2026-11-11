import prisma from "@/lib/db";
import { consumeUsage, QuotaExceededError, refundUsage } from "@/module/billing/lib/usage";
import { reviewPullRequest } from "@/module/ai/actions";
import { answerCodebaseQuestion } from "@/module/chat/lib/answer";
import {
  getPullRequestDiff,
  getReviewCommentBody,
  postPlainComment,
  reactToComment,
  replyToReviewComment,
  updatePullRequest,
} from "@/module/github/lib/github";
import { isBotComment, parseFindingMarker, parseSlashCommand } from "@/module/github/lib/markers";
import {
  applyFindingStatus,
  parseReviewContent,
  serializeReviewContent,
} from "@/module/review/lib/insights";
import { prepareDiff, publishQualityGate } from "@/module/review/lib/pipeline";
import { loadReviewConfig } from "@/module/review-rules/lib/load";
import { resolveReviewToken } from "@/module/team/lib/access";
import { composePullRequestDescription, truncateDiff } from "@/module/toolkit/lib/describe";

const ALLOWED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MAX_QUESTION_LENGTH = 1000;

interface CommentEventPayload {
  action?: string;
  comment?: {
    id: number;
    body?: string;
    author_association?: string;
    in_reply_to_id?: number;
  };
  issue?: { number: number; pull_request?: unknown };
  pull_request?: { number: number };
  repository?: { name: string; owner: { login: string } };
  sender?: { id: number; type?: string };
}

const HELP = [
  "**RepoPilot commands**",
  "",
  "- `/repopilot review` runs a fresh AI review of this pull request",
  "- `/repopilot describe` suggests a title and description (`describe apply` updates the pull request)",
  "- `/repopilot ask <question>` answers a question about the codebase",
  "- Reply `/repopilot ignore` to one of my inline findings to dismiss it",
].join("\n");

// Reviews of the commenter's own account are looked up by GitHub id so feedback is attributed to a RepoPilot user.
async function findUserByGitHubId(githubUserId: number | undefined): Promise<string | null> {
  if (!githubUserId) return null;

  const account = await prisma.account.findFirst({
    where: { providerId: "github", accountId: String(githubUserId) },
    select: { userId: true },
  });

  return account?.userId ?? null;
}

async function dismissFinding(input: {
  repository: { id: string; userId: string; owner: string; name: string };
  prNumber: number;
  findingId: string;
  token: string;
  senderGitHubId?: number;
}): Promise<boolean> {
  const review = await prisma.review.findFirst({
    where: { repositoryId: input.repository.id, prNumber: input.prNumber },
    orderBy: { createdAt: "desc" },
  });
  if (!review) return false;

  const parsed = parseReviewContent(review.review);
  const finding = parsed.insights?.findings.find((f) => f.id === input.findingId);
  if (!parsed.insights || !finding) return false;

  const updated = applyFindingStatus(parsed.insights, input.findingId, "dismissed");
  if (!updated) return false;

  await prisma.review.update({
    where: { id: review.id },
    data: { review: serializeReviewContent(parsed.markdown, updated) },
  });

  const userId = await findUserByGitHubId(input.senderGitHubId);
  if (userId) {
    const where = {
      reviewId_findingId_userId: { reviewId: review.id, findingId: input.findingId, userId },
    };
    await prisma.findingFeedback.upsert({
      where,
      update: { vote: "down" },
      create: {
        repositoryId: input.repository.id,
        reviewId: review.id,
        findingId: input.findingId,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        vote: "down",
        userId,
      },
    });
  }

  if (updated.headSha) {
    await publishQualityGate(
      input.repository.userId,
      input.token,
      input.repository.owner,
      input.repository.name,
      updated.headSha,
      updated
    );
  }

  return true;
}

export async function handleCommentEvent(
  event: "issue_comment" | "pull_request_review_comment",
  payload: CommentEventPayload
): Promise<void> {
  const comment = payload.comment;
  if (payload.action !== "created" || !comment?.body) return;
  if (isBotComment(comment.body) || payload.sender?.type === "Bot") return;

  const command = parseSlashCommand(comment.body);
  if (!command) return;

  const prNumber =
    event === "issue_comment"
      ? payload.issue?.pull_request
        ? payload.issue.number
        : null
      : (payload.pull_request?.number ?? null);
  if (!prNumber || !payload.repository) return;

  const repository = await prisma.repository.findFirst({
    where: {
      owner: { equals: payload.repository.owner.login, mode: "insensitive" },
      name: { equals: payload.repository.name, mode: "insensitive" },
    },
    select: { id: true, userId: true, owner: true, name: true, fullName: true },
  });
  if (!repository) return;

  const token = await resolveReviewToken(repository.userId, repository.owner);
  if (!token) return;

  const { owner, name } = repository;
  const reactionKind = event === "issue_comment" ? "issue" : "review";

  const reply = (body: string) =>
    event === "pull_request_review_comment"
      ? replyToReviewComment(token, owner, name, prNumber, comment.id, body)
      : postPlainComment(token, owner, name, prNumber, body);

  if (!ALLOWED_ASSOCIATIONS.has(comment.author_association ?? "")) {
    await reply("Only repository owners, members and collaborators can use RepoPilot commands.");
    return;
  }

  await reactToComment(token, owner, name, comment.id, reactionKind, "eyes");

  try {
    switch (command.name) {
      case "review": {
        const result = await reviewPullRequest(owner, name, prNumber, { source: "command" });
        await reactToComment(token, owner, name, comment.id, reactionKind, result.success ? "rocket" : "-1");
        if (!result.success || result.message.startsWith("Skipped")) await reply(result.message);
        return;
      }

      case "describe": {
        await consumeUsage(repository.userId, "toolkit");

        const [pr, config] = await Promise.all([
          getPullRequestDiff(token, owner, name, prNumber),
          loadReviewConfig(repository.id),
        ]);
        const diffText = truncateDiff(prepareDiff(pr.diff, config).diff);
        const suggestion = await composePullRequestDescription({
          repoFullName: repository.fullName,
          pr,
          diffText,
        });

        if (command.args.toLowerCase().startsWith("apply")) {
          await updatePullRequest(token, owner, name, prNumber, suggestion);
          await reply("Updated the pull request title and description.");
        } else {
          await reply(
            `### Suggested title\n${suggestion.title}\n\n### Suggested description\n${suggestion.body}\n\nUse \`/repopilot describe apply\` to apply this.`
          );
        }
        return;
      }

      case "ask": {
        const question = command.args.slice(0, MAX_QUESTION_LENGTH);
        if (!question) {
          await reply("Add a question after the command, for example `/repopilot ask where is authentication handled?`");
          return;
        }

        await consumeUsage(repository.userId, "chats");

        const result = await answerCodebaseQuestion({ repository, token, question });
        if ("empty" in result) {
          await refundUsage(repository.userId, "chats");
          await reply("This repository has not been indexed yet. Re-index it from the RepoPilot dashboard and try again.");
          return;
        }

        const sources = result.sources
          .slice(0, 6)
          .map((s) => `- [\`${s.path}${s.startLine ? `:${s.startLine}-${s.endLine}` : ""}\`](${s.url})`)
          .join("\n");

        await reply(`${result.answer}${sources ? `\n\n**Sources**\n${sources}` : ""}`);
        return;
      }

      case "ignore": {
        const parentId = comment.in_reply_to_id;
        if (event !== "pull_request_review_comment" || !parentId) {
          await reply("Reply to one of my inline findings with `/repopilot ignore` to dismiss it.");
          return;
        }

        const findingId = parseFindingMarker(await getReviewCommentBody(token, owner, name, parentId));
        if (!findingId) {
          await reply("That comment is not one of my findings.");
          return;
        }

        const dismissed = await dismissFinding({
          repository,
          prNumber,
          findingId,
          token,
          senderGitHubId: payload.sender?.id,
        });

        await reply(
          dismissed
            ? "Dismissed. This finding no longer counts towards the risk score."
            : "I could not find that finding in the latest review."
        );
        return;
      }

      default:
        await reply(HELP);
    }
  } catch (error) {
    console.error(`Slash command "${command.name}" failed for ${repository.fullName}#${prNumber}:`, error);

    try {
      await reply(
        error instanceof QuotaExceededError
          ? error.message
          : `Sorry, the \`${command.name}\` command failed. Please try again in a moment.`
      );
    } catch {
      // Nothing more can be done if GitHub also rejects the error reply.
    }
  }
}

export async function handleInstallationEvent(payload: {
  action?: string;
  installation?: { id: number };
}): Promise<void> {
  if (payload.action === "deleted" && payload.installation?.id) {
    await prisma.gitHubInstallation.deleteMany({ where: { installationId: payload.installation.id } });
  }
}
