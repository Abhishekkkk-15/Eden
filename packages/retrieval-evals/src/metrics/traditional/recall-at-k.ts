import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import { isItemRelevant } from "./helpers";

export interface RecallAtKOptions {
  k?: number;
  name?: string;
}

/**
 * Recall @ K: Fraction of all known relevant documents that were successfully retrieved in top K.
 * Score = (relevant items retrieved in top K) / (total relevant items defined in ground truth)
 */
export function recallAtK(k = 5, options?: Omit<RecallAtKOptions, "k">): Metric {
  const metricName = options?.name ?? `recall@${k}`;

  return {
    name: metricName,
    description: `Fraction of all ground-truth relevant items retrieved in top ${k}`,
    evaluate(context: MetricContext): MetricResult {
      const { queryCase, retrieved } = context;
      const { groundTruth } = queryCase;

      // Total expected relevant items count
      const expectedDocCount = groundTruth.relevantDocIds?.length ?? 0;
      const expectedPassageCount = groundTruth.expectedPassages?.length ?? 0;
      const totalExpected = Math.max(expectedDocCount, expectedPassageCount);

      if (totalExpected === 0) {
        // Fall back: if no explicit ground-truth count, hit rate logic applies
        const hasRelevant = retrieved.slice(0, k).some((item) => isItemRelevant(item, groundTruth));
        return {
          score: hasRelevant ? 1.0 : 0.0,
          explanation: hasRelevant
            ? "At least one relevant item retrieved (no expected count specified)"
            : "No relevant items retrieved",
        };
      }

      const topK = retrieved.slice(0, k);
      let relevantCount = 0;

      for (const item of topK) {
        if (isItemRelevant(item, groundTruth)) {
          relevantCount++;
        }
      }

      const score = Math.min(1.0, relevantCount / totalExpected);
      return {
        score,
        explanation: `${relevantCount} out of ${totalExpected} expected relevant items retrieved in top ${k}`,
        metadata: { relevantCount, totalExpected, k },
      };
    },
  };
}
