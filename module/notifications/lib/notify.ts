import prisma from "@/lib/db";
import {
  buildAlertPayload,
  shouldNotify,
  validateWebhookUrl,
  type NotificationTrigger,
  type ReviewAlert,
} from "@/module/notifications/lib/format";

const SEND_TIMEOUT_MS = 8000;

export async function postToWebhook(url: string, alert: ReviewAlert): Promise<void> {
  const validated = validateWebhookUrl(url);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const res = await fetch(validated.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAlertPayload(validated.kind, alert)),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    redirect: "error",
  });

  if (!res.ok) {
    throw new Error(`Webhook responded with HTTP ${res.status}`);
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
