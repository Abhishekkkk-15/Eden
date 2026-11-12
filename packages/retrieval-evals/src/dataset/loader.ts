import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { EvaluationDataset, QueryCase } from "../types/dataset";
import { EvaluationDatasetSchema, QueryCaseSchema } from "./schema";

/**
 * Validates and normalizes an in-memory dataset object.
 */
export function loadDataset(raw: unknown): EvaluationDataset {
  const parsed = EvaluationDatasetSchema.parse(raw);
  return parsed as EvaluationDataset;
}

/**
 * Helper to construct an evaluation dataset programmatically with validation.
 */
export function createDataset(
  name: string,
  cases: QueryCase[],
  description?: string
): EvaluationDataset {
  return loadDataset({
    name,
    description,
    cases,
  });
}

/**
 * Loads and validates an evaluation dataset from a JSON file.
 */
export async function loadDatasetFromJson(filePath: string): Promise<EvaluationDataset> {
  const resolved = path.resolve(filePath);
  const fileContent = await fs.readFile(resolved, "utf-8");
  const parsed = JSON.parse(fileContent);
  return loadDataset(parsed);
}

/**
 * Loads and validates an evaluation dataset from a JSONL file (one query case per line).
 */
export async function loadDatasetFromJsonl(
  filePath: string,
  datasetName?: string,
  description?: string
): Promise<EvaluationDataset> {
  const resolved = path.resolve(filePath);
  const fileContent = await fs.readFile(resolved, "utf-8");
  const lines = fileContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const cases: QueryCase[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    try {
      const parsedLine = JSON.parse(lines[idx]);
      const validatedCase = QueryCaseSchema.parse(parsedLine);
      cases.push(validatedCase as QueryCase);
    } catch (err) {
      throw new Error(
        `Failed to parse JSONL line ${idx + 1} in ${filePath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const name = datasetName ?? path.basename(filePath, path.extname(filePath));
  return loadDataset({
    name,
    description,
    cases,
  });
}
