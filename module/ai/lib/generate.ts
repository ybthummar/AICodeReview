import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const MODELS_TO_TRY = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.5-flash",
];

export async function generateWithFallback(
  prompt: string,
  options: { temperature?: number } = {}
): Promise<string> {
  let lastError: unknown;

  for (const modelName of MODELS_TO_TRY) {
    try {
      const { text } = await generateText({
        model: google(modelName),
        prompt,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });
      return text;
    } catch (err) {
      console.warn(`Model ${modelName} failed or busy, trying fallback...`);
      lastError = err;
    }
  }

  throw lastError;
}
