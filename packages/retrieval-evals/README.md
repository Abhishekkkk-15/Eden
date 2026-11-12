# Retrieval Evaluations (`@workspace/retrieval-evals`)

A modular, zero-workspace-coupled Retrieval Evaluation framework designed for testing and benchmarking search systems, vector databases, and RAG retrieval pipelines.

---

## 🚀 Features

- **Decoupled Architecture**: Zero internal dependencies on databases or web frameworks. Copy or import into any TypeScript / Node.js project.
- **Pluggable Retrievers**: Compatible with any search function `(query, { k }) => Promise<RetrievalResultItem[]>`. Works with PostgreSQL `pgvector`, Pinecone, Qdrant, Chroma, Weaviate, Elasticsearch, or hybrid search.
- **OpenAI-Compatible `AIClient`**: Drop in an official `openai` SDK instance, Groq, NVIDIA NIM, Azure OpenAI, Ollama, or vLLM for embeddings and LLM-as-a-judge scoring.
- **Metrics Included**:
  - **Traditional IR**:
    - **`mrr(opts)`**: Mean Reciprocal Rank (1 / rank of first relevant doc).
    - **`hitRate(k, opts)`**: Hit Rate @ K (binary check for relevant items).
    - **`precisionAtK(k, opts)`**: Precision @ K (fraction of top K that are relevant).
    - **`recallAtK(k, opts)`**: Recall @ K (fraction of all expected ground-truth facts retrieved).
  - **Semantic & LLM**:
    - **`semanticSimilarity(opts)`**: Cosine similarity between query and retrieved chunks using vector embeddings.
    - **`contextRelevance(opts)`**: LLM judge evaluates signal vs. noise ratio.
    - **`contextRecall(opts)`**: LLM judge checks if the ground-truth facts can be answered from the retrieved context.
- **Built-in Runner & Reporters**:
  - Asynchronous task pool with concurrency control.
  - Statistical summary aggregation: count, mean, median, min, max, p95.
  - Console ASCII table, Markdown report, and JSON exporters.

---

## 📦 Usage in Another Project (Standalone)

```typescript
import {
  runRetrievalEval,
  loadDataset,
  mrr,
  hitRate,
  precisionAtK,
  contextRelevance,
  formatConsoleTable,
} from "@workspace/retrieval-evals";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const dataset = loadDataset({
  name: "Documentation Search Benchmark",
  cases: [
    {
      id: "q1",
      query: "How do I configure OAuth in the workspace?",
      groundTruth: {
        relevantDocIds: ["doc_auth_101"],
        expectedPassages: ["Google OAuth 2.0 configuration"],
        referenceAnswer: "Configure client ID and client secret in the .env file.",
      },
    },
  ],
});

const report = await runRetrievalEval({
  dataset,
  retriever: async (query, { k = 5 }) => {
    // Call your vector DB / search engine
    const results = await myCustomSearch(query, k);
    return results.map((r) => ({
      id: r.id,
      content: r.text,
      score: r.score,
    }));
  },
  metrics: [
    mrr(),
    hitRate(5),
    precisionAtK(5),
    contextRelevance({ aiClient: client, model: "gpt-4o-mini" }),
  ],
  concurrency: 4,
});

console.log(formatConsoleTable(report));
```

---

## 🧪 Usage in Eden

```typescript
import { searchWorkspace } from "apps/api-server/src/infrastructure/rag";
import {
  runRetrievalEval,
  createDataset,
  mrr,
  hitRate,
  precisionAtK,
  formatMarkdownReport,
} from "@workspace/retrieval-evals";

const dataset = createDataset("Eden Search Benchmark", [
  {
    id: 1,
    query: "Q3 revenue projections",
    groundTruth: { expectedPassages: ["revenue increased 18% YoY"] },
  },
]);

const report = await runRetrievalEval({
  dataset,
  retriever: async (query, { k = 10 }) => {
    const hits = await searchWorkspace("user-id", query, { limit: k, includeContent: true });
    return hits.map((h) => ({
      id: `${h.kind}:${h.refId}`,
      content: h.content || h.snippet,
      score: h.score,
    }));
  },
  metrics: [mrr(), hitRate(5), precisionAtK(5)],
});

console.log(formatMarkdownReport(report));
```
