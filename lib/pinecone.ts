import { Pinecone } from "@pinecone-database/pinecone";

const apiKey = process.env.PINECOIN_DB_API_KEY || process.env.PINECONE_API_KEY;

if (!apiKey) {
  console.warn(
    "⚠️  PINECOIN_DB_API_KEY is not set. Pinecone vector search will fail."
  );
}

export const pinecone = new Pinecone({
  apiKey: apiKey || "missing-key",
});

const indexName = (process.env.PINECONE_INDEX || "repopilot-v2").toLowerCase();

export const pineconeIndex = pinecone.index(indexName);
