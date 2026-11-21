import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_CONCURRENCY = 8;
const DEFAULT_EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

function getBedrockRegion(): string | undefined {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
}

function getBedrockClient(): BedrockRuntimeClient {
  const region = getBedrockRegion();
  if (!region) {
    throw new Error("AWS_REGION is required to call Amazon Bedrock.");
  }

  return new BedrockRuntimeClient({
    region,
    credentials: defaultProvider(),
  });
}

export function isBedrockConfigured(): boolean {
  return Boolean(getBedrockRegion() && process.env.BEDROCK_CHAT_MODEL_ID);
}

export function isBedrockEmbeddingConfigured(): boolean {
  return Boolean(getBedrockRegion());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name ? `${error.name}: ` : "";
    return `${name}${error.message}`;
  }
  return String(error);
}

export async function generateBedrockText(
  prompt: string,
  options: { temperature?: number } = {}
): Promise<string> {
  const modelId = process.env.BEDROCK_CHAT_MODEL_ID;
  if (!modelId) {
    throw new Error("BEDROCK_CHAT_MODEL_ID is not configured.");
  }

  try {
    const response = await getBedrockClient().send(
      new ConverseCommand({
        modelId,
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: {
          maxTokens: 32000,
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        },
        additionalModelRequestFields: { top_k: 250 },
      })
    );

    const text = response.output?.message?.content
      ?.map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
      .join("");

    if (!text) {
      throw new Error("Bedrock Converse response did not contain text.");
    }

    return text;
  } catch (error) {
    throw new Error(`Bedrock Converse request failed: ${errorMessage(error)}`, { cause: error });
  }
}

async function generateBedrockEmbedding(inputText: string, modelId: string): Promise<number[]> {
  try {
    const response = await getBedrockClient().send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          inputText,
          dimensions: EMBEDDING_DIMENSIONS,
          normalize: true,
        }),
      })
    );

    if (!response.body) {
      throw new Error("Bedrock returned an empty embedding response.");
    }

    const result: unknown = JSON.parse(new TextDecoder().decode(response.body));
    if (
      !result ||
      typeof result !== "object" ||
      !("embedding" in result) ||
      !Array.isArray(result.embedding) ||
      result.embedding.length !== EMBEDDING_DIMENSIONS ||
      !result.embedding.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new Error(`Bedrock returned an invalid ${EMBEDDING_DIMENSIONS}-dimension embedding.`);
    }

    return result.embedding as number[];
  } catch (error) {
    throw new Error(`Bedrock embedding request failed: ${errorMessage(error)}`, { cause: error });
  }
}

export async function generateBedrockEmbeddings(texts: string[]): Promise<number[][]> {
  const modelId = process.env.BEDROCK_EMBEDDING_MODEL_ID || DEFAULT_EMBEDDING_MODEL_ID;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_CONCURRENCY) {
    const batch = await Promise.all(
      texts
        .slice(i, i + EMBEDDING_CONCURRENCY)
        .map((text) => generateBedrockEmbedding(text, modelId))
    );
    embeddings.push(...batch);
  }

  return embeddings;
}
