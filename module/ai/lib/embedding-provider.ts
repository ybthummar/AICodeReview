import { isBedrockEmbeddingConfigured } from "@/module/ai/lib/bedrock";

export type EmbeddingProvider = "google" | "bedrock";

export function getEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.AI_EMBEDDING_PROVIDER?.trim().toLowerCase();

  if (!provider || provider === "google") return "google";
  if (provider === "bedrock") {
    if (!isBedrockEmbeddingConfigured()) {
      throw new Error("AI_EMBEDDING_PROVIDER is bedrock, but Bedrock credentials are not configured.");
    }
    return "bedrock";
  }

  throw new Error('AI_EMBEDDING_PROVIDER must be either "bedrock" or "google".');
}
