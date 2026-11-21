import OpenAI from "openai";
import { generateWithFallback, getOpenAIApiKey } from "@/module/ai/lib/generate";

export async function generateIssueInvestigation(prompt: string, publicRepository: boolean) {
  const apiKey = getOpenAIApiKey();
  const agentId = process.env.OPENAI_ISSUE_AGENT_ID?.trim();

  if (apiKey && agentId) {
    try {
      const client = new OpenAI({ apiKey, maxRetries: 0 });
      const events = await client.beta.agents.sessions.create({
        agent_id: agentId,
        agent: {
          // RepoPilot fetches GitHub data through the selected repository's access policy.
          tools: publicRepository ? [{ type: "web_search", mode: "live", context_size: "medium" }] : null,
          multi_agent: { enabled: false },
        },
        environment: { type: "none" },
        input: prompt,
        stream: true,
      }, { signal: AbortSignal.timeout(75_000) });

      try {
        const result = await events.finalResult();
        if (result.output_text.trim()) {
          return { markdown: result.output_text, usedAgent: true };
        }
      } finally {
        events.controller.abort();
      }
    } catch (error) {
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      console.warn(`OpenAI issue agent failed${status ? ` (HTTP ${status})` : ""}. Using text generation.`);
    }
  }

  return { markdown: await generateWithFallback(prompt), usedAgent: false };
}
