// Comments are posted with the connected user's token, so these markers are how RepoPilot recognises its own messages.
export const BOT_MARKER = "<!-- repopilot-bot -->";

export function findingMarker(findingId: string): string {
  return `<!-- rp-finding:${findingId} -->`;
}

export function parseFindingMarker(body: string | null | undefined): string | null {
  const match = /<!-- rp-finding:([A-Za-z0-9_-]+) -->/.exec(body ?? "");
  return match ? match[1] : null;
}

export function isBotComment(body: string | null | undefined): boolean {
  return Boolean(body && body.includes(BOT_MARKER));
}

export interface SlashCommand {
  name: "review" | "describe" | "ask" | "ignore" | "help" | "unknown";
  args: string;
}

const COMMANDS = new Set(["review", "describe", "ask", "ignore", "help"]);

// Only a comment that starts with the command counts, so quoting or mentioning it never triggers anything.
export function parseSlashCommand(body: string | null | undefined): SlashCommand | null {
  const match = /^\s*\/repopilot(?:\s+(\w+))?([\s\S]*)$/i.exec(body ?? "");
  if (!match) return null;

  const name = (match[1] ?? "help").toLowerCase();

  return {
    name: COMMANDS.has(name) ? (name as SlashCommand["name"]) : "unknown",
    args: (match[2] ?? "").trim(),
  };
}
