import type { EvaluationDataset, QueryCase } from "../types/dataset";
import type { RetrieverFn } from "../types/retriever";
import type { Metric } from "../types/metric";
import type { AIClient } from "../types/client";
import type { EvaluationReport, QueryEvaluationResult, QueryMetricScore } from "../types/results";
import { createAsyncPool } from "./pool";
import { aggregateResults } from "./aggregator";

export interface RunProgress {
  completed: number;
  total: number;
  currentCase: QueryCase;
}

export interface RunRetrievalEvalOptions {
  dataset: EvaluationDataset;
  retriever: RetrieverFn;
  metrics: Metric[];
  aiClient?: AIClient;
  concurrency?: number;
  k?: number;
  onProgress?: (progress: RunProgress) => void;
}

/**
 * Executes a retrieval evaluation over an evaluation dataset against a retriever function.
 */
export async function runRetrievalEval(options: RunRetrievalEvalOptions): Promise<EvaluationReport> {
  const { dataset, retriever, metrics, aiClient, concurrency = 4, k, onProgress } = options;
  const startTime = Date.now();
  const pool = createAsyncPool(concurrency);
  let completed = 0;

  const tasks = dataset.cases.map((queryCase) => {
    return pool(async (): Promise<QueryEvaluationResult> => {
      try {
        const retrieved = await retriever(queryCase.query, { k });
        const scores: Record<string, QueryMetricScore> = {};

        for (const metric of metrics) {
          try {
            const result = await metric.evaluate({
              queryCase,
              retrieved,
              aiClient,
            });
            scores[metric.name] = {
              name: metric.name,
              score: result.score,
              explanation: result.explanation,
              metadata: result.metadata,
            };
          } catch (metricErr) {
            scores[metric.name] = {
              name: metric.name,
              score: 0,
              explanation: `Error in metric evaluation: ${
                metricErr instanceof Error ? metricErr.message : String(metricErr)
              }`,
            };
          }
        }

        completed++;
        if (onProgress) {
          onProgress({ completed, total: dataset.cases.length, currentCase: queryCase });
        }

        return {
          caseId: queryCase.id,
          query: queryCase.query,
          retrievedCount: retrieved.length,
          scores,
        };
      } catch (retrieverErr) {
        completed++;
        if (onProgress) {
          onProgress({ completed, total: dataset.cases.length, currentCase: queryCase });
        }

        const scores: Record<string, QueryMetricScore> = {};
        for (const metric of metrics) {
          scores[metric.name] = {
            name: metric.name,
            score: 0,
            explanation: "Retrieval failed for this case",
          };
        }

        return {
          caseId: queryCase.id,
          query: queryCase.query,
          retrievedCount: 0,
          scores,
          error: retrieverErr instanceof Error ? retrieverErr.message : String(retrieverErr),
        };
      }
    });
  });

  const details = await Promise.all(tasks);
  const durationMs = Date.now() - startTime;
  const summary = aggregateResults(details);

  return {
    datasetName: dataset.name,
    totalCases: dataset.cases.length,
    durationMs,
    summary,
    details,
  };
}
