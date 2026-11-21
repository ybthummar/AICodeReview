import { createHash } from "node:crypto";
import {
  deletePineconeDocuments,
  fetchPineconeDocuments,
  getPineconeIndexDimension,
  listPineconeDocuments,
  searchPineconeDocuments,
  upsertPineconeDocuments,
} from "@/lib/pinecone-documents";
import { embedMany } from "ai";
import { google } from "@ai-sdk/google";
import {
  generateBedrockEmbeddings,
} from "@/module/ai/lib/bedrock";
import { getEmbeddingProvider } from "@/module/ai/lib/embedding-provider";
import { parseWithASTService } from "@/module/ast/client";
import { SYMBOL_PARSER_EXTENSIONS, isIndexablePath } from "@/module/ai/lib/indexable";
import type { CodeMetadata } from "@/types/ast/type";

const EMBEDDING_MODEL_ID = "gemini-embedding-001";
const BEDROCK_EMBEDDING_DIMENSIONS = 1024;
const EMBED_BATCH_SIZE = 50;
const UPSERT_BATCH_SIZE = 96;
const PARSE_CONCURRENCY = 5;
const MAX_ID_LENGTH = 500;
const MAX_FILE_CHARS = 8000;
const FILE_CHUNK_OVERLAP = 500;
const MAX_SYMBOL_CHARS = 2000;

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const [embedding] = await generateEmbeddings([text]);
    return embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw error;
  }
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const dimensions = await getPineconeIndexDimension();
  let embeddings: number[][];

  if (getEmbeddingProvider() === "bedrock") {
    if (dimensions !== BEDROCK_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Bedrock Titan embeddings are ${BEDROCK_EMBEDDING_DIMENSIONS}-dimensional, but the configured Pinecone index requires ${dimensions}. Select Google embeddings or a matching index.`
      );
    }
    embeddings = await generateBedrockEmbeddings(texts);
  } else {
    embeddings = (
      await embedMany({
        model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
        values: texts,
        providerOptions: {
          google: { outputDimensionality: dimensions },
        },
      })
    ).embeddings;
  }

  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embedding provider returned ${embeddings.length} vectors for ${texts.length} items`
    );
  }

  for (const [index, embedding] of embeddings.entries()) {
    if (
      embedding.length !== dimensions ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding provider returned an invalid vector for the configured ${dimensions}-dimension Pinecone index (item ${index})`
      );
    }
  }

  return embeddings;
}

// The separator cannot appear in "owner/repo", so one repository's prefix never matches another's.
function vectorId(repoId: string, path: string, symbol?: string): string {
  const prefix = `${repoId}::`;
  const suffix = [path, symbol].filter(Boolean).join("::");
  const raw = `${prefix}${encodeURIComponent(suffix).replace(/%3A%3A/gi, "::")}`;

  if (raw.length <= MAX_ID_LENGTH) return raw;

  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 20);
  return `${raw.slice(0, MAX_ID_LENGTH - hash.length - 2)}::${hash}`;
}

interface ParsedSymbol {
  type: "function" | "class";
  name: string;
  code: string;
  startLine: number;
  endLine: number;
}

interface PendingVector {
  id: string;
  text: string;
  metadata: CodeMetadata;
}

function splitFileIntoChunks(content: string): string[] {
  if (!content) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    let end = Math.min(start + MAX_FILE_CHARS, content.length);
    if (end < content.length) {
      const lineEnd = content.lastIndexOf("\n", end);
      if (lineEnd + 1 > start + FILE_CHUNK_OVERLAP) end = lineEnd + 1;
    }

    chunks.push(content.slice(start, end));
    if (end === content.length) break;
    start = end - FILE_CHUNK_OVERLAP;
  }

  return chunks;
}

async function extractSymbols(content: string, ext: string, path: string): Promise<ParsedSymbol[]> {
  if (!SYMBOL_PARSER_EXTENSIONS.includes(ext)) return [];

  try {
    const result = await parseWithASTService(content, ext);
    return result.symbols || [];
  } catch (error) {
    console.warn("AST service failed for:", path, error);
    return [];
  }
}

async function listIdsWithPrefix(prefix: string): Promise<string[]> {
  const ids: string[] = [];
  let paginationToken: string | undefined;
  const seenTokens = new Set<string>();

  while (true) {
    if (paginationToken) {
      if (seenTokens.has(paginationToken)) {
        throw new Error(`Pinecone repeated a pagination token while listing ${prefix}`);
      }
      seenTokens.add(paginationToken);
    }

    const page = await listPineconeDocuments(prefix, paginationToken);

    for (const document of page.documents) {
      if (document._id) ids.push(document._id);
    }
    paginationToken = page.pagination?.next;
    if (!paginationToken) break;
  }

  return ids;
}

async function deleteIds(ids: string[]) {
  for (let i = 0; i < ids.length; i += 500) {
    await deletePineconeDocuments(ids.slice(i, i + 500));
  }
}

// Removes every vector of one repository, including ids written by the older "repo-path" scheme.
export async function purgeRepositoryVectors(
  repoId: string,
  keepIds: ReadonlySet<string> = new Set()
): Promise<number> {
  const current = await listIdsWithPrefix(`${repoId}::`);
  const stale = current.filter((id) => !keepIds.has(id));
  await deleteIds(stale);

  // Legacy ids share a prefix with sibling repositories, so ownership is checked via metadata.
  const legacy = await listIdsWithPrefix(`${repoId}-`);
  const owned: string[] = [];

  for (let i = 0; i < legacy.length; i += 100) {
    const batch = legacy.slice(i, i + 100);
    const fetched = await fetchPineconeDocuments(batch);
    for (const id of batch) {
      if (fetched.documents[id]?.repoId === repoId) owned.push(id);
    }
  }

  await deleteIds(owned);
  return stale.length + owned.length;
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[]
) {
  const pending: PendingVector[] = [];
  const indexable = files.filter((file) => isIndexablePath(file.path));

  let cursor = 0;
  const worker = async () => {
    while (cursor < indexable.length) {
      const file = indexable[cursor++];
      const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
      const symbols = await extractSymbols(file.content, ext, file.path);

      const chunks = splitFileIntoChunks(file.content);
      chunks.forEach((chunk, index) => {
        const text = `File: ${file.path} (chunk ${index + 1})\n\n${chunk}`;
        pending.push({
          id: vectorId(repoId, file.path, `__file_chunk__${index + 1}`),
          text,
          metadata: {
            repoId,
            path: file.path,
            content: chunk.slice(0, 1500),
            type: "file",
          },
        });
      });

      if (symbols.length === 0) {
        continue;
      }

      for (const symbol of symbols) {
        pending.push({
          id: vectorId(repoId, file.path, `${symbol.name}@${symbol.startLine}`),
          text: `${file.path}\n${symbol.code}`.slice(0, MAX_SYMBOL_CHARS),
          metadata: {
            repoId,
            path: file.path,
            type: "symbol",
            symbolName: symbol.name,
            symbolType: symbol.type,
            startLine: symbol.startLine,
            endLine: symbol.endLine,
            content: symbol.code.slice(0, 1500),
          },
        });
      }
    }
  };

  await Promise.all(Array.from({ length: PARSE_CONCURRENCY }, worker));

  const vectors: { id: string; values: number[]; metadata: CodeMetadata }[] = [];

  for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBED_BATCH_SIZE);

    try {
      const embeddings = await generateEmbeddings(batch.map((item) => item.text));

      if (embeddings.length !== batch.length) {
        throw new Error(
          `Embedding provider returned ${embeddings.length} vectors for ${batch.length} items`
        );
      }

      batch.forEach((item, index) => {
        const values = embeddings[index];
        if (!values.length || values.some((value) => !Number.isFinite(value))) {
          throw new Error(`Embedding provider returned an invalid vector for ${item.id}`);
        }
        vectors.push({ id: item.id, values, metadata: item.metadata });
      });
    } catch (error) {
      console.error(`Failed to embed batch starting at ${i} for ${repoId}:`, error);
      throw error;
    }
  }

  if (vectors.length === 0) {
    console.log(`No vectors generated for repository ${repoId}`);
    await purgeRepositoryVectors(repoId);
    return { indexed: 0 };
  }

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    try {
      await upsertPineconeDocuments(batch);
      console.log(`Upserted batch of ${batch.length} vectors to Pinecone for ${repoId}`);
    } catch (error) {
      console.error(`Failed to upsert batch to Pinecone:`, error);
      throw error;
    }
  }

  // Keep the last complete index intact until every new vector has been embedded and upserted.
  await purgeRepositoryVectors(repoId, new Set(vectors.map((vector) => vector.id)));

  return { indexed: vectors.length };
}

export async function retrieveContext(
  query: string,
  repoId: string,
  topK: number = 10
) {
  const embedding = await generateEmbedding(query);

  const results = await searchPineconeDocuments(embedding, repoId, topK);

  return results.matches
    .map(stripSearchFields)
    .filter(isCodeMetadata);
}

function stripSearchFields(match: Record<string, unknown>): Record<string, unknown> {
  const metadata = { ...match };
  delete metadata._id;
  delete metadata._score;
  return metadata;
}

function isCodeMetadata(value: Record<string, unknown>): value is CodeMetadata {
  return (
    typeof value.repoId === "string" &&
    typeof value.path === "string" &&
    (value.type === "file" || value.type === "symbol")
  );
}
