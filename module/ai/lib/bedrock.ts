const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_CONCURRENCY = 8;
const DEFAULT_EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

function getBedrockConfig() {
  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

  if (!apiKey || !region) return null;

  return { apiKey, region };
}

export function isBedrockConfigured(): boolean {
  return Boolean(getBedrockConfig() && process.env.BEDROCK_CHAT_MODEL_ID);
}

export function isBedrockEmbeddingConfigured(): boolean {
  return Boolean(getBedrockConfig());
}

async function invokeBedrock(modelId: string, operation: "converse" | "invoke", body: unknown) {
  const config = getBedrockConfig();
  if (!config) {
    throw new Error("Bedrock requires AWS_BEARER_TOKEN_BEDROCK and AWS_REGION.");
  }

  const response = await fetch(
    `https://bedrock-runtime.${config.region}.amazonaws.com/model/${encodeURIComponent(modelId)}/${operation}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    const permissionHint = details.includes("Operation not allowed")
      ? ` Check that the bearer key was generated in ${config.region} and its IAM principal can invoke the configured model or inference profile.`
      : "";
    throw new Error(
      `Bedrock ${operation} request failed (${response.status}): ${details}${permissionHint}`
    );
  }

  return response.json() as Promise<unknown>;
}

export async function generateBedrockText(
  prompt: string,
  options: { temperature?: number } = {}
): Promise<string> {
  const modelId = process.env.BEDROCK_CHAT_MODEL_ID;
  if (!modelId) {
    throw new Error("BEDROCK_CHAT_MODEL_ID is not configured.");
  }

  const result = await invokeBedrock(modelId, "converse", {
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: {
      maxTokens: 32000,
      stopSequences: [],
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    },
    additionalModelRequestFields: { top_k: 250 },
  });

  if (!result || typeof result !== "object" || !("output" in result)) {
    throw new Error("Bedrock returned an invalid Converse response.");
  }

  const output = result.output;
  if (!output || typeof output !== "object" || !("message" in output)) {
    throw new Error("Bedrock Converse response did not contain a message.");
  }

  const content = output.message;
  if (!content || typeof content !== "object" || !("content" in content) || !Array.isArray(content.content)) {
    throw new Error("Bedrock Converse response did not contain message content.");
  }

  const text = content.content
    .map((part) =>
      part && typeof part === "object" && "text" in part && typeof part.text === "string"
        ? part.text
        : ""
    )
    .join("");

  if (!text) {
    throw new Error("Bedrock returned no text content.");
  }

  return text;
}

async function generateBedrockEmbedding(inputText: string, modelId: string): Promise<number[]> {
  const result = await invokeBedrock(modelId, "invoke", {
    inputText,
    dimensions: EMBEDDING_DIMENSIONS,
    normalize: true,
  });

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
