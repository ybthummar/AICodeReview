import { pinecone } from "@/lib/pinecone";
import { getEmbeddingProvider } from "@/module/ai/lib/embedding-provider";
import type { PineconeRecord } from "@pinecone-database/pinecone";

const API_VERSION = "2026-07";
const DEFAULT_DOCUMENT_NAMESPACE = "__default__";

type JsonRecord = Record<string, unknown>;
type PineconeMetadataValue = string | number | boolean | string[];
type PineconeMetadata = Record<string, PineconeMetadataValue>;
type PineconeMode = "documents" | "vectors";

interface DocumentPage {
  documents: { _id: string }[];
  pagination?: { next?: string };
}

interface FetchedDocuments {
  documents: Record<string, JsonRecord>;
}

interface SearchResponse {
  matches: (JsonRecord & { _id: string })[];
}

interface IndexDetails {
  name: string;
  host: string;
  dimension?: number;
}

let indexDetailsPromise: Promise<IndexDetails> | undefined;
let indexModePromise: Promise<PineconeMode> | undefined;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPineconeMetadata(metadata: object): PineconeMetadata {
  const result: PineconeMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      result[key] = value;
      continue;
    }
    throw new Error(`Unsupported Pinecone metadata value for field "${key}"`);
  }

  return result;
}

function getIndexName(): string {
  const provider = getEmbeddingProvider();
  const indexName = (
    provider === "google"
      ? process.env.PINECONE_GOOGLE_INDEX
      : process.env.PINECONE_BEDROCK_INDEX
  )
    ?.trim()
    .toLowerCase();

  if (!indexName) {
    const variable = provider === "google" ? "PINECONE_GOOGLE_INDEX" : "PINECONE_BEDROCK_INDEX";
    throw new Error(`${variable} must name the Pinecone index for ${provider} embeddings.`);
  }
  return indexName;
}

async function getIndexDetails(): Promise<IndexDetails> {
  if (!indexDetailsPromise) {
    indexDetailsPromise = pinecone.describeIndex(getIndexName()).then((index) => {
      if (!index.host) {
        throw new Error(`Pinecone index "${index.name}" has no data-plane host`);
      }
      return { name: index.name, host: `https://${index.host}`, dimension: index.dimension };
    });
  }

  try {
    return await indexDetailsPromise;
  } catch (error) {
    indexDetailsPromise = undefined;
    throw error;
  }
}

function getApiKey(): string {
  const apiKey = process.env.PINECOIN_DB_API_KEY || process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("Pinecone API key is not configured");
  }
  return apiKey;
}

async function getIndexMode(): Promise<PineconeMode> {
  if (!indexModePromise) {
    indexModePromise = (async () => {
      const { host } = await getIndexDetails();
      const response = await fetch(
        `${host}/namespaces/${DEFAULT_DOCUMENT_NAMESPACE}/documents/list`,
        {
          method: "POST",
          headers: {
            "Api-Key": getApiKey(),
            "Content-Type": "application/json",
            "X-Pinecone-Api-Version": API_VERSION,
          },
          body: JSON.stringify({ limit: 1 }),
        }
      );

      if (response.ok) return "documents";

      const detail = await response.text();
      if (response.status === 400 && detail.includes("not served by the documents API")) {
        return "vectors";
      }

      throw new Error(
        `Could not determine Pinecone data API mode (${response.status}): ${detail.slice(0, 1000)}`
      );
    })();
  }

  try {
    return await indexModePromise;
  } catch (error) {
    indexModePromise = undefined;
    throw error;
  }
}

function getVectorIndex(namespace: string) {
  return pinecone.index(getIndexName()).namespace(namespace);
}

function getNamespace(mode: PineconeMode): string {
  const configured = process.env.PINECONE_NAMESPACE?.trim();
  if (configured) return configured;
  return mode === "documents" ? DEFAULT_DOCUMENT_NAMESPACE : "";
}

async function requestDocumentsApi(path: string, body: JsonRecord): Promise<unknown> {
  const { host } = await getIndexDetails();
  const response = await fetch(
    `${host}/namespaces/${encodeURIComponent(getNamespace("documents"))}/documents/${path}`,
    {
      method: "POST",
      headers: {
        "Api-Key": getApiKey(),
        "Content-Type": "application/json",
        "X-Pinecone-Api-Version": API_VERSION,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(
      `Pinecone Documents API ${path} failed with status ${response.status}: ${detail}`
    );
  }

  return response.json();
}

export async function getPineconeIndexDimension(): Promise<number> {
  const { dimension } = await getIndexDetails();
  if (!dimension || !Number.isInteger(dimension)) {
    throw new Error(`Pinecone index "${getIndexName()}" does not expose a valid dense dimension.`);
  }
  return dimension;
}

export async function listPineconeDocuments(
  prefix: string,
  paginationToken?: string
): Promise<DocumentPage> {
  if (await getIndexMode() === "documents") {
    const response = await requestDocumentsApi("list", {
      prefix,
      limit: 100,
      ...(paginationToken ? { pagination_token: paginationToken } : {}),
    });

    if (!isRecord(response) || !Array.isArray(response.documents)) {
      throw new Error("Pinecone Documents API returned an invalid list response");
    }
    return response as unknown as DocumentPage;
  }

  const page = await getVectorIndex(getNamespace("vectors")).listPaginated({
    prefix,
    limit: 100,
    ...(paginationToken ? { paginationToken } : {}),
  });
  return {
    documents: (page.vectors ?? []).flatMap((record) =>
      record.id ? [{ _id: record.id }] : []
    ),
    ...(page.pagination?.next ? { pagination: { next: page.pagination.next } } : {}),
  };
}

export async function fetchPineconeDocuments(ids: string[]): Promise<FetchedDocuments> {
  if (await getIndexMode() === "documents") {
    const response = await requestDocumentsApi("fetch", {
      ids,
      include_fields: ["repoId"],
    });

    if (!isRecord(response) || !isRecord(response.documents)) {
      throw new Error("Pinecone Documents API returned an invalid fetch response");
    }
    return response as unknown as FetchedDocuments;
  }

  const response = await getVectorIndex(getNamespace("vectors")).fetch(ids);
  const documents: Record<string, JsonRecord> = {};
  for (const [id, record] of Object.entries(response.records ?? {})) {
    documents[id] = isRecord(record.metadata) ? record.metadata : {};
  }
  return { documents };
}

export async function deletePineconeDocuments(ids: string[]): Promise<void> {
  if (await getIndexMode() === "documents") {
    await requestDocumentsApi("delete", { ids });
    return;
  }
  await getVectorIndex(getNamespace("vectors")).deleteMany(ids);
}

export async function upsertPineconeDocuments<T extends object>(
  documents: { id: string; values: number[]; metadata: T }[]
): Promise<void> {
  if (await getIndexMode() === "documents") {
    const embeddingField = process.env.PINECONE_EMBEDDING_FIELD?.trim() || "embedding";
    await requestDocumentsApi("upsert", {
      documents: documents.map(({ id, values, metadata }) => ({
        _id: id,
        ...toPineconeMetadata(metadata),
        [embeddingField]: values,
      })),
    });
    return;
  }

  const records: PineconeRecord[] = documents.map(({ id, values, metadata }) => ({
    id,
    values,
    metadata: toPineconeMetadata(metadata),
  }));
  await getVectorIndex(getNamespace("vectors")).upsert(records);
}

export async function searchPineconeDocuments(
  embedding: number[],
  repoId: string,
  topK: number
): Promise<SearchResponse> {
  if (await getIndexMode() === "documents") {
    const embeddingField = process.env.PINECONE_EMBEDDING_FIELD?.trim() || "embedding";
    const response = await requestDocumentsApi("search", {
      score_by: [{ type: "dense_vector", field: embeddingField, values: embedding }],
      filter: { repoId },
      top_k: topK,
      include_fields: [
        "repoId",
        "path",
        "content",
        "type",
        "symbolName",
        "symbolType",
        "startLine",
        "endLine",
      ],
    });

    if (!isRecord(response) || !Array.isArray(response.matches)) {
      throw new Error("Pinecone Documents API returned an invalid search response");
    }
    return response as unknown as SearchResponse;
  }

  const response = await getVectorIndex(getNamespace("vectors")).query({
    vector: embedding,
    filter: { repoId },
    topK,
    includeMetadata: true,
  });
  return {
    matches: (response.matches ?? []).flatMap((match) =>
      match.id && match.metadata
        ? [{ _id: match.id, _score: match.score ?? null, ...match.metadata }]
        : []
    ),
  };
}
