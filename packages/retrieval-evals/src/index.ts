/**
 * @workspace/retrieval-evals
 *
 * A modular, standalone retrieval evaluation harness for TypeScript & Node.js.
 * Evaluates Information Retrieval (IR) and Semantic RAG metrics against any pluggable retriever.
 */

// Core Contracts & Types
export * from "./types";

// Dataset Loaders & Schemas
export * from "./dataset";

// Evaluation Metrics (Traditional IR & Semantic)
export * from "./metrics";

// Execution Runner & Aggregator
export * from "./runner";

// Reporting & Formatters
export * from "./reporters";
