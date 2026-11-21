import { pinecone } from "@/lib/pinecone";

const API_VERSION = "2026-07";
const DEFAULT_NAMESPACE = "__default__";
const EMBEDDING_FIELD = process.env.PINECONE_EMBEDDING_FIELD || "embedding";
const indexName = (process.env.PINECONE_INDEX || "repopilot-v2").toLowerCase();

type JsonRecord = Record<string, unknown>;

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

let indexHostPromise: Promise<string> | undefined;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getIndexHost(): Promise<string> {
  if (!indexHostPromise) {
    indexHostPromise = pinecone.describeIndex(indexName).then((index) => {
      if (!index.host) {
        throw new Error(`Pinecone index "${indexName}" has no data-plane host`);
      }
      return `https://${index.host}`;
    });
  }

  try {
    return await indexHostPromise;
  } catch (error) {
    indexHostPromise = undefined;
    throw error;
  }
}

async function requestDocumentsApi(path: string, body: JsonRecord): Promise<unknown> {
  const apiKey = process.env.PINECOIN_DB_API_KEY || process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("Pinecone API key is not configured");
  }

  const host = await getIndexHost();
  const response = await fetch(`${host}/namespaces/${DEFAULT_NAMESPACE}/documents/${path}`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Pinecone-Api-Version": API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(
      `Pinecone Documents API ${path} failed with status ${response.status}: ${detail}`
    );
  }

  return response.json();
}

export async function listPineconeDocuments(
  prefix: string,
  paginationToken?: string
): Promise<DocumentPage> {
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

export async function fetchPineconeDocuments(ids: string[]): Promise<FetchedDocuments> {
  const response = await requestDocumentsApi("fetch", {
    ids,
    include_fields: ["repoId"],
  });

  if (!isRecord(response) || !isRecord(response.documents)) {
    throw new Error("Pinecone Documents API returned an invalid fetch response");
  }

  return response as unknown as FetchedDocuments;
}

export async function deletePineconeDocuments(ids: string[]): Promise<void> {
  await requestDocumentsApi("delete", { ids });
}

export async function upsertPineconeDocuments(
  documents: { id: string; values: number[]; metadata: JsonRecord }[]
): Promise<void> {
  if (!EMBEDDING_FIELD.trim()) {
    throw new Error("PINECONE_EMBEDDING_FIELD must not be empty");
  }

  const response = await requestDocumentsApi("upsert", {
    documents: documents.map(({ id, values, metadata }) => ({
      _id: id,
      ...metadata,
      [EMBEDDING_FIELD]: values,
    })),
  });

  if (!isRecord(response)) {
    throw new Error("Pinecone Documents API returned an invalid upsert response");
  }
}

export async function searchPineconeDocuments(
  embedding: number[],
  repoId: string,
  topK: number
): Promise<SearchResponse> {
  const response = await requestDocumentsApi("search", {
    score_by: [{ type: "dense_vector", field: EMBEDDING_FIELD, values: embedding }],
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
