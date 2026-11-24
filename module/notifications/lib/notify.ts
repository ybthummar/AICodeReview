import prisma from "@/lib/db";
import {
  buildAlertPayload,
  shouldNotify,
  validateWebhookUrl,
  type NotificationKind,
  type NotificationTrigger,
  type ReviewAlert,
} from "@/module/notifications/lib/format";

const SEND_TIMEOUT_MS = 8000;

function rejectedWebhook(kind: NotificationKind, status: number): string {
  if (status === 429) return "The webhook is rate limited. Wait before sending another test.";
  if (kind === "teams" && (status === 401 || status === 403)) {
    return 'Microsoft Teams rejected access. Use a Workflows webhook with "Anyone" access and copy the full URL.';
  }
  if (status === 401 || status === 403 || status === 404 || status === 410) {
    return `The webhook is unavailable (HTTP ${status}). Check that the URL is current and the channel is active.`;
  }
  return `The webhook rejected the message (HTTP ${status}).`;
}

export async function postToWebhook(url: string, alert: ReviewAlert): Promise<void> {
  const validated = validateWebhookUrl(url);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const response = await fetch(validated.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAlertPayload(validated.kind, alert)),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    redirect: "error",
  }).catch(() => {
    throw new Error("The webhook could not be reached. Check the URL and try again.");
  });

  if (!response.ok) {
    throw new Error(rejectedWebhook(validated.kind, response.status));
  }
  if (validated.kind === "slack" && (await response.text().catch(() => "")).trim() !== "ok") {
    throw new Error("Slack did not confirm the message. Check that this is an active incoming webhook.");
  }
}

// Alerts must never break the review pipeline, so every failure is swallowed and logged.
export async function sendReviewAlert(userId: string, alert: ReviewAlert): Promise<number> {
  try {
    const channels = await prisma.notificationChannel.findMany({
      where: { userId, enabled: true },
      select: { id: true, url: true, trigger: true },
    });

    const targets = channels.filter((c) =>
      shouldNotify(c.trigger as NotificationTrigger, alert)
    );

    const results = await Promise.allSettled(targets.map((c) => postToWebhook(c.url, alert)));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn(`Notification channel ${targets[index].id} failed:`, result.reason);
      }
    });

    return results.filter((r) => r.status === "fulfilled").length;
  } catch (error) {
    console.warn("Review alerts skipped:", error);
    return 0;
  }
}
