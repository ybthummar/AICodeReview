import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ai-code-reviewer",
  eventKey: process.env.INNGEST_EVENT_KEY || undefined,
});
