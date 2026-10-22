import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { reviewPullRequest } from "@/module/ai/actions/index";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const event = req.headers.get("x-github-event");

    // Verify webhook signature ONLY if secret is configured in .env
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

      if (
        action === "opened" ||
        action === "synchronize" ||
        action === "reopened" ||
        action === "ready_for_review"
      ) {
        console.log(`Received GitHub webhook for ${action} PR ${repo}#${prNumber}`);

        // Fire and forget: trigger review without keeping the webhook request hanging
        reviewPullRequest(owner, repoName, prNumber)
          .then(() => {
            console.log(`Review process initiated for ${repo}/#${prNumber}`);
          })
          .catch((err: Error) => {
            console.error(`Review process error for ${repo}/#${prNumber}:`, err);
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
