/**
 * @workspace/retrieval-evals
 *
 * A modular, standalone retrieval evaluation harness for TypeScript & Node.js.
 * Evaluates Information Retrieval (IR) and Semantic RAG metrics against any pluggable retriever.
 */

// Core Contracts & Types
export * from "./types/index.js";

// Zero-dependency AI Client Factory
export * from "./client/create-client.js";

// Dataset Loaders & Schemas
export * from "./dataset/index.js";

// Evaluation Metrics (Traditional IR & Semantic)
export * from "./metrics/index.js";

// Execution Runner & Aggregator
export * from "./runner/index.js";

// Reporting & Formatters
export * from "./reporters/index.js";

// High-Level All-In-One API
export * from "./evaluate.js";

// Rate-Limit Retry Utilities
export * from "./utils/retry.js";
