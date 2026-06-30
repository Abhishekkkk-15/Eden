# Eden API Server — Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Server Startup & Lifecycle](#server-startup--lifecycle)
3. [Request Pipeline](#request-pipeline)
4. [Authentication](#authentication)
5. [Database Schema](#database-schema)
6. [AI Infrastructure](#ai-infrastructure)
7. [Queue System](#queue-system)
8. [Workers](#workers)
9. [Source Ingestion Pipeline](#source-ingestion-pipeline)
10. [RAG & Search System](#rag--search-system)
11. [WebSockets (Real-time)](#websockets-real-time)
12. [API Modules](#api-modules)
13. [Workflows Engine](#workflows-engine)
14. [Cloud Integrations](#cloud-integrations)
15. [Notion Agent](#notion-agent)

---

## Overview

Eden API Server is a Node.js/Express backend built on:

- **Express 5** — HTTP server
- **Drizzle ORM + PostgreSQL** — database
- **BullMQ + Redis** — background job queue
- **Socket.IO** — real-time updates to the browser
- **Groq** (`llama-3.3-70b-versatile`) — text generation, summarization, tagging
- **NVIDIA NIM** (`llama-3.2-11b-vision-instruct`) — image/video vision
- **NVIDIA NIM** (`nvidia/nv-embedqa-e5-v5`) — 1024-dim vector embeddings
- **pgvector** — semantic similarity search in Postgres
- **Cloudinary** — media file storage

All routes are prefixed with `/api`. The only public routes are `/api/health`, `/api/auth/*`, and cloud OAuth callbacks. Every other route requires a JWT.

---

## Server Startup & Lifecycle

**Entry point:** `src/index.ts`

On startup, four things run in sequence:

```
1. initEmbeddingExtension()   — ensures pgvector extension is loaded in Postgres
2. startJobQueueProcessor()   — starts the BullMQ AI job worker
3. startCloudImportProcessor() — starts the BullMQ cloud import worker
4. startNotionAgent()          — starts the Notion polling agent (setInterval)
5. httpServer.listen(PORT)     — starts accepting HTTP connections
6. initSocket(httpServer)      — attaches Socket.IO to the HTTP server
```

All four workers return a `stop()` function. These are called on `SIGINT`/`SIGTERM` for graceful shutdown.

**`initEmbeddingExtension`** runs a raw SQL `CREATE EXTENSION IF NOT EXISTS vector` and adds the `embedding vector(1024)` column to `source_chunks` if it doesn't exist. It sets a module-level `pgvectorEnabled = true` flag. If pgvector is unavailable (Postgres without the extension), the flag stays `false` and all semantic search calls are silently skipped — the server still works, just FTS-only.

---

## Request Pipeline

```
HTTP Request
    │
    ▼
app.ts (Express)
    ├── pino-http logger (request/response logging)
    ├── cors()
    ├── express.json() (50mb limit)
    ├── /media → static file serving (local uploads folder)
    └── /api → router.ts
                ├── /health (public)
                ├── /auth/* (public)
                ├── cloudIntegrationsRouter (public — OAuth callbacks)
                └── authenticate middleware (JWT check)
                        ├── /pages
                        ├── /blocks
                        ├── /sources
                        ├── /search
                        ├── /conversations
                        ├── /agents
                        ├── /dashboard
                        ├── /workflows
                        └── /settings
```

Global error handler at the bottom of `app.ts` catches all thrown errors. Zod validation errors return `400`, everything else returns `500`.

---

## Authentication

**File:** `src/middleware/auth.ts`

JWT-based. Token is signed with `JWT_SECRET` env var (7-day expiry).

**Flow:**
1. Client sends `Authorization: Bearer <token>` header
2. `authenticate` middleware verifies the JWT
3. Decoded `{ id, email }` is attached to `req.user`
4. All downstream handlers access the user via `(req as any).user`

**Token endpoints:**
- `POST /api/auth/login` — validates credentials, returns signed JWT
- `POST /api/auth/register` — creates user, returns signed JWT
- `POST /api/auth/google` — Google OAuth token exchange

Passwords are hashed with `bcryptjs`.

---

## Database Schema

All tables live in PostgreSQL. Drizzle ORM handles queries. The schema is defined in `packages/db/src/schema/`.

### `users`
Standard auth table: `id` (text/uuid), `email`, `password` (bcrypt hash), timestamps.

### `pages`
The single table for both **documents** and **folders**. The `kind` column distinguishes them.

```
pages
├── id          serial PK
├── user_id     → users.id
├── kind        "page" | "folder"
├── title
├── emoji
├── parent_id   → pages.id (null = root level)
├── position    integer (ordering)
└── timestamps
```

Nesting is a self-referencing `parent_id`. Folders have no content — their children are either more pages/folders (via `parent_id`) or sources (via `sources.parent_page_id`).

### `sources`
Uploaded files, URLs, YouTube videos, text snippets, images, audio, video.

```
sources
├── id               serial PK
├── user_id          → users.id
├── kind             "document" | "image" | "video" | "audio" | "youtube" | "url" | "text"
├── title
├── url              for web/YouTube sources
├── parent_page_id   → pages.id (which folder it lives in)
├── media_path       Cloudinary URL (for uploaded files)
├── media_mime_type
├── media_size_bytes
├── content          extracted text (full raw text)
├── summary          AI-generated 2-4 sentence summary
├── status           "processing" | "ready" | "failed"
└── timestamps
```

### `source_chunks`
Text chunks of a source, used for RAG and embedding.

```
source_chunks
├── id        serial PK
├── source_id → sources.id
├── position  integer (chunk order)
├── content   text (2000 chars per chunk, 250 overlap)
└── embedding vector(1024)   ← added at runtime by initEmbeddingExtension
```

Each source gets split into multiple chunks. Each chunk gets a 1024-dim embedding vector stored here. This column is added by `initEmbeddingExtension` at startup (not in the schema file — it's a raw ALTER TABLE).

### `transcriptions`
Whisper transcription output for audio/video sources.

```
transcriptions
├── id        serial PK
├── source_id → sources.id (UNIQUE)
├── content   full transcript text
└── model     "whisper-1"
```

### `video_frames`
Key frames extracted from video files for visual analysis.

```
video_frames
├── id            serial PK
├── source_id     → sources.id
├── timestamp     seconds from start
├── thumbnail_url Cloudinary URL
└── description   Vision AI description of the frame
```

### `conversations` + `messages`
Chat history.

```
conversations
├── id       serial PK
├── user_id  → users.id
├── title
└── agent_id → agents.id (optional, links to a custom agent)

messages
├── id               serial PK
├── conversation_id  → conversations.id
├── role             "user" | "assistant"
├── content          message text
├── context_items    jsonb  [{type, id, title}] — attached files/pages
└── citations        jsonb  [{kind, refId, title, snippet}] — what the AI sourced
```

### `agents`
Custom AI personas with their own system prompt.

```
agents
├── id       serial PK
├── user_id  → users.id
├── name
├── emoji
├── prompt   the system prompt
└── model    (stored but currently defaults to Groq llama)
```

### `workflows` + `workflow_runs`
Automation rules.

```
workflows
├── id              serial PK
├── user_id         → users.id
├── name, description, emoji
├── trigger_type    "source_created" | "scheduled" | "manual"
├── trigger_config  jsonb  e.g. { sourceKind: ["image"], folderId: 5 }
├── actions         jsonb  [{type, config}, ...]
├── is_active       boolean
├── run_count
└── last_run_at

workflow_runs
├── id                serial PK
├── workflow_id       → workflows.id
├── trigger_source_id → sources.id (what triggered it)
├── trigger_data      jsonb
├── status            "running" | "completed" | "failed" | "cancelled"
├── started_at, completed_at
└── action_results    jsonb  [{actionIndex, status, output, error}]
```

### `job_queue`
Persistent job tracking table (BullMQ is the transport, this table is the source of truth).

```
job_queue
├── id               serial PK
├── user_id          → users.id
├── job_type         "ingest_source" | "transcribe" | "analyze_video" | ...
├── entity_type      "source"
├── entity_id        → sources.id
├── payload          jsonb (job-specific data)
├── status           "pending" | "processing" | "completed" | "failed" | "cancelled"
├── priority         integer (higher = runs first)
├── progress         0–100
├── progress_message current step description
├── retry_count / max_retries
└── scheduled_at, started_at, completed_at
```

### `cloud_integrations`
OAuth connections to Dropbox, Google Drive, Notion.

```
cloud_integrations
├── id             serial PK
├── user_id        → users.id
├── provider       "dropbox" | "google_drive" | "notion"
├── access_token
├── refresh_token
├── is_active      boolean
├── sync_settings  jsonb  e.g. { autoSyncMeetingMinutes: true }
└── timestamps
```

### `source_tags`
Tags applied to sources (manually or by workflow).

```
source_tags
├── id         serial PK
├── source_id  → sources.id
├── tag        text (lowercase, normalized)
└── created_at
UNIQUE(source_id, tag)
```

---

## AI Infrastructure

**File:** `src/infrastructure/ai.ts`

Two AI providers are used, accessed via OpenAI-compatible SDKs:

### Provider 1: Groq (Text)
- **Model:** `llama-3.3-70b-versatile`
- **Used for:** all text tasks — chat, summarization, tagging, entity extraction, AI transforms
- **Config:** `AI_INTEGRATIONS_GROQ_API_KEY` env var
- **Max tokens:** 8192 per call by default

### Provider 2: NVIDIA NIM (Vision + Embeddings)
- **Vision model:** `meta/llama-3.2-11b-vision-instruct` — image and video frame analysis
- **Embedding model:** `nvidia/nv-embedqa-e5-v5` — 1024-dimension dense vectors
- **Config:** separate env vars in `@workspace/integrations-openai-ai-server`

### Exported Functions

| Function | Provider | Purpose |
|---|---|---|
| `completeText(system, user, maxTokens?)` | Groq | One-shot text completion |
| `streamChat(messages[])` | Groq | Streaming chat (async generator) |
| `summarize(text)` | Groq | 2-4 sentence summary, caps at 12k chars |
| `describeImageDataUrl(dataUrl)` | NVIDIA Vision | Full OCR + visual description of an image |
| `generateTags(text)` | Groq | Returns 3-6 comma-separated topic tags |
| `extractEntities(text, types[])` | Groq | Named entity extraction |
| `generateEmbedding(text)` | NVIDIA | Returns `number[]` of length 1024, caps at 8192 chars |
| `classifyContent(text, options[])` | Groq | Picks the best matching category from a list, returns null if <70% confident |

The Groq client is lazily initialized on first call and cached in a module-level variable.

---

## Queue System

**Files:** `src/infrastructure/queues.ts`, `src/infrastructure/redis.ts`

Two BullMQ queues backed by Redis:

```
Redis (REDIS_URL env var, default: localhost:6379)
    ├── Queue: "ai_job"           → AI processing (ingestion, transcription, etc.)
    └── Queue: "cloud_import"     → Cloud file downloads (Dropbox, GDrive, Notion)
```

Both queues use:
- **3 retry attempts** with exponential backoff (1s base)
- `removeOnComplete: true` (completed BullMQ jobs are cleaned from Redis)
- `removeOnFail: false` (failed jobs stay in Redis for inspection)

### How a job is created

`queueJob()` in `job-queue.ts` is the single function used to enqueue work:

1. Insert a row into `job_queue` table (persistent record in Postgres)
2. Add a BullMQ job to `aiJobQueue` with `{ jobId: <pg_row_id> }` as payload
3. Emit `job:created` socket event to the user

The BullMQ job is a thin envelope — it just carries the Postgres row ID. The actual job data lives in Postgres. This means if Redis dies, you don't lose job definitions.

### Job types

| `job_type` | What it does |
|---|---|
| `ingest_source` | Full pipeline: extract content → chunk → summarize → embed → trigger workflows |
| `transcribe` | Whisper transcription for audio/video |
| `analyze_video` | Extract key video frames → Vision AI descriptions |
| `analyze_image` | Vision AI description of an image |
| `extract_text` | (stub — marks complete immediately) |
| `generate_summary` | Regenerate summary for a source |
| `extract_entities` | Named entity extraction, appended to summary |
| `ai_transform` | Apply a custom AI prompt, output to title or summary |
| `import_url` | Fetch and extract HTML content from a URL |

---

## Workers

### 1. AI Job Worker — `src/workers/job-queue.ts`

BullMQ `Worker` listening on the `"ai_job"` queue.

**Concurrency:** `JOB_CONCURRENCY` env var (default 5). Up to 5 jobs process in parallel.

**Lifecycle per job:**
1. BullMQ fires the worker with `{ jobId: <number> }`
2. Worker fetches the job row from `job_queue` table, marks it `processing`
3. Dispatches to the appropriate handler function via `switch (job.jobType)`
4. Each handler calls `updateJobProgress(jobId, percent, message)` at checkpoints
   - This updates the DB row and emits `job:progress` socket event to the user
5. On success: marks DB row `completed`, emits `job:completed` socket event
6. On failure: marks DB row `failed`, emits `job:failed` socket event, re-throws so BullMQ handles retries

### 2. Cloud Import Worker — `src/workers/cloud-import.ts`

BullMQ `Worker` on the `"cloud_import"` queue. Handles files imported from Dropbox, Google Drive, and Notion.

**Max concurrent:** 3

**Lifecycle per item:**
1. Mark queue item `downloading`
2. Download the file buffer from the provider API
3. Create a source row in Postgres (`status: "processing"`)
4. Upload the buffer to Cloudinary → get back a URL → update source
5. If text content: chunk + embed immediately (inline, not via job queue)
6. Mark source `ready`, mark queue item `completed`
7. Queue AI jobs for non-text content (transcription, video analysis, image analysis)
8. Call `triggerWorkflows("source_created", ...)` to fire any matching workflow rules

**On startup:** scans for stuck items (`downloading`/`processing` status) and resets them to `pending` to recover from crashes.

**Provider-specific download logic:**
- **Dropbox:** `POST https://content.dropboxapi.com/2/files/download`
- **Google Drive:** `GET .../files/:id?alt=media` (or export for Google Workspace docs)
- **Notion:** Fetches page blocks via API and converts to Markdown-like text

### 3. Notion Research Agent — `src/workers/notion-agent.ts`

A `setInterval`-based polling worker (not BullMQ). Polls every **30 seconds**.

**Two responsibilities:**

**A) Autonomous Research Agent:**
Every 30s, queries all users' active Notion integrations looking for a database named `"Eden Research"`. For each row in that database where `Status` is `"Pending"` and no report exists yet:
1. Embeds the topic name → semantic search over `source_chunks`
2. Generates a research report from the top 8 matching chunks
3. Writes the report back to the Notion row and sets `Status = "Done"`

**B) Meeting Minutes Auto-Sync (`generateMeetingMinutes`):**
Called by the job queue worker after any audio/video transcription. If the user has Notion connected and `autoSyncMeetingMinutes = true` in their integration settings:
1. Generates AI meeting minutes from the transcript
2. Finds or creates a `"Meeting Notes"` database in Notion
3. Creates a new page with the title, date, and minutes as blocks

---

## Source Ingestion Pipeline

This is the most important flow — what happens when a user uploads a file.

### Trigger: Upload via browser

1. Browser calls `POST /api/uploads/sign` → gets Cloudinary signature
2. Browser uploads file **directly** to Cloudinary via XHR (no file data passes through the API server)
3. Browser calls `POST /api/sources` with the Cloudinary URL and metadata

### `POST /api/sources` (sources.routes.ts)

Creates a source row with `status: "processing"`, then calls `queueJob("ingest_source", ...)`.

### `ingest_source` job (job-queue.ts)

This is the full pipeline, running as a background job:

```
Step 1  (10%)  Prepare
               ├── Fetch source row from DB
               └── For audio/image: kick off transcription in parallel (non-blocking)

Step 2  (20%)  Extract content
               ├── url      → fetchUrl() — fetch page HTML, strip tags
               ├── youtube  → extractYouTubeContent() — get transcript + metadata
               ├── image    → fetchBufferFromUrl() → describeImageDataUrl() (NVIDIA Vision)
               ├── video    → fetchBufferFromUrl() → extractVideoContent() (Groq)
               └── audio    → fetchBufferFromUrl() → extractVideoContent() (Groq)

Step 3  (50%)  chunkText(content, 2000, 250)
               Split raw text into overlapping 2000-char chunks.
               Natural boundaries (paragraph breaks, sentence ends) are preferred cut points.

Step 4  (65%)  summarize(content)     [Groq]
               Generate 2-4 sentence summary of full content.

Step 5  (80%)  Save to DB (transaction)
               ├── UPDATE sources SET content, summary, status = "ready"
               └── INSERT source_chunks (position + content for each chunk)

Step 6  (80%)  Emit socket events
               └── source:updated, job:completed → browser refreshes source card

Step 7  (async, non-blocking)  Generate embeddings
               For each chunk:
               ├── generateEmbedding(chunk)  [NVIDIA]
               └── UPDATE source_chunks SET embedding = vector WHERE position = i

Step 8  (async)  triggerWorkflows("source_created", sourceId, userId, { kind, parentPageId })
               Check if any active workflow's trigger matches this source and fire them.
```

Steps 7 and 8 run with `void` — they don't block the job completion. The browser is told the source is ready at step 6, while embeddings and workflow firing happen in the background.

### Content extraction details

| Kind | How content is extracted |
|---|---|
| `text` | Already in `source.content`, no extraction needed |
| `url` | `fetchUrl()` — HTTP GET → strip HTML tags → markdown via `node-html-markdown` |
| `youtube` | `extractYouTubeContent()` — `youtube-transcript` library pulls caption tracks |
| `image` | Base64 encode → `describeImageDataUrl()` → NVIDIA Vision model outputs OCR + description |
| `audio` | Read buffer → Groq Whisper transcription → full transcript as content |
| `video` | Read buffer → Groq audio transcription → also spawns a `generateMeetingMinutes` call |

---

## RAG & Search System

**File:** `src/infrastructure/rag.ts`

RAG = Retrieval Augmented Generation. When the user sends a chat message, relevant workspace content is retrieved and injected into the AI's system prompt.

### `searchWorkspace(userId, query, limit=12)` — Hybrid Search

Combines two search strategies:

**Strategy 1: Full-Text Search (FTS)**

Runs 4 SQL queries in parallel using PostgreSQL `tsvector` / `tsquery`:

```
pageRows    → searches page titles + emoji
blockRows   → searches block content (text inside notes)
sourceRows  → searches source titles + summaries
chunkRows   → searches source chunk content
```

Each query uses:
- `ts_rank` — relevance score
- `ts_headline` — generates a highlighted snippet

Falls back from `websearch_to_tsquery` (smarter, handles quotes/OR) to `plainto_tsquery` (simpler) if no results.

**Strategy 2: Semantic Search (vector)**

If `pgvectorEnabled`:
1. Embed the query with NVIDIA → 1024-dim vector
2. `SELECT ... ORDER BY embedding <=> queryVector LIMIT N`
3. `<=>` is pgvector cosine distance (lower = more similar)

**Combining: Reciprocal Rank Fusion (RRF)**

Merges the two ranked lists using the formula `score = 1 / (60 + rank)`. Items appearing in both lists get both scores added together, naturally rising to the top. The constant `60` prevents the #1 result from dominating completely.

### `buildRagContext(userId, query)` — RAG Context Builder

Takes search hits, fetches full content (not just snippets), and assembles the context block for the AI:

```
For each hit:
├── block   → fetch full block content from DB
├── chunk   → fetch full chunk content from DB
├── source  → use source.summary or first 1200 chars of content
└── page    → fetch all blocks in the page (or buildFolderInventoryText for folders)

Output:
[Page "Meeting Notes"]
...full content...

---

[Source "budget.pdf"]
...full content...
```

Also de-duplicates citations so the same source isn't cited twice.

### `buildContextFromSelection(userId, items[])` — Pinned Context

Used when the user manually attaches a file or folder to the chat. No search — just directly loads the full content of what the user selected:
- `source` → fetch chunks (up to 48), join them in order, cap at 14k chars
- `page` → fetch all blocks, cap at 14k chars
- `folder` → call `buildFolderInventoryText` (one level deep, max 20 files)

### `buildFolderInventoryText(folderId, userId, folderTitle)` — Folder Summary

Since folders have no text content, this builds a human-readable description:
- Queries `pagesTable` for sub-folders and documents (`parentId = folderId`)
- Queries `sourcesTable` for uploaded files (`parentPageId = folderId`)
- Builds a text list like:
  ```
  Folder "Work" contains:
  - Subfolder: 📁 Projects
  - Document: Meeting Notes
  - File: budget.pdf (pdf) — Q3 revenue was...
  ```
- **Limitation:** Only one level deep. Nested sub-folder contents are not included.

### `chunkText(text, chunkSize=2000, overlap=250)`

Splits text into overlapping chunks:
1. Scan forward `chunkSize` chars from current position
2. Try to snap the cut point to a natural boundary (`\n\n` paragraph or `. ` sentence end) if it's past 50% of the chunk
3. Next chunk starts at `cut - overlap`, ensuring continuity across chunks

---

## WebSockets (Real-time)

**File:** `src/infrastructure/socket.ts`

Socket.IO server attached to the same HTTP server.

**Room strategy:** each user joins a room named `user:<userId>` on connect. The `userId` is passed as a query param: `ws://server?userId=<id>`.

**`emitToUser(userId, event, data)`** — the single function used everywhere to push events. Called from workers, job handlers, import processor.

### Events emitted by the server

| Event | Payload | When |
|---|---|---|
| `job:created` | `{ id, jobType, ... }` | When a job is added to the queue |
| `job:progress` | `{ jobId, progress, message }` | At each processing checkpoint |
| `job:completed` | `{ jobId }` | When any job finishes |
| `job:failed` | `{ jobId, error }` | When a job fails after retries |
| `source:updated` | `{ sourceId, status, title }` | When a source finishes ingestion |
| `import:status` | `{ itemId, status, sourceId? }` | Cloud import progress |

---

## API Modules

### Sources (`/api/sources`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/sources` | List sources. With `?parentId=`: paginated folder contents. Without: full flat list. |
| `GET` | `/sources/folder-counts` | Returns `{ [folderId]: count }` for all folders (lightweight) |
| `GET` | `/sources/:id` | Get a single source with tags and chunk count |
| `POST` | `/sources` | Create source record + enqueue `ingest_source` job |
| `PATCH` | `/sources/:id` | Update title, parentPageId, etc. |
| `DELETE` | `/sources/:id` | Delete source + chunks + Cloudinary file |
| `POST` | `/uploads/sign` | Get Cloudinary upload signature (for direct browser upload) |

### Pages (`/api/pages`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/pages` | List all pages+folders for user |
| `POST` | `/pages` | Create page or folder (`kind: "page"` or `"folder"`) |
| `GET` | `/pages/:id` | Get page with its blocks |
| `PATCH` | `/pages/:id` | Update title, emoji, parentId, position. Has cycle-detection for folders. |
| `DELETE` | `/pages/:id` | Delete page + all descendant pages + their sources + Cloudinary files |

Deletion is recursive: it collects all descendant IDs using a tree walk, then bulk-deletes everything.

### Blocks (`/api/blocks`)

Blocks are text segments inside a page (like Notion blocks).

| Method | Path | Description |
|---|---|---|
| `GET` | `/blocks?pageId=` | List blocks for a page |
| `POST` | `/blocks` | Create a block |
| `PATCH` | `/blocks/:id` | Update block content |
| `DELETE` | `/blocks/:id` | Delete a block |
| `POST` | `/blocks/reorder` | Bulk update positions |

### Chat (`/api/conversations`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/conversations` | List all conversations (with message count) |
| `POST` | `/conversations` | Create conversation |
| `GET` | `/conversations/:id` | Get conversation with full message history |
| `DELETE` | `/conversations/:id` | Delete conversation + messages |
| `POST` | `/conversations/:id/messages` | **Send message — streams SSE response** |
| `POST` | `/chat/stream` | Stateless streaming (no conversation saved) |
| `POST` | `/chat/complete` | Stateless non-streaming |

**Message flow for `POST /conversations/:id/messages`:**

```
1. Save user message to DB
2. If first message + default title: rename conversation to first message text
3. Set SSE headers, start streaming
4. Build context:
   ├── contextItems present → buildContextFromSelection() (user attached specific files)
   └── no contextItems      → buildRagContext() (auto-search workspace)
5. Send { citations } event to client
6. Build system prompt:
   ├── agent.prompt (if conversation has a custom agent)
   ├── repurpose system (if chatMode = "repurpose")
   ├── pinned system (if contextItems were attached)
   └── default system prompt
7. Inject context into system prompt
8. Stream from Groq via streamChat() → send { content: delta } events per chunk
9. Save assembled assistant message to DB
10. Send { done: true, citations } event
```

The client receives Server-Sent Events (SSE). Each line is a JSON object.

### Agents (`/api/agents`)

Custom AI personas. CRUD only — no AI calls here.

| Method | Path | Description |
|---|---|---|
| `GET` | `/agents` | List all agents |
| `POST` | `/agents` | Create agent (name, emoji, prompt, model) |
| `PATCH` | `/agents/:id` | Update agent |
| `DELETE` | `/agents/:id` | Delete agent |

Agents are linked to conversations via `conversations.agent_id`. When a conversation has an agent, its `prompt` replaces the default system prompt.

### Search (`/api/search`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/search?q=` | Hybrid search across pages, blocks, sources, chunks |

Calls `searchWorkspace()` directly and returns `RagHit[]` with `{ kind, refId, title, snippet, score }`.

### Dashboard (`/api/dashboard`)

Returns aggregate stats for the user's workspace: source count by kind, recent activity, storage used, etc.

### Settings (`/api/settings`)

User preferences and integration settings (email provider config, etc.).

### Jobs (`/api/jobs`)

Exposed via the workflows router:

| Method | Path | Description |
|---|---|---|
| `GET` | `/jobs` | List all jobs for user |
| `POST` | `/jobs/:id/cancel` | Mark job as cancelled |
| `DELETE` | `/jobs/clear` | Delete all completed/failed/cancelled jobs |
| `POST` | `/jobs/:id/retry` | Reset failed job to pending |

---

## Workflows Engine

**File:** `src/modules/workflows/workflows.routes.ts`

Workflows are automation rules: **trigger** → **actions**.

### Supported Triggers

| Trigger | When it fires |
|---|---|
| `source_created` | Automatically when a new source finishes ingestion |
| `manual` | Only when user explicitly clicks "Run Now" |
| `scheduled` | Intended for cron-based firing *(not yet implemented)* |

### Supported Actions

| Action | What it does |
|---|---|
| `tag` | Apply a fixed list of tags to the source |
| `generate_tags` | Ask Groq to analyze content and auto-generate tags |
| `move_to_folder` | Move source to a specified folder |
| `ai_organize` | Ask Groq to classify content and auto-move to the best matching folder |
| `summarize` | Queue a `generate_summary` job |
| `transcribe` | Queue a `transcribe` job |
| `extract_entities` | Queue an `extract_entities` job |
| `send_notification` | Send toast or email notification |
| `webhook` | HTTP POST/GET to an external URL |
| `ai_transform` | Apply a custom AI prompt to the source |
| `ai_agent_process` | Run a custom agent against the source content |

### `triggerWorkflows(triggerType, sourceId, userId, sourceData)`

Called by the job queue worker and cloud import worker after every source is created. Finds all active workflows matching:
1. `trigger_type = "source_created"`
2. `user_id = userId`
3. `is_active = true`

Then for each matching workflow, checks `triggerConfig`:
- `sourceKind` — must include the source's `kind` (image, video, etc.)
- `folderId` — source must be in this specific folder
- `anyFolder` — match regardless of folder

If all conditions pass, creates a `workflow_runs` row and calls `executeWorkflow()`.

### `executeWorkflow(workflow, runId, userId)`

Runs actions sequentially. Stops on first failure. For each action, calls the corresponding executor function (e.g. `executeTagAction`, `executeMoveAction`). Results are saved to `workflow_runs.action_results`. Updates `workflows.run_count` and `last_run_at` on success.

The key mechanism: before executing, the `sourceId` is injected into every action's config (`config.sourceId = sourceId`). This is how action executors know which source to operate on.

### Manual Trigger

`POST /workflows/:id/run` with optional `{ sourceId }` in the body. Executes the workflow immediately. If no `sourceId`, actions that require one (tag, move, etc.) will fail.

### Folder Agent Assignment

Special convenience API for assigning an AI agent to a folder:
- `POST /workflows/folder-agent/:folderId` — creates/updates a `source_created` workflow that runs `ai_agent_process` on every new file in the folder
- `GET /workflows/folder-agent/:folderId` — returns the assigned agent
- `DELETE /workflows/folder-agent/:folderId` — removes the workflow

---

## Cloud Integrations

**File:** `src/modules/integrations/cloud-integrations.routes.ts`

OAuth 2.0 flows for Dropbox, Google Drive, and Notion. These routes are **public** (no JWT required) because they handle OAuth callbacks from third-party services.

Flow:
1. User clicks "Connect Dropbox" → frontend opens OAuth URL
2. Provider redirects to `/api/integrations/:provider/callback?code=...`
3. Server exchanges code for access+refresh tokens
4. Stores in `cloud_integrations` table
5. Redirects browser back to the settings page

After connecting, the user can browse their cloud files and queue imports. The queue item is added to `cloud_import_queue`, and the `startCloudImportProcessor` worker picks it up.

---

## Notion Agent

**File:** `src/workers/notion-agent.ts`

A fully autonomous agent that polls every **30 seconds** and processes two things:

### 1. Eden Research Database
Looks for a Notion database named `"Eden Research"` in the user's workspace. Rows in this database are research tasks:
- Column: `Name` or `Topic` — the topic to research
- Column: `Status` — workflow state (`Pending` → `Analyzing...` → `Done`)
- Column: `Eden Report` — where the AI writes its findings

The agent does **semantic search** over the user's own sources to answer each research topic. It only uses `source_chunks` with embeddings — so sources that haven't been embedded won't appear in research results.

### 2. Meeting Minutes Auto-Sync
When any audio or video is transcribed:
1. Checks if user has Notion connected and `autoSyncMeetingMinutes` enabled
2. Generates AI meeting minutes from the transcript (Groq)
3. Finds or creates a `"Meeting Notes"` database in Notion
4. Creates a new page with the meeting title, date, and minutes text

Note: Notion properties are dynamically detected — the agent scans for `title`, `date`, and `rich_text` columns by name and type, rather than assuming fixed column names.
