import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface InitDatasetOptions {
  datasetName?: string;
  description?: string;
  overwrite?: boolean;
}

/**
 * Scaffolds a starter dataset JSON template on disk with sample queries and ground-truth patterns.
 */
export async function initDatasetFile(
  filePath: string,
  options?: InitDatasetOptions
): Promise<string> {
  const resolved = path.resolve(filePath);
  const exists = await fs
    .access(resolved)
    .then(() => true)
    .catch(() => false);

  if (exists && !options?.overwrite) {
    throw new Error(`File already exists at ${resolved}. Use overwrite: true to replace it.`);
  }

  const name =
    options?.datasetName ??
    path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, " ");

  const templateContent = {
    name,
    description:
      options?.description ??
      "Retrieval benchmark queries and expected ground truth targets for search evaluation.",
    cases: [
      {
        id: "case-1",
        query: "How do I configure OAuth in the workspace?",
        groundTruth: {
          relevantDocIds: ["doc_auth_101"],
          expectedPassages: ["Google OAuth 2.0 configuration"],
          referenceAnswer: "Add the Google Client ID and Client Secret in the environment settings.",
        },
        metadata: {
          category: "authentication",
          difficulty: "easy",
        },
      },
      {
        id: "case-2",
        query: "What is the policy for processing subscription refunds?",
        groundTruth: {
          relevantDocIds: ["billing_faq"],
          expectedPassages: ["Refunds are processed within 14 business days to original payment method."],
        },
        metadata: {
          category: "billing",
          difficulty: "medium",
        },
      },
      {
        id: "case-3",
        query: "How do vector embeddings work with pgvector?",
        groundTruth: {
          expectedPassages: ["cosine distance operator <=>", "vector(2048)"],
          referenceAnswer: "pgvector uses the <=> cosine distance operator to rank 2048-dimensional embeddings.",
        },
        metadata: {
          category: "technical",
          difficulty: "hard",
        },
      },
    ],
  };

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, JSON.stringify(templateContent, null, 2), "utf-8");
  return resolved;
}
