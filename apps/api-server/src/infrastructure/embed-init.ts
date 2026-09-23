import { pool } from "@workspace/db";

export let pgvectorEnabled = false;

export async function initEmbeddingExtension(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      DO $$
      DECLARE
        col_dim integer;
      BEGIN
        SELECT atttypmod INTO col_dim
        FROM pg_attribute
        WHERE attrelid = 'source_chunks'::regclass AND attname = 'embedding';

        IF col_dim IS NULL THEN
          ALTER TABLE source_chunks ADD COLUMN embedding vector(2048);
        ELSIF col_dim != 2048 THEN
          ALTER TABLE source_chunks ALTER COLUMN embedding TYPE vector(2048) USING NULL;
        END IF;
      END $$;
    `);
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
