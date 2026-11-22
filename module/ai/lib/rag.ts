import { createHash } from "node:crypto";
import prisma from "@/lib/db";
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
import { parseWithASTService } from "@/module/ast/client";
import { SYMBOL_PARSER_EXTENSIONS, isIndexablePath } from "@/module/ai/lib/indexable";
import type { CodeMetadata } from "@/types/ast/type";

const EMBEDDING_MODEL_ID = "gemini-embedding-001";
const EMBED_BATCH_SIZE = 50;
const UPSERT_BATCH_SIZE = 50;
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

async function generateEmbeddings(texts: string[], maxRetries?: number): Promise<number[][]> {
  const dimensions = await getPineconeIndexDimension();
  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
    values: texts,
    maxRetries,
    abortSignal: AbortSignal.timeout(25_000),
    providerOptions: {
      google: { outputDimensionality: dimensions },
    },
  });

  if (embeddings.length !== texts.length) {
    throw new Error(
      `Gemini returned ${embeddings.length} vectors for ${texts.length} items`
    );
  }

  for (const [index, embedding] of embeddings.entries()) {
    if (
      embedding.length !== dimensions ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Gemini returned an invalid vector for the configured ${dimensions}-dimension Pinecone index (item ${index})`
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

export function repositoryIndexKey(fullName: string, revision?: string | null) {
  return revision ? `${fullName}@${revision}` : fullName;
}

export async function repositoryIndexIsVisible(indexKey: string, vectorCount: number) {
  return (await listIdsWithPrefix(`${indexKey}::`)).length === vectorCount;
}

export async function purgeRepositoryIndex(fullName: string, revision?: string | null) {
  const key = repositoryIndexKey(fullName, revision);
  await deleteIds(await listIdsWithPrefix(`${key}::`));
  if (revision) return;

  // Legacy ids share a prefix with sibling repositories, so ownership is checked via metadata.
  const legacy = await listIdsWithPrefix(`${fullName}-`);
  const owned: string[] = [];

  for (let i = 0; i < legacy.length; i += 100) {
    const batch = legacy.slice(i, i + 100);
    const fetched = await fetchPineconeDocuments(batch);
    for (const id of batch) {
      if (fetched.documents[id]?.repoId === fullName) owned.push(id);
    }
  }

  await deleteIds(owned);
}

export async function purgeRepositoryVectors(fullName: string) {
  await purgeRepositoryIndex(fullName);
  await deleteIds(await listIdsWithPrefix(`${fullName}@`));
}

export async function indexCodebaseBatch(
  repoId: string,
  files: { path: string; content: string }[]
) {
  const pending = new Map<string, PendingVector>();
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
        const id = vectorId(repoId, file.path, `__file_chunk__${index + 1}`);
        pending.set(id, {
          id,
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
        const id = vectorId(repoId, file.path, `${symbol.name}@${symbol.startLine}`);
        pending.set(id, {
          id,
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

  const entries = Array.from(pending.values());
  let embeddingMs = 0;
  let upsertMs = 0;
  for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMBED_BATCH_SIZE);
    const embeddingStarted = performance.now();
    const embeddings = await generateEmbeddings(batch.map((item) => item.text), 0);
    embeddingMs += performance.now() - embeddingStarted;
    const vectors = batch.map(({ id, metadata }, index) => ({ id, values: embeddings[index], metadata }));
    for (let j = 0; j < vectors.length; j += UPSERT_BATCH_SIZE) {
      const upsertStarted = performance.now();
      await upsertPineconeDocuments(vectors.slice(j, j + UPSERT_BATCH_SIZE));
      upsertMs += performance.now() - upsertStarted;
    }
  }

  console.info("[repository-index-batch]", {
    files: indexable.length,
    vectors: entries.length,
    embeddingMs: Math.round(embeddingMs),
    upsertMs: Math.round(upsertMs),
  });

  return { indexed: entries.length };
}

export async function retrieveContext(
  query: string,
  repoId: string,
  topK: number = 10
) {
  const [embedding, repository] = await Promise.all([
    generateEmbedding(query),
    prisma.repository.findFirst({
      where: { fullName: { equals: repoId, mode: "insensitive" } },
      select: { fullName: true, indexRevision: true },
    }),
  ]);
  const indexKey = repositoryIndexKey(repository?.fullName ?? repoId, repository?.indexRevision);
  const results = await searchPineconeDocuments(embedding, indexKey, topK);

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
