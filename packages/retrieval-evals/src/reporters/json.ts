import type { EvaluationReport } from "../types/results.js";

/**
 * Formats an evaluation report as a pretty-printed JSON string.
 */
export function formatJsonReport(report: EvaluationReport, space = 2): string {
  return JSON.stringify(report, null, space);
}
