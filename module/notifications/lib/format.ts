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
  assessment: {
    verdict: ReviewVerdict;
    riskLevel: RiskLevel;
    riskScore: number;
    qualityScore: number;
    securityScore: number;
  } | null;
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

  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) {
    return { ok: false, error: "Webhook URLs must use https" };
  }

  const host = url.hostname.toLowerCase();

  if ((host === "hooks.slack.com" || host === "hooks.slack-gov.com") && /^\/services\/[^/]+\/[^/]+\/[^/]+\/?$/.test(url.pathname)) {
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

  if (host.endsWith(".webhook.office.com") || host === "outlook.office.com") {
    return { ok: false, error: "This Teams connector has been retired. Replace it with a Microsoft Teams Workflows webhook." };
  }

  const teamsWorkflowPath = /^\/(?:powerautomate\/automations\/direct\/)?workflows\/[^/]+\/triggers\/[^/]+\/paths\/invoke\/?$/;
  if ((host.endsWith(".logic.azure.com") || host.endsWith(".api.powerplatform.com")) && teamsWorkflowPath.test(url.pathname)) {
    return { ok: true, kind: "teams", url: url.toString() };
  }

  return {
    ok: false,
    error: "Only Slack, Discord and Microsoft Teams webhook URLs are supported",
  };
}

export function shouldNotify(trigger: NotificationTrigger, alert: ReviewAlert): boolean {
  if (trigger === "all") return true;
  if (!alert.assessment) return false;
  if (trigger === "blocking") return alert.assessment.verdict === "request_changes";
  return alert.assessment.verdict === "request_changes" || alert.assessment.riskLevel !== "low";
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
  const verdict = alert.assessment ? VERDICT_TEXT[alert.assessment.verdict] : "Review completed";
  return `${alert.repoFullName} #${alert.prNumber}: ${verdict}`;
}

function findingLines(alert: ReviewAlert): string[] {
  return alert.topFindings.slice(0, 3).map((f) => `${f.severity.toUpperCase()}: ${f.title.slice(0, 800)}`);
}

export function buildAlertPayload(kind: NotificationKind, alert: ReviewAlert): unknown {
  const assessment = alert.assessment;
  const scores = assessment ? `Risk ${assessment.riskScore}/100 · Quality ${assessment.qualityScore}/100 · Security ${assessment.securityScore}/100` : null;
  const color = assessment ? RISK_COLORS[assessment.riskLevel] : { hex: "64748B", int: 0x64748b };
  const findings = findingLines(alert);

  if (kind === "slack") {
    return {
      text: `${headline(alert)}: ${alert.prTitle}`.slice(0, 2000),
      mrkdwn: false,
      unfurl_links: false,
      unfurl_media: false,
      attachments: [
        {
          color: `#${color.hex}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "plain_text",
                text: [headline(alert), alert.prTitle.slice(0, 2000), scores].filter(Boolean).join("\n"),
              },
            },
            ...(findings.length > 0
              ? [
                  {
                    type: "section",
                    text: { type: "plain_text", text: findings.map((f) => `• ${f}`).join("\n") },
                  },
                ]
              : []),
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Open pull request" },
                  url: alert.prUrl,
                },
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
          color: color.int,
          description: [`**${assessment ? VERDICT_TEXT[assessment.verdict] : "Review completed"}**`, scores, ...findings.map((f) => `• ${f}`)]
            .filter(Boolean)
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
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: headline(alert), weight: "Bolder", size: "Medium", wrap: true },
            { type: "TextBlock", text: alert.prTitle.slice(0, 2000), wrap: true },
            ...(scores ? [{ type: "TextBlock", text: scores, isSubtle: true, wrap: true }] : []),
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
