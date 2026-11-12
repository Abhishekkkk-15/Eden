import type { EvaluationReport } from "../types/results.js";

/**
 * Formats an evaluation report as a clean ASCII table for the terminal.
 */
export function formatConsoleTable(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push("================================================================================");
  lines.push(` RETRIEVAL EVALUATION REPORT: ${report.datasetName.toUpperCase()}`);
  lines.push(` Total Cases: ${report.totalCases} | Duration: ${(report.durationMs / 1000).toFixed(2)}s`);
  lines.push("================================================================================");

  // Table Header
  const colMetric = "Metric".padEnd(25);
  const colMean = "Mean".padStart(10);
  const colMedian = "Median".padStart(10);
  const colMin = "Min".padStart(10);
  const colMax = "Max".padStart(10);
  const colP95 = "P95".padStart(10);

  lines.push(`${colMetric} | ${colMean} | ${colMedian} | ${colMin} | ${colMax} | ${colP95}`);
  lines.push("-".repeat(84));

  for (const summary of Object.values(report.summary)) {
    const name = summary.name.padEnd(25);
    const mean = summary.mean.toFixed(4).padStart(10);
    const median = summary.median.toFixed(4).padStart(10);
    const min = summary.min.toFixed(4).padStart(10);
    const max = summary.max.toFixed(4).padStart(10);
    const p95 = summary.p95.toFixed(4).padStart(10);

    lines.push(`${name} | ${mean} | ${median} | ${min} | ${max} | ${p95}`);
  }

  lines.push("================================================================================");
  return lines.join("\n");
}
