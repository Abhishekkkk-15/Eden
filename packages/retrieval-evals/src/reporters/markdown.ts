import type { EvaluationReport } from "../types/results";

/**
 * Formats an evaluation report as a clean, highly-navigable GitHub-flavored Markdown document.
 */
export function formatMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];

  lines.push(`# Retrieval Evaluation Report: ${report.datasetName}`);
  lines.push("");
  lines.push(`- **Evaluated At**: ${report.timestamp ? new Date(report.timestamp).toLocaleString() : new Date().toLocaleString()}`);
  lines.push(`- **Total Queries**: ${report.totalCases}`);
  lines.push(`- **Execution Duration**: ${(report.durationMs / 1000).toFixed(2)} seconds`);

  if (report.metadata && Object.keys(report.metadata).length > 0) {
    const metaParts = Object.entries(report.metadata).map(
      ([k, v]) => `\`${k}\`: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`
    );
    lines.push(`- **Metadata**: ${metaParts.join(" | ")}`);
  }

  lines.push("");

  // Summary Metrics Table
  lines.push("## Summary Metrics");
  lines.push("");
  lines.push("| Metric | Mean | Median | Min | Max | P95 | Rating |");
  lines.push("|---|---|---|---|---|---|:---:|");

  for (const summary of Object.values(report.summary)) {
    const rating =
      summary.mean >= 0.8
        ? "🟢 High"
        : summary.mean >= 0.5
        ? "🟡 Medium"
        : "🔴 Low";

    lines.push(
      `| **\`${summary.name}\`** | ${summary.mean.toFixed(4)} | ${summary.median.toFixed(4)} | ${summary.min.toFixed(4)} | ${summary.max.toFixed(4)} | ${summary.p95.toFixed(4)} | ${rating} |`
    );
  }

  lines.push("");

  // Triage: Queries with Low Scores (< 0.5 on any metric)
  const lowScoringCases = report.details.filter((detail) =>
    Object.values(detail.scores).some((s) => s.score < 0.5)
  );

  if (lowScoringCases.length > 0) {
    lines.push(`## ⚠️ Attention Required: Low-Scoring Queries (${lowScoringCases.length})`);
    lines.push("");
    lines.push("These queries scored below `0.50` on one or more metrics and may indicate retrieval gaps:");
    lines.push("");
    lines.push("| ID | Query | Lowest Metric | Score | Reason / Explanation |");
    lines.push("|---|---|---|---|---|");

    for (const d of lowScoringCases) {
      const sortedScores = Object.values(d.scores).sort((a, b) => a.score - b.score);
      const lowest = sortedScores[0];
      const escapedQuery = d.query.replace(/\|/g, "\\|");
      const explanation = (lowest?.explanation ?? "No explanation").replace(/\|/g, "\\|");

      lines.push(
        `| \`${d.caseId}\` | ${escapedQuery} | \`${lowest?.name}\` | **${lowest?.score.toFixed(3)}** | ${explanation} |`
      );
    }
    lines.push("");
  }

  // Full Collapsible Query Drilldown for Easy Navigation
  lines.push("## Per-Query Results");
  lines.push("");
  lines.push("<details>");
  lines.push("<summary><b>Click to expand full query-by-query breakdown</b></summary>");
  lines.push("");
  lines.push("| ID | Query | Retrieved | Scores |");
  lines.push("|---|---|---|---|");

  for (const detail of report.details) {
    const scoreStrings = Object.entries(detail.scores)
      .map(([name, s]) => `${name}: ${s.score.toFixed(3)}`)
      .join("<br/>");

    const escapedQuery = detail.query.replace(/\|/g, "\\|");
    const errorSuffix = detail.error ? ` <br/>*(Error: ${detail.error})*` : "";

    lines.push(
      `| \`${detail.caseId}\` | ${escapedQuery}${errorSuffix} | ${detail.retrievedCount} | ${scoreStrings} |`
    );
  }

  lines.push("");
  lines.push("</details>");
  lines.push("");

  return lines.join("\n");
}
