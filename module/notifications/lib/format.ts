import type { ReviewVerdict, RiskLevel } from "@/module/review/lib/insights";

export const NOTIFICATION_KINDS = ["slack", "discord", "teams"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_TRIGGERS = ["all", "risky", "blocking"] as const;
export type NotificationTrigger = (typeof NOTIFICATION_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<NotificationTrigger, string> = {
  all: "Every completed review",
  risky: "Moderate risk or worse",
  blocking: "Only when changes are requested",
};

export interface ReviewAlert {
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  dashboardUrl: string;
  verdict: ReviewVerdict;
  riskLevel: RiskLevel;
  riskScore: number;
  qualityScore: number;
  securityScore: number;
  topFindings: { severity: string; title: string }[];
}

export function validateWebhookUrl(
  value: string
): { ok: true; kind: NotificationKind; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, error: "Enter a valid webhook URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use https" };
  }

  const host = url.hostname.toLowerCase();

  if (host === "hooks.slack.com" && url.pathname.startsWith("/services/")) {
    return { ok: true, kind: "slack", url: url.toString() };
  }

  if (
    (host === "discord.com" ||
      host === "discordapp.com" ||
      host === "canary.discord.com" ||
      host === "ptb.discord.com") &&
    url.pathname.startsWith("/api/webhooks/")
  ) {
    return { ok: true, kind: "discord", url: url.toString() };
  }

  if (
    host.endsWith(".webhook.office.com") ||
    host.endsWith(".logic.azure.com") ||
    host.endsWith(".powerplatform.com") ||
    host === "outlook.office.com"
  ) {
    return { ok: true, kind: "teams", url: url.toString() };
  }

  return {
    ok: false,
    error: "Only Slack, Discord and Microsoft Teams webhook URLs are supported",
  };
}

export function shouldNotify(trigger: NotificationTrigger, alert: ReviewAlert): boolean {
  if (trigger === "all") return true;
  if (trigger === "blocking") return alert.verdict === "request_changes";
  return alert.verdict === "request_changes" || alert.riskLevel !== "low";
}

const VERDICT_TEXT: Record<ReviewVerdict, string> = {
  approve: "Approve",
  request_changes: "Changes requested",
  informational: "Informational",
};

const RISK_COLORS: Record<RiskLevel, { hex: string; int: number }> = {
  low: { hex: "2EB67D", int: 0x2eb67d },
  moderate: { hex: "ECB22E", int: 0xecb22e },
  high: { hex: "F97316", int: 0xf97316 },
  critical: { hex: "E01E5A", int: 0xe01e5a },
};

function headline(alert: ReviewAlert): string {
  return `${alert.repoFullName} #${alert.prNumber}: ${VERDICT_TEXT[alert.verdict]}`;
}

function findingLines(alert: ReviewAlert): string[] {
  return alert.topFindings.map((f) => `${f.severity.toUpperCase()}: ${f.title}`);
}

export function buildAlertPayload(kind: NotificationKind, alert: ReviewAlert): unknown {
  const scores = `Risk ${alert.riskScore}/100 · Quality ${alert.qualityScore}/100 · Security ${alert.securityScore}/100`;
  const findings = findingLines(alert);

  if (kind === "slack") {
    return {
      text: `${headline(alert)}: ${alert.prTitle}`,
      attachments: [
        {
          color: `#${RISK_COLORS[alert.riskLevel].hex}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*<${alert.prUrl}|${alert.repoFullName} #${alert.prNumber}: ${alert.prTitle}>*\n${VERDICT_TEXT[alert.verdict]} · ${scores}`,
              },
            },
            ...(findings.length > 0
              ? [
                  {
                    type: "section",
                    text: { type: "mrkdwn", text: findings.map((f) => `• ${f}`).join("\n") },
                  },
                ]
              : []),
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Open review" },
                  url: alert.dashboardUrl,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  if (kind === "discord") {
    return {
      username: "RepoPilot",
      embeds: [
        {
          title: `${alert.repoFullName} #${alert.prNumber}: ${alert.prTitle}`.slice(0, 250),
          url: alert.prUrl,
          color: RISK_COLORS[alert.riskLevel].int,
          description: [`**${VERDICT_TEXT[alert.verdict]}**`, scores, ...findings.map((f) => `• ${f}`)]
            .join("\n")
            .slice(0, 1800),
          footer: { text: "RepoPilot AI review" },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: headline(alert), weight: "Bolder", size: "Medium", wrap: true },
            { type: "TextBlock", text: alert.prTitle, wrap: true },
            { type: "TextBlock", text: scores, isSubtle: true, wrap: true },
            ...findings.map((f) => ({ type: "TextBlock", text: `• ${f}`, wrap: true })),
          ],
          actions: [
            { type: "Action.OpenUrl", title: "Open pull request", url: alert.prUrl },
            { type: "Action.OpenUrl", title: "Open review", url: alert.dashboardUrl },
          ],
        },
      },
    ],
  };
}
