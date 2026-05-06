import { pool } from "@workspace/db";

export let pgvectorEnabled = false;

export async function initEmbeddingExtension(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(
      "ALTER TABLE source_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024)"
    );
    pgvectorEnabled = true;
    console.log("[EmbedInit] pgvector ready — semantic search enabled");
  } catch (err) {
    console.warn(
      "[EmbedInit] pgvector unavailable, falling back to FTS-only search:",
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    client.release();
  }
}
