import type { QueryCase } from "./dataset";
import type { RetrievalResultItem } from "./retriever";
import type { AIClient } from "./client";

export interface MetricContext {
  queryCase: QueryCase;
  retrieved: RetrievalResultItem[];
  aiClient?: AIClient;
}

export interface MetricResult {
  score: number; // Normalized to 0.0 - 1.0 range
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export interface Metric {
  name: string;
  description: string;
  evaluate(context: MetricContext): Promise<MetricResult> | MetricResult;
}
