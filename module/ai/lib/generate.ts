import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { generateBedrockText, isBedrockConfigured } from "@/module/ai/lib/bedrock";

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

  if (isBedrockConfigured()) {
    try {
      return await generateBedrockText(prompt, options);
    } catch (error) {
      console.warn("Bedrock model failed; trying configured Google model fallbacks.", error);
      lastError = error;
    }
  }

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

  if (lastError) throw lastError;
  throw new Error("No AI model could generate a response.");
}
