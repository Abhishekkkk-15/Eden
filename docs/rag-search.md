# RAG Search System — Complete Documentation

**File:** `apps/api-server/src/infrastructure/rag.ts`

---

## What is RAG?

RAG stands for **Retrieval Augmented Generation**. The idea is simple:

- The AI model (Groq/llama) doesn't know what's in your workspace
- Before asking the AI a question, we first **search** the workspace for relevant content
- We inject that content into the AI's prompt as context
- The AI answers using both its own knowledge and your specific content

Without RAG, asking "what did the budget meeting say?" would get a generic response. With RAG, the AI actually finds your meeting recording chunks and answers from them.

---

## The Two Search Strategies

The system uses two completely different ways to find content. They run together and their results are merged.

---

### Strategy 1: Full-Text Search (FTS)

**What it is:** Classic keyword matching inside PostgreSQL using `tsvector` and `tsquery`.

**How it works:**
PostgreSQL converts text into a list of normalized word stems (`tsvector`), then checks if the query words (`tsquery`) appear in that list.

For example:
- Text: `"The quarterly budget was reviewed"`
- tsvector: `'budget':4 'quarterli':2 'review':6`
- Query: `"budget review"` → matches ✓

**Four tables are searched in parallel:**

```
1. pages       → page/folder titles
2. blocks      → paragraph content inside notes/documents
3. sources     → source titles + summaries
4. source_chunks → individual content chunks of uploaded files
```

Each query produces two values per row:
- **`ts_rank`** — a relevance score (higher = better match)
- **`ts_headline`** — a highlighted snippet showing where the match was found

**Two modes with automatic fallback:**

```
First try: websearch_to_tsquery("budget review")
           → smarter, handles "exact phrases", OR, -exclusions like Google

If zero results:
Second try: plainto_tsquery("budget review")
           → dumber but more forgiving, just matches all words
```

The fallback exists because `websearch_to_tsquery` is strict — if your query has an unusual word or typo, it returns nothing. `plainto_tsquery` is more lenient.

---

### Strategy 2: Semantic Search (Vector)

**What it is:** Math-based similarity search using embeddings stored in pgvector.

**How it works:**

Every chunk of content was converted into a 1024-number vector (embedding) when it was uploaded. These numbers represent the *meaning* of the text in mathematical space. Texts with similar meaning have vectors that point in similar directions.

When you search:
1. Your query is also converted to a 1024-number vector using NVIDIA's embedding model
2. PostgreSQL computes the distance between your query vector and every stored chunk vector
3. The closest ones are returned

**The distance operator:** `<=>` is pgvector's cosine distance. Lower value = more similar.

```sql
SELECT c.content,
       1 - (c.embedding <=> '[0.12, -0.34, ...]'::vector) AS similarity
FROM source_chunks c
WHERE s.user_id = $userId
  AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> '[0.12, -0.34, ...]'::vector
LIMIT 24
```

The `1 - distance` converts distance into similarity (higher = better match).

**Why this matters over FTS:**

FTS only finds what you literally typed. Semantic search finds what you *meant*.

| Query | FTS finds | Semantic finds |
|---|---|---|
| "dog photos" | Files with "dog" or "photos" in text | Files about pets, animals, vacation pics |
| "Q3 revenue" | Only "Q3" and "revenue" mentions | Budget docs, financial reports, sales meetings |
| "meeting about hiring" | Only "meeting" and "hiring" | Recruitment calls, interview notes, headcount discussions |

**Limitation:** Only `source_chunks` have embeddings. Pages, blocks, and source titles/summaries are not embedded — they only appear in FTS results.

**Graceful fallback:** If pgvector is not installed, or if the NVIDIA API key is missing, semantic search returns empty and the system falls back to FTS-only silently.

---

## Combining Both: Reciprocal Rank Fusion (RRF)

After running both searches, we have two separate ranked lists. We need to merge them into one final ranking. This is done with **RRF**.

### The formula

For each result, compute:
```
score = 1 / (60 + rank)
```

Where `rank` is the position in the list (0-indexed).

| Rank | Score |
|---|---|
| #1 (rank=0) | 1/61 = 0.0164 |
| #2 (rank=1) | 1/62 = 0.0161 |
| #5 (rank=4) | 1/65 = 0.0154 |
| #10 (rank=9) | 1/70 = 0.0143 |

### Why 60?

The `60` is a tuning constant. Without it, rank #1 (1/1 = 1.0) would completely dominate over rank #2 (1/2 = 0.5). Adding 60 compresses the scores, so the difference between rank #1 and rank #10 is small. This means results that appear in both lists (even if not #1 in either) can still win.

### Merging

Each result gets a unique key (`kind:id` like `chunk:42` or `page:7`).

- If a result appears in **FTS only** → its RRF score from FTS alone
- If a result appears in **semantic only** → its RRF score from semantic alone
- If a result appears in **both** → scores are **added together** → rises to the top

This is the key insight: a result that ranks #8 in FTS and #6 in semantic ends up with a combined score that beats something that ranked #1 in only one list.

### Full flow

```
FTS results (up to 24)         Semantic results (up to 24)
     │                                    │
     │  rank #1 → score 0.0164           │  rank #1 → score 0.0164
     │  rank #2 → score 0.0161           │  rank #2 → score 0.0161
     │  ...                              │  ...
     └──────────────┬─────────────────────┘
                    │
              scoreMap (merged)
              ├── "chunk:42"  → 0.0164 + 0.0161 = 0.0325  ← appeared in both
              ├── "page:7"    → 0.0164             ← FTS only
              ├── "chunk:99"  → 0.0158             ← semantic only
              └── ...
                    │
              sort by combined score
                    │
              top 12 results returned
```

---

## Building the Context for the AI — `buildRagContext`

Once we have the top search hits, we don't just hand the AI the snippets. We fetch the **full content** of each hit and build a structured text block.

```
For each hit (up to 14):
│
├── kind = "block"   → fetch full block text from DB
│                      (snippet was just a preview)
│
├── kind = "chunk"   → fetch full chunk text from DB
│                      (2000 chars of content)
│
├── kind = "source"  → use source.summary
│                      or first 1200 chars of source.content
│
└── kind = "page"    → if kind = "folder": buildFolderInventoryText()
                       if kind = "page": fetch all blocks, join them
```

The final output looks like:

```
[Source "Budget Meeting Recording"]
AUDIO TRANSCRIPTION: ...the Q3 budget was approved at 2.4 million...

---

[Page "Meeting Notes"]
Discussed headcount for Q4. Three new hires planned for engineering.

---

[Source "Financial Report Q3"]
Revenue increased 18% YoY. Operating costs remained flat at...
```

This entire block gets injected into the AI's system prompt before it answers.

**Cap per result:** Each result's text is sliced to 1500 chars in the context block. This prevents one large document from consuming the entire context window.

**Citation deduplication:** If two chunks from the same source both appear in results, only one citation is recorded (the first one seen). The citation shows the source title and a snippet to display in the UI as "sources used".

---

## Pinned Context — `buildContextFromSelection`

This is a separate path — no searching involved. When the user manually attaches a specific file or folder to a chat message, we load it directly.

```
User attaches "budget.pdf"
        │
        ▼
buildContextFromSelection([{ type: "source", id: 42 }])
        │
        ├── fetch source row from DB
        ├── fetch ALL chunks for source_id = 42 (up to 48, ordered by position)
        ├── join chunks: chunk[0] + "\n\n" + chunk[1] + "\n\n" + chunk[2]
        └── clip to 14,000 chars
```

For **folders**, it calls `buildFolderInventoryText()` which produces a list of what's inside (one level deep — nested subfolders are not expanded).

For **pages** (notes/documents), it fetches all blocks and joins them.

The pinned context always wins — if the user attaches something, that becomes the primary source of truth and the AI is instructed to prioritize it.

---

## `buildFolderInventoryText` — Folders Have No Content

Folders are just containers. They have a title and nothing else. If a folder appears as a search hit (e.g. "what's in my Work folder?"), returning the empty folder row would give the AI nothing useful.

This function solves that by querying both tables that feed into a folder:

```
Work/ (folder, id=5)
    │
    ├── pagesTable WHERE parent_id = 5
    │   ├── 📁 Projects (subfolder)
    │   └── 📄 Meeting Notes (page)
    │
    └── sourcesTable WHERE parent_page_id = 5
        ├── budget.pdf
        └── photo.jpg
```

Output:
```
Folder "Work" contains:
- Subfolder: 📁 Projects
- Document: Meeting Notes
- File: budget.pdf (pdf) — Q3 revenue was...
- File: photo.jpg (image) — Company team photo taken at...
```

**Limitation:** Only one level deep. If Projects contains Alpha and Beta subfolders with files inside them, none of that appears. The AI would only know "Projects" exists, not what's inside it.

---

## `chunkText` — How Content Gets Split

```ts
chunkText(text, chunkSize = 2000, overlap = 250)
```

This runs at upload time (not at search time) to split raw content into searchable pieces.

**Algorithm:**

```
Start at position i = 0

1. Set end = i + 2000
2. Look backwards from end for a natural cut point:
   - Last "\n\n" (paragraph break) after position i + 1000
   - Last ". " (sentence end) after position i + 1000
   - Take whichever is further right
3. If a good cut point found → cut there
   Otherwise → cut at exactly 2000 chars
4. Save chunk from i to cut
5. Next chunk starts at: cut - 250  (the overlap)
   → this means 250 chars are repeated in consecutive chunks
6. Repeat until end of text
```

**Why overlap?**

Imagine a key sentence sits right at the boundary between chunk 1 and chunk 2. Without overlap, the sentence gets split in half and neither chunk makes sense on its own. With 250 chars of overlap, the sentence appears fully in both chunks, so at least one of them will match when searched.

**Example with a 5000-char transcript:**

```
Chunk 1: chars 0    → 2000  (natural cut at paragraph at char 1950)
Chunk 2: chars 1700 → 3700  (starts 250 chars before end of chunk 1)
Chunk 3: chars 3450 → 5000  (remainder, shorter than 2000)
```

---

## End-to-End Flow: User Sends a Chat Message

```
User: "what did the budget meeting say about Q3?"
              │
              ▼
    ┌─── searchWorkspace() ────────────────────────────────┐
    │                                                       │
    │  FTS: searches pages + blocks + sources + chunks     │
    │       finds "budget meeting" chunks by keyword       │
    │                                                       │
    │  Semantic: embeds query → vector search in pgvector  │
    │            finds financially-related chunks by meaning│
    │                                                       │
    │  RRF: merges both lists, chunks in both rise to top  │
    │                                                       │
    │  Returns top 14 hits                                  │
    └───────────────────────────────────────────────────────┘
              │
              ▼
    buildRagContext()
    → fetches full text of each hit
    → assembles context block (max 1500 chars per hit)
    → deduplicates citations
              │
              ▼
    System prompt:
    "You are Eden... Use this workspace context:
     [Source "Budget Meeting"]
     ...Q3 revenue approved at 2.4M...
     ---
     [Source "Financial Report"]
     ...operating costs flat..."
              │
              ▼
    streamChat(messages) → Groq llama-3.3-70b
              │
              ▼
    AI response streamed to browser token by token
    Citations sent to UI to show "sources used"
```

---

## When Semantic Search Is Skipped

Semantic search only runs if:
1. `pgvectorEnabled = true` (pgvector extension loaded at startup)
2. NVIDIA API key is configured
3. No error thrown during embedding generation

If any of these fail, `semanticChunks` is empty and the system falls back to FTS results only. The user experience is identical — results just come from keyword matching instead.

---

## Key Numbers

| Setting | Value | Where set |
|---|---|---|
| Chunk size | 2000 chars | `chunkText` default |
| Chunk overlap | 250 chars | `chunkText` default |
| Embedding dimensions | 1024 | pgvector column + NVIDIA model |
| Search limit (per strategy) | `limit * 2` = 24 | `searchWorkspace` |
| Final results returned | 12 (default) | `searchWorkspace` |
| Max hits for RAG context | 14 | `buildRagContext` |
| Max chars per context block | 1500 | `buildRagContext` |
| Max chunks for pinned source | 48 | `buildContextFromSelection` |
| Max chars for pinned context | 14,000 | `buildContextFromSelection` |
| RRF constant k | 60 | `searchWorkspace` |
