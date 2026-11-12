import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ComparisonReport,
  EvaluationReport,
  SaveReportOptions,
  SavedReportPaths,
} from "../types/results";
import { formatMarkdownReport } from "./markdown";
import { formatComparisonMarkdown } from "./comparison-markdown";
import { formatJsonReport } from "./json";

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");
}

function getTimestampSlug(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Saves an EvaluationReport to disk as JSON, Markdown, or both.
 * Automatically creates the output directory if it does not exist.
 */
export async function saveEvaluationReport(
  report: EvaluationReport,
  options?: SaveReportOptions
): Promise<SavedReportPaths> {
  const outputDir = path.resolve(options?.outputDir ?? "./eval-reports");
  await fs.mkdir(outputDir, { recursive: true });

  const formats = options?.formats ?? ["json", "markdown"];
  const baseName =
    options?.filename ?? `${sanitizeFilename(report.datasetName)}_${getTimestampSlug(report.timestamp)}`;

  const savedPaths: SavedReportPaths = {};

  if (formats.includes("json")) {
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    await fs.writeFile(jsonPath, formatJsonReport(report), "utf-8");
    savedPaths.jsonPath = jsonPath;
  }

  if (formats.includes("markdown")) {
    const mdPath = path.join(outputDir, `${baseName}.md`);
    await fs.writeFile(mdPath, formatMarkdownReport(report), "utf-8");
    savedPaths.markdownPath = mdPath;
  }

  return savedPaths;
}

/**
 * Saves a ComparisonReport to disk as JSON, Markdown, or both.
 */
export async function saveComparisonReport(
  comparison: ComparisonReport,
  options?: SaveReportOptions
): Promise<SavedReportPaths> {
  const outputDir = path.resolve(options?.outputDir ?? "./eval-reports");
  await fs.mkdir(outputDir, { recursive: true });

  const formats = options?.formats ?? ["json", "markdown"];
  const baseName =
    options?.filename ??
    `comparison_${sanitizeFilename(comparison.candidateName)}_${getTimestampSlug(comparison.timestamp)}`;

  const savedPaths: SavedReportPaths = {};

  if (formats.includes("json")) {
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(comparison, null, 2), "utf-8");
    savedPaths.jsonPath = jsonPath;
  }

  if (formats.includes("markdown")) {
    const mdPath = path.join(outputDir, `${baseName}.md`);
    await fs.writeFile(mdPath, formatComparisonMarkdown(comparison), "utf-8");
    savedPaths.markdownPath = mdPath;
  }

  return savedPaths;
}

/**
 * Loads a previously saved EvaluationReport from a JSON file.
 */
export async function loadEvaluationReportFromJson(filePath: string): Promise<EvaluationReport> {
  const resolved = path.resolve(filePath);
  const raw = await fs.readFile(resolved, "utf-8");
  return JSON.parse(raw) as EvaluationReport;
}

/**
 * Loads a previously saved ComparisonReport from a JSON file.
 */
export async function loadComparisonReportFromJson(filePath: string): Promise<ComparisonReport> {
  const resolved = path.resolve(filePath);
  const raw = await fs.readFile(resolved, "utf-8");
  return JSON.parse(raw) as ComparisonReport;
}
