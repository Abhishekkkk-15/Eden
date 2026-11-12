import type { ComparisonReport } from "../types/results.js";

/**
 * Formats a ComparisonReport as a beautiful, actionable GitHub-flavored Markdown document.
 */
export function formatComparisonMarkdown(comparison: ComparisonReport): string {
  const lines: string[] = [];

  lines.push(`# Retrieval Comparison Report`);
  lines.push("");
  lines.push(`- **Baseline Run**: \`${comparison.baselineName}\``);
  lines.push(`- **Candidate Run**: \`${comparison.candidateName}\``);
  lines.push(`- **Generated At**: ${new Date(comparison.timestamp).toLocaleString()}`);
  lines.push("");

  // Executive Metric Diff Table
  lines.push("## Metric Comparison Overview");
  lines.push("");
  lines.push("| Metric | Baseline Mean | Candidate Mean | Delta (Δ) | % Change | Status |");
  lines.push("|---|---|---|---|---|---|");

  for (const m of Object.values(comparison.metrics)) {
    const deltaSign = m.delta > 0 ? "+" : "";
    const pctSign = m.percentChange > 0 ? "+" : "";
    const statusBadge =
      m.status === "improved"
        ? "🟢 Improved"
        : m.status === "regressed"
        ? "🔴 Regressed"
        : "⚪ Unchanged";

    lines.push(
      `| **\`${m.name}\`** | ${m.baselineMean.toFixed(4)} | ${m.candidateMean.toFixed(4)} | ${deltaSign}${m.delta.toFixed(4)} | ${pctSign}${m.percentChange.toFixed(2)}% | ${statusBadge} |`
    );
  }

  lines.push("");

  // Regressions Section
  if (comparison.regressions.length > 0) {
    lines.push("## ⚠️ Detected Regressions");
    lines.push("");
    lines.push(
      `Found **${comparison.regressions.length}** query scores that performed significantly worse in the candidate run:`
    );
    lines.push("");
    lines.push("| Case ID | Metric | Baseline | Candidate | Delta (Δ) | Query |");
    lines.push("|---|---|---|---|---|---|");

    for (const r of comparison.regressions) {
      const escapedQuery = r.query.replace(/\|/g, "\\|");
      lines.push(
        `| \`${r.caseId}\` | \`${r.metricName}\` | ${r.baselineScore.toFixed(3)} | ${r.candidateScore.toFixed(3)} | **${r.delta.toFixed(3)}** | ${escapedQuery} |`
      );
    }
    lines.push("");
  } else {
    lines.push("## 🟢 No Regressions Detected");
    lines.push("All query scores in the candidate run performed at or above the baseline threshold.");
    lines.push("");
  }

  // Improvements Section
  if (comparison.improvements.length > 0) {
    lines.push("## 🚀 Key Improvements");
    lines.push("");
    lines.push(
      `Found **${comparison.improvements.length}** query scores that performed significantly better in the candidate run:`
    );
    lines.push("");
    lines.push("| Case ID | Metric | Baseline | Candidate | Delta (Δ) | Query |");
    lines.push("|---|---|---|---|---|---|");

    for (const imp of comparison.improvements) {
      const escapedQuery = imp.query.replace(/\|/g, "\\|");
      lines.push(
        `| \`${imp.caseId}\` | \`${imp.metricName}\` | ${imp.baselineScore.toFixed(3)} | ${imp.candidateScore.toFixed(3)} | **+${imp.delta.toFixed(3)}** | ${escapedQuery} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
