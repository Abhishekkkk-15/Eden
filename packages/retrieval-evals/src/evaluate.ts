import type { EvaluationDataset } from "./types/dataset";
import type { RetrieverFn } from "./types/retriever";
import type { AIClient } from "./types/client";
import type { Metric } from "./types/metric";
import type {
  ComparisonReport,
  EvaluationReport,
  SaveReportOptions,
  SavedReportPaths,
} from "./types/results";
import { loadDataset, loadDatasetFromJson, loadDatasetFromJsonl } from "./dataset/loader";
import { resolveMetrics, type MetricPresetName, type PresetOptions } from "./metrics/presets";
import { runRetrievalEval, type RunProgress } from "./runner/runner";
import { compareEvaluationReports } from "./runner/comparator";
import { formatConsoleTable } from "./reporters/console";
import { formatMarkdownReport } from "./reporters/markdown";
import { formatComparisonMarkdown } from "./reporters/comparison-markdown";
import {
  saveEvaluationReport,
  saveComparisonReport,
  loadEvaluationReportFromJson,
} from "./reporters/storage";

export interface EvaluateOptions {
  /**
   * Dataset to evaluate:
   * - A file path string (`"./dataset.json"` or `"./queries.jsonl"`)
   * - Or a pre-loaded EvaluationDataset object
   */
  dataset: string | EvaluationDataset;

  /**
   * The retriever function being tested:
   * `(query: string, options?: { k?: number }) => Promise<RetrievalResultItem[]>`
   */
  retriever: RetrieverFn;

  /**
   * Metrics to run:
   * - A preset name: `"standard"` (default), `"semantic"`, or `"all"`
   * - Or an array of custom Metric instances
   */
  metrics?: MetricPresetName | Metric[];

  /**
   * Optional OpenAI-compatible client for semantic similarity or LLM judge metrics.
   * Can be shared for both or split into embeddingClient and chatClient below.
   */
  aiClient?: AIClient;

  /**
   * Optional dedicated AIClient for embedding generation.
   */
  embeddingClient?: AIClient;

  /**
   * Optional dedicated AIClient for chat completions (LLM judge).
   */
  chatClient?: AIClient;

  /**
   * Top-K candidates to request from retriever (default: 5).
   */
  k?: number;

  /**
   * Max concurrent retrieval queries (default: 4).
   */
  concurrency?: number;

  /**
   * Embedding model name (for semantic similarity metric).
   */
  embeddingModel?: string;

  /**
   * Chat model name (for LLM-as-a-judge metrics).
   */
  chatModel?: string;

  /**
   * Output formatting to terminal:
   * - `true` or `"table"`: prints formatted ASCII table
   * - `"markdown"`: prints markdown formatted report
   * - `false`: suppresses console output
   * Default: `true`.
   */
  print?: boolean | "table" | "markdown";

  /**
   * Auto-save report to disk:
   * - `true`: saves both .json and .md to `./eval-reports`
   * - `SaveReportOptions`: custom directory, filename, formats
   * Default: `false`.
   */
  save?: boolean | SaveReportOptions;

  /**
   * Optional baseline report to automatically compare against:
   * - File path string (`"./eval-reports/baseline.json"`)
   * - Or loaded EvaluationReport object
   */
  compareWith?: string | EvaluationReport;

  /**
   * Score delta threshold to flag regressions in comparison (default: 0.05).
   */
  regressionThreshold?: number;

  /**
   * Optional metadata to attach to the report (e.g. git commit, model version, notes).
   */
  metadata?: Record<string, unknown>;

  /**
   * Progress callback fired after each query finishes.
   */
  onProgress?: (progress: RunProgress) => void;
}

export interface EvaluateResult {
  report: EvaluationReport;
  comparison?: ComparisonReport;
  savedPaths?: SavedReportPaths;
  savedComparisonPaths?: SavedReportPaths;
}

/**
 * High-level, zero-boilerplate entrypoint for running retrieval evaluations.
 * Automatically loads datasets, resolves metric presets, runs evaluations,
 * prints clean summaries, saves to disk, and runs A/B comparisons.
 */
export async function evaluate(options: EvaluateOptions): Promise<EvaluateResult> {
  const {
    dataset: datasetInput,
    retriever,
    metrics: metricsInput,
    aiClient,
    embeddingClient,
    chatClient,
    k = 5,
    concurrency = 4,
    embeddingModel,
    chatModel,
    print = true,
    save = false,
    compareWith,
    regressionThreshold = 0.05,
    metadata,
    onProgress,
  } = options;

  // 1. Resolve Dataset
  let dataset: EvaluationDataset;
  if (typeof datasetInput === "string") {
    if (datasetInput.endsWith(".jsonl")) {
      dataset = await loadDatasetFromJsonl(datasetInput);
    } else {
      dataset = await loadDatasetFromJson(datasetInput);
    }
  } else {
    dataset = loadDataset(datasetInput);
  }

  // 2. Resolve Metrics
  const presetOptions: PresetOptions = {
    k,
    aiClient,
    embeddingClient,
    chatClient,
    embeddingModel,
    chatModel,
  };
  const metrics = resolveMetrics(metricsInput, presetOptions);

  // 3. Execute Evaluation
  const report = await runRetrievalEval({
    dataset,
    retriever,
    metrics,
    aiClient,
    concurrency,
    k,
    metadata,
    onProgress,
  });

  // 4. Print Results to Terminal
  if (print === true || print === "table") {
    console.log(formatConsoleTable(report));
  } else if (print === "markdown") {
    console.log(formatMarkdownReport(report));
  }

  // 5. Save Results to Disk
  let savedPaths: SavedReportPaths | undefined;
  if (save) {
    const saveOpts = typeof save === "object" ? save : { outputDir: "./eval-reports" };
    savedPaths = await saveEvaluationReport(report, saveOpts);
  }

  // 6. Optional Comparison with Baseline
  let comparison: ComparisonReport | undefined;
  let savedComparisonPaths: SavedReportPaths | undefined;
  if (compareWith) {
    let baselineReport: EvaluationReport;
    if (typeof compareWith === "string") {
      baselineReport = await loadEvaluationReportFromJson(compareWith);
    } else {
      baselineReport = compareWith;
    }

    comparison = compareEvaluationReports(baselineReport, report, {
      regressionThreshold,
    });

    if (print) {
      console.log("\n" + formatComparisonMarkdown(comparison));
    }

    if (save) {
      const saveOpts = typeof save === "object" ? save : { outputDir: "./eval-reports" };
      savedComparisonPaths = await saveComparisonReport(comparison, saveOpts);
    }
  }

  return {
    report,
    comparison,
    savedPaths,
    savedComparisonPaths,
  };
}
