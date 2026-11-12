export interface QueryMetricScore {
  name: string;
  score: number;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export interface QueryEvaluationResult {
  caseId: string | number;
  query: string;
  retrievedCount: number;
  scores: Record<string, QueryMetricScore>;
  error?: string;
}

export interface MetricSummary {
  name: string;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p95: number;
}

export interface EvaluationReport {
  datasetName: string;
  totalCases: number;
  durationMs: number;
  summary: Record<string, MetricSummary>;
  details: QueryEvaluationResult[];
}
