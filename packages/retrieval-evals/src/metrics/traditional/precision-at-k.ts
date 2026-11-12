import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import { isItemRelevant } from "./helpers";

export interface PrecisionAtKOptions {
  k?: number;
  name?: string;
}

/**
 * Precision @ K: Ratio of relevant retrieved documents among the top K results.
 * Score = (relevant items in top K) / K
 */
export function precisionAtK(k = 5, options?: Omit<PrecisionAtKOptions, "k">): Metric {
  const metricName = options?.name ?? `precision@${k}`;

  return {
    name: metricName,
    description: `Fraction of top ${k} retrieved items that are relevant`,
    evaluate(context: MetricContext): MetricResult {
      const { queryCase, retrieved } = context;
      if (k <= 0) {
        return { score: 0, explanation: "k must be greater than 0" };
      }

      const topK = retrieved.slice(0, k);
      let relevantCount = 0;

      for (const item of topK) {
        if (isItemRelevant(item, queryCase.groundTruth)) {
          relevantCount++;
        }
      }

      const score = relevantCount / k;
      return {
        score,
        explanation: `${relevantCount} out of top ${k} retrieved items are relevant`,
        metadata: { relevantCount, k },
      };
    },
  };
}
