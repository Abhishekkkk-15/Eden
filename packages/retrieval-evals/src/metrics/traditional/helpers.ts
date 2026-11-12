import type { RetrievalResultItem } from "../../types/retriever.js";
import type { GroundTruth } from "../../types/dataset.js";

/**
 * Checks whether a retrieved item matches ground truth relevance criteria.
 * Matches either:
 * 1. By ID: `item.id` matches any `groundTruth.relevantDocIds` (strict or stringified)
 * 2. By text content: any `groundTruth.expectedPassages` is present in `item.content`
 */
export function isItemRelevant(item: RetrievalResultItem, groundTruth: GroundTruth): boolean {
  // Check ID match
  if (item.id !== undefined && groundTruth.relevantDocIds && groundTruth.relevantDocIds.length > 0) {
    const itemIdStr = String(item.id);
    const idMatch = groundTruth.relevantDocIds.some((expectedId) => String(expectedId) === itemIdStr);
    if (idMatch) return true;
  }

  // Check passage / keyword match in retrieved content
  if (item.content && groundTruth.expectedPassages && groundTruth.expectedPassages.length > 0) {
    const contentLower = item.content.toLowerCase();
    const passageMatch = groundTruth.expectedPassages.some((passage) =>
      contentLower.includes(passage.toLowerCase())
    );
    if (passageMatch) return true;
  }

  return false;
}
