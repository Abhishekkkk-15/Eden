/**
 * Dataset and Query Case contracts for Retrieval Evaluation.
 */

export interface GroundTruth {
  /** Known expected document, source, or chunk IDs (exact match target) */
  relevantDocIds?: Array<string | number>;
  /** Key text passages, keywords, or facts that must be present in retrieved context */
  expectedPassages?: string[];
  /** Reference answer or ideal answer used for semantic fact verification */
  referenceAnswer?: string;
  [key: string]: unknown;
}

export interface QueryCase {
  id: string | number;
  query: string;
  groundTruth: GroundTruth;
  metadata?: Record<string, unknown>;
}

export interface EvaluationDataset {
  name: string;
  description?: string;
  cases: QueryCase[];
}

export type DataSetLoader = (source: unknown) => Promise<EvaluationDataset> | EvaluationDataset;
