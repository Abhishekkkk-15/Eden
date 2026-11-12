/**
 * Generic Retrieval contracts.
 * Pluggable across Eden search, Pinecone, Qdrant, Chroma, Weaviate, Elasticsearch, etc.
 */

export interface RetrievalResultItem {
  id?: string | number;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrieverOptions {
  k?: number;
  filter?: Record<string, unknown>;
  [key: string]: unknown;
}

export type RetrieverFn = (
  query: string,
  options?: RetrieverOptions
) => Promise<RetrievalResultItem[]>;
