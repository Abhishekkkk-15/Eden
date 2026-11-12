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
  timestamp: string;
  totalCases: number;
  durationMs: number;
  summary: Record<string, MetricSummary>;
  details: QueryEvaluationResult[];
  metadata?: Record<string, unknown>;
}

export interface MetricDelta {
  name: string;
  baselineMean: number;
  candidateMean: number;
  delta: number;
  percentChange: number;
  status: "improved" | "regressed" | "unchanged";
}

export interface QueryDelta {
  caseId: string | number;
  query: string;
  metricName: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
  status: "improved" | "regressed" | "unchanged";
}

export interface ComparisonReport {
  baselineName: string;
  candidateName: string;
  timestamp: string;
  metrics: Record<string, MetricDelta>;
  regressions: QueryDelta[];
  improvements: QueryDelta[];
}

export interface SaveReportOptions {
  outputDir?: string;
  filename?: string;
  formats?: Array<"json" | "markdown">;
}

export interface SavedReportPaths {
  jsonPath?: string;
  markdownPath?: string;
}
