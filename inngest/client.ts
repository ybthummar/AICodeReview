import { Inngest } from "inngest";

const hasExplicitInngestTarget =
  process.env.INNGEST_BASE_URL ||
  process.env.INNGEST_EVENT_API_BASE_URL ||
  process.env.INNGEST_DEV;

export const inngest = new Inngest({
  id: "ai-code-reviewer",
  eventKey: process.env.INNGEST_EVENT_KEY || undefined,
  ...(process.env.NODE_ENV === "development" && !hasExplicitInngestTarget
    ? { baseUrl: "http://localhost:8288" }
    : {}),
});
