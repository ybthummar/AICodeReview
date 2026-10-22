import { pineconeIndex } from "@/lib/pinecone";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import { parseWithASTService } from "@/module/ast/client";
import type { PineconeRecord } from "@pinecone-database/pinecone";
import type { CodeMetadata } from "@/types/ast/type";

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      value: text,
    });

    return embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw error;
  }
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[]
) {
  const vectors: PineconeRecord<CodeMetadata>[] = [];

  for (const file of files) {
    const ext = file.path.split(".").pop()?.toLowerCase();
    if (!ext || !["js", "ts", "jsx", "tsx", "py", "go", "java"].includes(ext)) {
      continue;
    }

    let symbols: {
      type: "function" | "class";
      name: string;
      code: string;
      startLine: number;
      endLine: number;
    }[] = [];

    try {
      const result = await parseWithASTService(file.content, ext);
      symbols = result.symbols || [];
    } catch (error) {
      console.warn("AST service failed for:", file.path, error);
    }

    // If no symbols were extracted, embed the truncated file content
    if (symbols.length === 0) {
      const content = `File: ${file.path}\n\n${file.content}`;
      const truncatedContent = content.slice(0, 8000);

      try {
        const embedding = await generateEmbedding(truncatedContent);

        vectors.push({
          id: `${repoId}-${file.path.replace(/\//g, "_")}`,
          values: embedding,
          metadata: {
            repoId,
            path: file.path,
            content: truncatedContent,
            type: "file",
          },
        });
      } catch (error) {
        console.error(`Failed to embed file ${file.path}:`, error);
      }
    }

    // Embed each extracted symbol
    for (const symbol of symbols) {
      try {
        const embedding = await generateEmbedding(symbol.code.slice(0, 2000));

        vectors.push({
          id: `${repoId}-${file.path.replace(/\//g, "_")}-${symbol.name}`,
          values: embedding,
          metadata: {
            repoId,
            path: file.path,
            type: "symbol",
            symbolName: symbol.name,
            symbolType: symbol.type,
            startLine: symbol.startLine,
            endLine: symbol.endLine,
          },
        });
      } catch (error) {
        console.error(`Failed to embed symbol ${symbol.name} in ${file.path}:`, error);
      }
    }
  }

  if (vectors.length === 0) {
    console.log(`No vectors generated for repository ${repoId}`);
    return;
  }

  const batchSize = 100;

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    try {
      await pineconeIndex.upsert(batch);
      console.log(`Upserted batch of ${batch.length} vectors to Pinecone for ${repoId}`);
    } catch (error) {
      console.error(`Failed to upsert batch to Pinecone:`, error);
    }
  }
}

export async function retrieveContext(
  query: string,
  repoId: string,
  topK: number = 10
) {
  try {
    const embedding = await generateEmbedding(query);

    // First try querying for symbols
    let results = await pineconeIndex.query({
      vector: embedding,
      filter: { repoId, type: "symbol" },
      topK,
      includeMetadata: true,
    });

    // If no symbols found, query for any relevant files/chunks in this repo
    if (!results.matches || results.matches.length === 0) {
      results = await pineconeIndex.query({
        vector: embedding,
        filter: { repoId },
        topK,
        includeMetadata: true,
      });
    }

    return results.matches.map((match) => match.metadata).filter(Boolean);
  } catch (error) {
    console.warn(`Vector search failed for repo ${repoId}:`, error);
    return [];
  }
}
