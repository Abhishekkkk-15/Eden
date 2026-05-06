# Implementation Plan - Semantic Search & Autonomous Folder Agents

This plan outlines the implementation of two major features: Semantic Search for intent-based discovery and Autonomous Agents for automated folder-level file processing.

## User Review Required

> [!IMPORTANT]
> **Database Extension**: Enabling `pgvector` requires superuser privileges on the PostgreSQL instance. Please confirm if the Neon database environment supports this extension (most do by default).

> [!WARNING]
> **Embedding Costs**: Semantic search requires generating embeddings for all existing and new content. While NVIDIA NIM is currently configured, we should monitor API usage as we scale the document count.

## Proposed Changes

### [Database]
We need to enable vector support and add embedding columns to our core content tables.

#### [MODIFY] [schema/sources.ts](file:///d:/eden/artifacts/api-server/node_modules/@workspace/db/src/schema/sources.ts)
- Add `embedding` column to `source_chunks` table (type: `vector(1024)` or `vector(1536)` depending on model).
- Add `embedding` column to `sources` table for title/summary semantic indexing.

#### [MODIFY] [schema/blocks.ts](file:///d:/eden/artifacts/api-server/node_modules/@workspace/db/src/schema/blocks.ts)
- Add `embedding` column to `blocks` table to support document-level semantic search.

---

### [Backend]
We will integrate embedding generation into the ingestion pipeline and update the search logic.

#### [MODIFY] [lib/ai.ts](file:///d:/eden/artifacts/api-server/src/lib/ai.ts)
- Implement `generateEmbedding(text: string)` using NVIDIA NIM embedding models (e.g., `nvidia/nv-embedqa-e5-v5`).
- Add support for batch embedding generation for efficiency.

#### [MODIFY] [lib/rag.ts](file:///d:/eden/artifacts/api-server/src/lib/rag.ts)
- Update `searchWorkspace` to perform a hybrid search:
  1. Semantic Search using vector similarity (cosine distance).
  2. Full-Text Search (current implementation).
  3. Re-rank results using Reciprocal Rank Fusion (RRF).

#### [NEW] [lib/agents/folder-agent-processor.ts](file:///d:/eden/artifacts/api-server/src/lib/agents/folder-agent-processor.ts)
- Create a handler for the new `ai_agent_process` workflow action.
- This will load the agent's prompt, context (folder info), and the source content to perform autonomous tasks.

#### [MODIFY] [routes/workflows.ts](file:///d:/eden/artifacts/api-server/src/routes/workflows.ts)
- Add `ai_agent_process` to the supported workflow actions.

---

### [Frontend]
Update the UI to expose these new capabilities.

#### [MODIFY] [components/search/search-bar.tsx](file:///d:/eden/artifacts/eden/src/components/search/search-bar.tsx)
- Add a "Semantic Search" toggle or visual indicator.
- Update result display to show "Relevance" percentages.

#### [MODIFY] [pages/sources/index.tsx](file:///d:/eden/artifacts/eden/src/pages/sources/index.tsx)
- Add "Assign Agent" option to the folder context menu and header.
- Show "Active Agent" badges on folders.

#### [NEW] [components/agents/assign-agent-dialog.tsx](file:///d:/eden/artifacts/eden/src/components/agents/assign-agent-dialog.tsx)
- A dialog to select an agent and create a folder-scoped workflow automatically.

## Verification Plan

### Automated Tests
- `npm run test:embeddings`: Verify embedding generation and vector similarity math.
- `npm run test:workflows`: Trigger a "Source Created" event in a watched folder and verify the agent's output is saved as a summary/tags.

### Manual Verification
- **Semantic Search**: Search for "financial documents" and verify that files with keywords like "invoice", "receipt", and "budget" appear high in the results even if "financial" isn't in the text.
- **Folder Agents**: Drop a file into a "Legal" folder and watch the AI agent automatically extract clauses and tag it as #Contract.
