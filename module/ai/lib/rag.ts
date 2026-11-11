import { pineconeIndex } from "@/lib/pinecone";
import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { parseWithASTService } from "@/module/ast/client";
import { SYMBOL_PARSER_EXTENSIONS, isIndexablePath } from "@/module/ai/lib/indexable";
import type { PineconeRecord } from "@pinecone-database/pinecone";
import type { CodeMetadata } from "@/types/ast/type";

const EMBEDDING_MODEL_ID = "gemini-embedding-001";
const EMBED_BATCH_SIZE = 50;
const UPSERT_BATCH_SIZE = 100;
const PARSE_CONCURRENCY = 5;
const MAX_ID_LENGTH = 500;
const MAX_FILE_CHARS = 8000;
const MAX_SYMBOL_CHARS = 2000;

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
      value: text,
    });

    return embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw error;
  }
}

// The separator cannot appear in "owner/repo", so one repository's prefix never matches another's.
function vectorId(repoId: string, path: string, symbol?: string): string {
  const raw = [repoId, path, symbol].filter(Boolean).join("::");
  return raw.replace(/[^\x20-\x7E]/g, (char) => encodeURIComponent(char)).slice(0, MAX_ID_LENGTH);
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

  do {
    const page = await pineconeIndex.listPaginated({
      prefix,
      limit: 100,
      ...(paginationToken ? { paginationToken } : {}),
    });

    for (const vector of page.vectors ?? []) {
      if (vector.id) ids.push(vector.id);
    }
    paginationToken = page.pagination?.next;
  } while (paginationToken && ids.length < 20000);

  return ids;
}

async function deleteIds(ids: string[]) {
  for (let i = 0; i < ids.length; i += 500) {
    await pineconeIndex.deleteMany(ids.slice(i, i + 500));
  }
}

// Removes every vector of one repository, including ids written by the older "repo-path" scheme.
export async function purgeRepositoryVectors(repoId: string): Promise<number> {
  let removed = 0;

  try {
    const current = await listIdsWithPrefix(`${repoId}::`);
    await deleteIds(current);
    removed += current.length;

    // Legacy ids share a prefix with sibling repositories, so ownership is checked via metadata.
    const legacy = await listIdsWithPrefix(`${repoId}-`);
    const owned: string[] = [];

    for (let i = 0; i < legacy.length; i += 100) {
      const batch = legacy.slice(i, i + 100);
      const fetched = await pineconeIndex.fetch(batch);
      for (const id of batch) {
        if (fetched.records?.[id]?.metadata?.repoId === repoId) owned.push(id);
      }
    }

    await deleteIds(owned);
    removed += owned.length;
  } catch (error) {
    console.warn(`Could not purge vectors for ${repoId}:`, error);
  }

  return removed;
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

      if (symbols.length === 0) {
        const text = `File: ${file.path}\n\n${file.content}`.slice(0, MAX_FILE_CHARS);
        pending.push({
          id: vectorId(repoId, file.path),
          text,
          metadata: { repoId, path: file.path, content: text, type: "file" },
        });
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

  const vectors: PineconeRecord<CodeMetadata>[] = [];

  for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBED_BATCH_SIZE);

    try {
      const { embeddings } = await embedMany({
        model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
        values: batch.map((item) => item.text),
      });

      batch.forEach((item, index) => {
        vectors.push({ id: item.id, values: embeddings[index], metadata: item.metadata });
      });
    } catch (error) {
      console.error(`Failed to embed batch starting at ${i} for ${repoId}:`, error);
    }
  }

  if (vectors.length === 0) {
    console.log(`No vectors generated for repository ${repoId}`);
    return { indexed: 0 };
  }

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    try {
      await pineconeIndex.upsert(batch);
      console.log(`Upserted batch of ${batch.length} vectors to Pinecone for ${repoId}`);
    } catch (error) {
      console.error(`Failed to upsert batch to Pinecone:`, error);
    }
  }

  return { indexed: vectors.length };
}

export async function retrieveContext(
  query: string,
  repoId: string,
  topK: number = 10
) {
  try {
    const embedding = await generateEmbedding(query);

    const results = await pineconeIndex.query({
      vector: embedding,
      filter: { repoId },
      topK,
      includeMetadata: true,
    });

    return (results.matches ?? []).map((match) => match.metadata).filter(Boolean);
  } catch (error) {
    console.warn(`Vector search failed for repo ${repoId}:`, error);
    return [];
  }
}
