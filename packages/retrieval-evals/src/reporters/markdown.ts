import type { EvaluationReport } from "../types/results";

/**
 * Formats an evaluation report as a GitHub-flavored Markdown document.
 */
export function formatMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];

  lines.push(`# Retrieval Evaluation Report: ${report.datasetName}`);
  lines.push("");
  lines.push(`- **Total Queries Evaluated**: ${report.totalCases}`);
  lines.push(`- **Total Duration**: ${(report.durationMs / 1000).toFixed(2)} seconds`);
  lines.push("");
  lines.push("## Summary Metrics");
  lines.push("");
  lines.push("| Metric | Mean | Median | Min | Max | P95 |");
  lines.push("|---|---|---|---|---|---|");

  for (const summary of Object.values(report.summary)) {
    lines.push(
      `| **\`${summary.name}\`** | ${summary.mean.toFixed(4)} | ${summary.median.toFixed(4)} | ${summary.min.toFixed(4)} | ${summary.max.toFixed(4)} | ${summary.p95.toFixed(4)} |`
    );
  }

  lines.push("");
  lines.push("## Per-Query Breakdown");
  lines.push("");
  lines.push("| ID | Query | Retrieved | Key Metric Scores |");
  lines.push("|---|---|---|---|");

  for (const detail of report.details) {
    const scoreStrings = Object.entries(detail.scores)
      .map(([name, s]) => `${name}: ${s.score.toFixed(3)}`)
      .join(", ");

    const escapedQuery = detail.query.replace(/\|/g, "\\|");
    const errorSuffix = detail.error ? ` *(Error: ${detail.error})*` : "";

    lines.push(
      `| \`${detail.caseId}\` | ${escapedQuery}${errorSuffix} | ${detail.retrievedCount} | ${scoreStrings} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}
