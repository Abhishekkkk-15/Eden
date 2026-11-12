import { z } from "zod";

export const GroundTruthSchema = z.object({
  relevantDocIds: z.array(z.union([z.string(), z.number()])).optional(),
  expectedPassages: z.array(z.string()).optional(),
  referenceAnswer: z.string().optional(),
}).passthrough();

export const QueryCaseSchema = z.object({
  id: z.union([z.string(), z.number()]),
  query: z.string().min(1, "Query cannot be empty"),
  groundTruth: GroundTruthSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const EvaluationDatasetSchema = z.object({
  name: z.string().min(1, "Dataset name is required"),
  description: z.string().optional(),
  cases: z.array(QueryCaseSchema).min(1, "Dataset must contain at least 1 case"),
});

export type GroundTruthInput = z.infer<typeof GroundTruthSchema>;
export type QueryCaseInput = z.infer<typeof QueryCaseSchema>;
export type EvaluationDatasetInput = z.infer<typeof EvaluationDatasetSchema>;
