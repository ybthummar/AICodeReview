"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  NOTIFICATION_TRIGGERS,
  validateWebhookUrl,
  type NotificationKind,
  type NotificationTrigger,
  type ReviewAlert,
} from "@/module/notifications/lib/format";
import { postToWebhook } from "@/module/notifications/lib/notify";
import { recordAudit } from "@/module/audit/lib/audit";

const MAX_CHANNELS = 5;

export interface NotificationChannelView {
  id: string;
  kind: NotificationKind;
  name: string;
  trigger: NotificationTrigger;
  enabled: boolean;
  // Webhook URLs are secrets, so only a masked hint is ever sent to the browser.
  urlHint: string;
  createdAt: string;
}

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}/…${url.slice(-6)}`;
  } catch {
    return "…";
  }
}

export async function getNotificationChannels(): Promise<NotificationChannelView[]> {
  const session = await requireSession();

  const channels = await prisma.notificationChannel.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return channels.map((c) => ({
    id: c.id,
    kind: c.kind as NotificationKind,
    name: c.name,
    trigger: c.trigger as NotificationTrigger,
    enabled: c.enabled,
    urlHint: maskUrl(c.url),
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function addNotificationChannel(input: {
  name: string;
  url: string;
  trigger: NotificationTrigger;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const name = input.name.trim().slice(0, 60);
    if (!name) return fail(new Error("Give the channel a name"));

    const validated = validateWebhookUrl(input.url);
    if (!validated.ok) return fail(new Error(validated.error));

    const trigger = NOTIFICATION_TRIGGERS.includes(input.trigger) ? input.trigger : "risky";

    const count = await prisma.notificationChannel.count({ where: { userId: session.user.id } });
    if (count >= MAX_CHANNELS) {
      return fail(new Error(`You can add up to ${MAX_CHANNELS} channels.`));
    }

    await prisma.notificationChannel.create({
      data: {
        userId: session.user.id,
        kind: validated.kind,
        name,
        url: validated.url,
        trigger,
      },
    });

    await recordAudit({
      userId: session.user.id,
      action: "channel.added",
      targetType: "notification_channel",
      summary: `Added the ${validated.kind} channel "${name}"`,
    });

    return ok(null);
  } catch (error) {
    console.error("Failed to add notification channel:", error);
    return fail(error, "Could not add the channel.");
  }
}

export async function updateNotificationChannel(
  id: string,
  changes: { enabled?: boolean; trigger?: NotificationTrigger }
): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const updated = await prisma.notificationChannel.updateMany({
      where: { id, userId: session.user.id },
      data: {
        ...(typeof changes.enabled === "boolean" ? { enabled: changes.enabled } : {}),
        ...(changes.trigger && NOTIFICATION_TRIGGERS.includes(changes.trigger)
          ? { trigger: changes.trigger }
          : {}),
      },
    });

    if (updated.count === 0) return fail(new Error("Channel not found"));
    return ok(null);
  } catch (error) {
    return fail(error, "Could not update the channel.");
  }
}

export async function deleteNotificationChannel(id: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    await prisma.notificationChannel.deleteMany({ where: { id, userId: session.user.id } });

    await recordAudit({
      userId: session.user.id,
      action: "channel.removed",
      targetType: "notification_channel",
      targetId: id,
      summary: "Removed a notification channel",
    });
    return ok(null);
  } catch (error) {
    return fail(error, "Could not delete the channel.");
  }
}

export async function sendTestNotification(id: string): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const channel = await prisma.notificationChannel.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!channel) return fail(new Error("Channel not found"));

    const appUrl =
      process.env.NEXT_PUBLIC_APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const alert: ReviewAlert = {
      repoFullName: "repopilot/demo-repo",
      prNumber: 42,
      prTitle: "Test alert from RepoPilot",
      prUrl: appUrl,
      dashboardUrl: `${appUrl}/dashboard/reviews`,
      verdict: "request_changes",
      riskLevel: "high",
      riskScore: 53,
      qualityScore: 71,
      securityScore: 64,
      topFindings: [
        { severity: "high", title: "Unvalidated input reaches a database query" },
        { severity: "medium", title: "Missing error handling around network call" },
      ],
    };

    await postToWebhook(channel.url, alert);
    return ok(null);
  } catch (error) {
    return fail(error, "The test message could not be delivered.");
  }
}
