import type {
  ComparisonReport,
  EvaluationReport,
  MetricDelta,
  QueryDelta,
} from "../types/results.js";

function round(val: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export interface CompareReportsOptions {
  regressionThreshold?: number; // Score difference threshold to flag (default: 0.05)
  baselineName?: string;
  candidateName?: string;
}

/**
 * Compares two evaluation reports (e.g. baseline vs candidate, or FTS vs Hybrid)
 * and computes metric deltas, percentage changes, and per-query regressions/improvements.
 */
export function compareEvaluationReports(
  baseline: EvaluationReport,
  candidate: EvaluationReport,
  options?: CompareReportsOptions
): ComparisonReport {
  const threshold = options?.regressionThreshold ?? 0.05;
  const baselineName = options?.baselineName ?? `${baseline.datasetName} (Baseline)`;
  const candidateName = options?.candidateName ?? `${candidate.datasetName} (Candidate)`;

  // Metric-level deltas
  const metricDeltas: Record<string, MetricDelta> = {};
  const allMetricNames = new Set([
    ...Object.keys(baseline.summary),
    ...Object.keys(candidate.summary),
  ]);

  for (const name of allMetricNames) {
    const bSummary = baseline.summary[name];
    const cSummary = candidate.summary[name];

    const baselineMean = bSummary?.mean ?? 0;
    const candidateMean = cSummary?.mean ?? 0;
    const delta = round(candidateMean - baselineMean);

    let percentChange = 0;
    if (baselineMean !== 0) {
      percentChange = round((delta / baselineMean) * 100, 2);
    } else if (candidateMean > 0) {
      percentChange = 100.0;
    }

    let status: "improved" | "regressed" | "unchanged" = "unchanged";
    if (delta > 0.0001) status = "improved";
    else if (delta < -0.0001) status = "regressed";

    metricDeltas[name] = {
      name,
      baselineMean,
      candidateMean,
      delta,
      percentChange,
      status,
    };
  }

  // Query-level deltas
  const baselineCases = new Map(baseline.details.map((d) => [String(d.caseId), d]));
  const regressions: QueryDelta[] = [];
  const improvements: QueryDelta[] = [];

  for (const cCase of candidate.details) {
    const bCase = baselineCases.get(String(cCase.caseId));
    if (!bCase) continue;

    const queryMetricNames = new Set([
      ...Object.keys(bCase.scores),
      ...Object.keys(cCase.scores),
    ]);

    for (const mName of queryMetricNames) {
      const bScore = bCase.scores[mName]?.score ?? 0;
      const cScore = cCase.scores[mName]?.score ?? 0;
      const scoreDelta = round(cScore - bScore);

      if (scoreDelta <= -threshold) {
        regressions.push({
          caseId: cCase.caseId,
          query: cCase.query,
          metricName: mName,
          baselineScore: bScore,
          candidateScore: cScore,
          delta: scoreDelta,
          status: "regressed",
        });
      } else if (scoreDelta >= threshold) {
        improvements.push({
          caseId: cCase.caseId,
          query: cCase.query,
          metricName: mName,
          baselineScore: bScore,
          candidateScore: cScore,
          delta: scoreDelta,
          status: "improved",
        });
      }
    }
  }

  // Sort regressions: worst first (most negative delta)
  regressions.sort((a, b) => a.delta - b.delta);
  // Sort improvements: best first (most positive delta)
  improvements.sort((a, b) => b.delta - a.delta);

  return {
    baselineName,
    candidateName,
    timestamp: new Date().toISOString(),
    metrics: metricDeltas,
    regressions,
    improvements,
  };
}
