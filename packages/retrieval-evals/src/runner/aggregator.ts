import type { MetricSummary, QueryEvaluationResult } from "../types/results";

function round(val: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

/**
 * Aggregates per-query metric results into overall statistical summary.
 */
export function aggregateResults(results: QueryEvaluationResult[]): Record<string, MetricSummary> {
  const metricValues: Record<string, number[]> = {};

  for (const r of results) {
    for (const [metricName, scoreObj] of Object.entries(r.scores)) {
      if (!metricValues[metricName]) {
        metricValues[metricName] = [];
      }
      metricValues[metricName].push(scoreObj.score);
    }
  }

  const summary: Record<string, MetricSummary> = {};

  for (const [name, values] of Object.entries(metricValues)) {
    if (values.length === 0) continue;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = sum / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median =
      sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const p95 = percentile(sorted, 95);

    summary[name] = {
      name,
      count: values.length,
      mean: round(mean),
      median: round(median),
      min: round(min),
      max: round(max),
      p95: round(p95),
    };
  }

  return summary;
}
