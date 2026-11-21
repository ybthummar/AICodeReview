import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import OpenAI from "openai";

const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.5-flash",
];

const GEMINI_TIMEOUT_MS = 20_000;
const COMPLETION_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 16_384;
const DEPLOY_BASE_URL = "https://api-sf1-cdn.deploy.com/api/v1";
const DEFAULT_DEPLOY_MODEL = "deepseek-ai/deepseek-v4.1-flash-1017";
const GLM_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_GLM_MODEL = "glm-4.7-flash";
const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

export function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_API_KEY?.trim();
}

async function generateChatCompletion(
  { apiKey, baseURL, model, disableThinking }: { apiKey: string; baseURL: string; model: string; disableThinking?: boolean },
  prompt: string,
  temperature = 0.7
) {
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    top_p: 0.9,
    max_tokens: MAX_OUTPUT_TOKENS,
    ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
    stream: true,
  }, { signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS) });

  let text = "";
  let completed = false;
  for await (const chunk of stream) {
    const choice = chunk.choices.find((item) => item.index === 0);
    text += choice?.delta.content ?? "";
    completed ||= choice?.finish_reason === "stop";
  }
  if (!completed) throw new Error("The model did not complete the response.");
  return text;
}

async function generateOpenAIText(apiKey: string, prompt: string) {
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    input: prompt,
    reasoning: { effort: "medium" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  }, { signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS) });
  if (response.status !== "completed") throw new Error("OpenAI did not complete the response.");
  return response.output_text;
}

export async function generateWithFallback(
  prompt: string,
  options: { temperature?: number } = {}
): Promise<string> {
  const attempts: { name: string; run: () => Promise<string> }[] = [];
  const { temperature } = options;

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    attempts.push(...GEMINI_MODELS.map((name) => ({
      name,
      run: async () => (await generateText({
        model: google(name),
        prompt,
        temperature,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      })).text,
    })));
  }

  const deployKey = process.env.DEPLOY_API_KEY?.trim();
  if (deployKey) {
    attempts.push({
      name: "Deploy DeepSeek",
      run: () => generateChatCompletion({
        apiKey: deployKey,
        baseURL: DEPLOY_BASE_URL,
        model: process.env.DEPLOY_MODEL?.trim() || DEFAULT_DEPLOY_MODEL,
      }, prompt, temperature),
    });
  }

  const glmKey = process.env.GLM_API_KEY?.trim() || process.env.GLM_ACCESS_KEY?.trim();
  if (glmKey) {
    attempts.push({
      name: "Z.AI GLM",
      run: () => generateChatCompletion({
        apiKey: glmKey,
        baseURL: GLM_BASE_URL,
        model: process.env.GLM_MODEL?.trim() || DEFAULT_GLM_MODEL,
        disableThinking: true,
      }, prompt, temperature),
    });
  }

  const openaiKey = getOpenAIApiKey();
  if (openaiKey) {
    attempts.push({ name: "OpenAI Responses", run: () => generateOpenAIText(openaiKey, prompt) });
  }

  if (!attempts.length) throw new Error("No AI text provider is configured.");

  for (const { name, run } of attempts) {
    try {
      const text = await run();
      if (text.trim()) return text;
    } catch (error) {
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      console.warn(`AI text generation failed for ${name}${status ? ` (HTTP ${status})` : ""}.`);
    }
  }

  throw new Error("No AI model could generate a response.");
}
