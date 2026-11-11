import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { reviewPullRequest } from "@/module/ai/actions/index";
import { handleCommentEvent, handleInstallationEvent } from "@/module/github/lib/commands";

function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

const REVIEW_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const event = req.headers.get("x-github-event");

    // Verify the webhook signature whenever a secret is configured.
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      if (!verifyGitHubSignature(body, signature, webhookSecret)) {
        console.error("Invalid GitHub webhook signature");
        return NextResponse.json(
          { message: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    const parsed = JSON.parse(body || "{}");

    if (event === "ping") {
      return NextResponse.json({ message: "Pong" }, { status: 200 });
    }

    // Commands can modify pull requests, so they are only trusted when deliveries are signed.
    if (event === "issue_comment" || event === "pull_request_review_comment") {
      if (!webhookSecret) {
        console.warn("Ignoring slash command: GITHUB_WEBHOOK_SECRET is not configured");
        return NextResponse.json({ message: "Commands require a webhook secret" }, { status: 202 });
      }

      after(async () => {
        try {
          await handleCommentEvent(event, parsed);
        } catch (error) {
          console.error("Comment event failed:", error);
        }
      });

      return NextResponse.json({ message: "Event Processed" }, { status: 200 });
    }

    if (event === "installation") {
      if (webhookSecret) {
        after(async () => {
          try {
            await handleInstallationEvent(parsed);
          } catch (error) {
            console.error("Installation event failed:", error);
          }
        });
      }

      return NextResponse.json({ message: "Event Processed" }, { status: 200 });
    }

    if (event === "pull_request") {
      const action = parsed.action;
      const repo = parsed.repository?.full_name;
      const prNumber = parsed.number || parsed.pull_request?.number;

      if (!repo || !prNumber) {
        return NextResponse.json(
          { message: "Missing repository full_name or PR number" },
          { status: 400 }
        );
      }

      const [owner, repoName] = repo.split("/");

      if (REVIEW_ACTIONS.has(action)) {
        console.log(`Received GitHub webhook for ${action} PR ${repo}#${prNumber}`);

        // Respond immediately; the review continues after the response is sent.
        after(async () => {
          try {
            const result = await reviewPullRequest(owner, repoName, prNumber, { source: "webhook" });
            console.log(`Review process for ${repo}#${prNumber}: ${result.message}`);
          } catch (err) {
            console.error(`Review process error for ${repo}#${prNumber}:`, err);
          }
        });
      }
    }

    return NextResponse.json({ message: "Event Processed" }, { status: 200 });
  } catch (error) {
    console.error("Error handling GitHub webhook:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
