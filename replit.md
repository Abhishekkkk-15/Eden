# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Eden AI Workspace

Production-grade Notion-style workspace with AI chat (RAG) inspired by eden.so.

### Artifacts

- `artifacts/api-server` — Express 5 backend (port from PORT env, mounted at `/api`)
- `artifacts/eden` — React + Vite frontend (mounted at `/`, sage green palette)
- `artifacts/mockup-sandbox` — design exploration server

### Backend routes (`artifacts/api-server/src/routes/`)

- `pages` — CRUD pages with parent/position
- `blocks` — CRUD blocks (text, heading1/2/3, todo, bulleted, numbered, quote, code, divider) + reorder
- `sources` — CRUD sources (kind: text|url), background ingestion (URL fetch, chunking, AI summary)
- `search` — Postgres full-text search (`websearch_to_tsquery` + GIN indexes) across pages, blocks, sources, source_chunks
- `chat` — conversations + SSE streaming messages with RAG-grounded responses and persisted citations
- `agents` — CRUD agents + `/run` endpoint with optional workspace context
- `dashboard` — counts and recent activity

### AI

- Replit AI Integration (OpenAI), model `gpt-5.4`, `max_completion_tokens: 8192`
- `artifacts/api-server/src/lib/ai.ts` — wraps `openai.chat.completions.create` with `streamChat`, `completeText`, `summarize`
- `artifacts/api-server/src/lib/rag.ts` — `searchWorkspace`, `buildRagContext` (full-text rather than vector embeddings — embeddings not supported by Replit AI integration)
- Citations are persisted on assistant messages (jsonb) and link back to pages or sources.

### Frontend (`artifacts/eden/src/`)

- `pages/home.tsx` — dashboard with quick actions, recent activity, counts
- `pages/pages/[id].tsx` — block editor with slash menu, contentEditable, drag handle popover, debounced autosave
- `pages/sources/index.tsx`, `[id].tsx` — sources list, detail with chunks
- `pages/search.tsx` — workspace search with snippets
- `pages/chat/index.tsx`, `[id].tsx` — conversation list + SSE streaming chat with citation chips
- `pages/agents/index.tsx`, `[id].tsx` — agent gallery + edit/run panel
- `components/layout/app-layout.tsx` — sidebar with page tree, top nav
- `components/command-palette.tsx` — Cmd/Ctrl+K palette (cmdk)

### DB schema (`lib/db/src/schema/`)

- `pages` (id, title, emoji, parentId, position, timestamps)
- `blocks` (id, pageId, type, content, checked, position, timestamps)
- `sources` (id, kind, title, url, content, summary, status, timestamps)
- `source_chunks` (id, sourceId, position, content)
- `conversations` (id, title, agentId, timestamps)
- `messages` (id, conversationId, role, content, citations jsonb)
- `agents` (id, name, description, emoji, prompt, timestamps)

GIN indexes on `to_tsvector('english', ...)` for FTS on pages.title, blocks.content, sources.title/content, source_chunks.content.

### Key design decisions

- Used Postgres FTS instead of pgvector — Replit's OpenAI integration does not expose embeddings.
- Block editor uses contentEditable + a slash-menu popover (not a heavy framework).
- Chat uses SSE rather than the generated `useSendMessage` hook so we can stream tokens.
- Source ingestion is fire-and-forget after the 201 response (status: processing → ready).
