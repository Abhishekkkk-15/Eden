# Chunking System — Complete Documentation

**Function:** `chunkText` in `apps/api-server/src/infrastructure/rag.ts`

---

## What is Chunking?

When a file is uploaded (PDF, video transcript, image description, URL content), the extracted text can be thousands or even hundreds of thousands of characters long. You cannot store or search that as one unit effectively because:

1. **Embeddings can't represent a 50,000-word document meaningfully** — one vector for all that content loses specificity. A single question can't match "the whole document" precisely.
2. **Context windows have limits** — you can't inject 50,000 words into an AI prompt.
3. **Relevance is local** — if someone asks about a specific topic, only 1-2 paragraphs in a large document are actually relevant. You want to find and retrieve just those parts.

Chunking splits the full text into smaller overlapping pieces. Each piece gets its own embedding vector and its own row in `source_chunks`. When searching, only the relevant chunks are retrieved — not the whole document.

---

## No External Library — Custom Implementation

**There is no third-party chunking library used.** No LangChain, no LlamaIndex, no `@pinecone-database/doc-splitter`, nothing.

`chunkText` is a **hand-written** sliding window chunker in ~20 lines of TypeScript. It uses only built-in JavaScript string methods (`lastIndexOf`, `slice`, `trim`).

---

## The Strategy: Fixed-Size Sliding Window with Natural Boundary Snapping

### Parameters

```ts
chunkText(text: string, chunkSize = 2000, overlap = 250): Promise<string[]>
```

| Parameter | Default | What it controls |
|---|---|---|
| `chunkSize` | `2000` chars | Maximum size of each chunk |
| `overlap` | `250` chars | How many chars from the previous chunk repeat in the next |

These are the two knobs. Currently set to 2000/250.

### Step-by-Step Algorithm

```
Input: a long text string
Output: array of overlapping text chunks
```

**Step 1 — Clean the text**
```ts
const clean = text.replace(/\r\n/g, "\n").trim();
```
Normalize Windows line endings to Unix, strip leading/trailing whitespace.

**Step 2 — Short-circuit if text fits in one chunk**
```ts
if (clean.length <= chunkSize) return [clean];
```
If the entire text is under 2000 chars, return it as a single chunk. No splitting needed.

**Step 3 — Sliding window loop**

Start at position `i = 0`, repeat until end of text:

```
a) Set end = i + 2000  (tentative cut point)

b) Look backwards from end for a natural boundary:
   - Last "\n\n" (paragraph break) between position i+1000 and end
   - Last ". " (sentence end) between position i+1000 and end
   - Take whichever position is further right (Math.max)

c) If the best boundary is past the halfway point of the chunk (i + 1000):
      cut = boundary position   ← snap to natural break
   Else:
      cut = end                 ← no good break found, hard cut at 2000

d) Save chunk: text.slice(i, cut).trim()

e) Next i = cut - 250          ← move forward but repeat last 250 chars
```

**Step 4 — Filter empties**
```ts
return chunks.filter((c) => c.length > 0);
```
Remove any empty strings that might result from consecutive whitespace at cut points.

---

## Visual Example

Imagine a 5500-char transcript. Here's how chunks are produced:

```
Original text (5500 chars):
├──────────────────────────────────────────────────────────────────┤
0                                                               5500

Chunk 1 (i=0):
├────────────────────────[ 2000 chars ]────────────────────────┤
0                        1850 ← natural paragraph break found   2000
                         └── cut here

Chunk 2 (i = 1850 - 250 = 1600):
                  ├────[ overlap ]────────────────────────────────────────┤
                  1600               (1600 + 2000 = 3600)
                                     3420 ← sentence end found
                                     └── cut here

Chunk 3 (i = 3420 - 250 = 3170):
                                ├────[ overlap ]────────────────────────────┤
                                3170                            5500 (end of text)
                                └── remainder, no cut needed

Result: 3 chunks
```

The **250-char overlap** means the end of chunk 1 and the start of chunk 2 share the same 250 characters. This prevents important sentences from being split across chunks where neither chunk has the full context.

---

## Why Natural Boundary Snapping?

Without it, a hard cut at exactly 2000 chars might look like this:

```
...the Q3 revenue was approved at 2.4 million. The board then discussed
the headcount plan for Q4, noting that three new engineer
```
*(cut mid-sentence)*

```
ing hires were planned for the backend team...
```
*(next chunk starts mid-sentence)*

The embedding for each chunk would be confused by the broken context. With boundary snapping, the cut happens at the nearest paragraph or sentence end, keeping each chunk self-contained:

```
...the Q3 revenue was approved at 2.4 million.
```
*(clean sentence end)*

```
The board then discussed the headcount plan for Q4, noting that three new
engineering hires were planned for the backend team...
```
*(clean sentence start)*

**The 50% rule:** The boundary must be past the halfway point (`i + chunkSize * 0.5`). This prevents extreme cases where a paragraph break at position 100 causes a 100-char chunk followed by a 1900-char gap — the window would slide too slowly.

---

## Where Chunking Happens — All Call Sites

`chunkText` is called from 3 different places, each producing chunks at **different position offsets** in `source_chunks`.

### Call Site 1: Main Ingestion (`job-queue.ts` line 160)

```ts
// processIngestSourceJob
const chunks = await chunkText(content);

await tx.insert(sourceChunksTable).values(
  chunks.map((c, i) => ({ sourceId: entityId, position: i, content: c }))
);
```

**Position range:** `0, 1, 2, 3, ...`

**What content:** The primary extracted text:
- For URL → stripped HTML markdown
- For YouTube → caption transcript (or Whisper if no captions)
- For image → NVIDIA Vision model's full OCR + visual description
- For video → `"AUDIO TRANSCRIPTION:\n...\n\nVISUAL ANALYSIS:\n..."` (combined)
- For audio → Whisper transcript
- For text/document → raw text content

### Call Site 2: Audio/Video Transcription (`transcription.ts` line 36)

```ts
// transcribeAudioVideo — called non-blocking during ingestion
const chunks = await chunkText(transcription);

await db.insert(sourceChunksTable).values(
  chunks.map((c, i) => ({
    sourceId,
    position: 1000 + i,          // ← offset starts at 1000
    content: `[Transcription] ${c}`,
  }))
);
```

**Position range:** `1000, 1001, 1002, ...`

**What content:** Pure Whisper audio transcript (audio track only, no visual). Each chunk is prefixed `[Transcription]` to distinguish it in search results.

**Note:** This is a **second chunking** of similar content that already happened in Call Site 1. For videos, Call Site 1 already chunked the combined audio+visual text. Call Site 2 then chunks just the audio transcript separately. Some duplication exists.

### Call Site 3: Image OCR (`transcription.ts` line 84)

```ts
// transcribeImage — called non-blocking during ingestion
const chunks = await chunkText(transcription);

await db.insert(sourceChunksTable).values(
  chunks.map((c, i) => ({
    sourceId,
    position: 2000 + i,          // ← offset starts at 2000
    content: `[Image OCR] ${c}`,
  }))
);
```

**Position range:** `2000, 2001, 2002, ...`

**What content:** The same NVIDIA Vision description that was already chunked in Call Site 1 — read back from `source.content` in the DB. Each chunk is prefixed `[Image OCR]`.

**Note:** This is **duplicate content** of Call Site 1 for images. The same vision text is chunked twice (once plain, once `[Image OCR]` prefixed).

### Call Site 4: Cloud Import (`cloud-import.ts` line 322)

```ts
// processQueueItem — for files imported from Dropbox/GDrive/Notion
const chunks = await chunkText(content);

await db.insert(sourceChunksTable).values(
  chunks.map((c, i) => ({ sourceId: source.id, position: i, content: c }))
);
```

**Position range:** `0, 1, 2, ...`

**What content:** Text extracted directly from the file buffer — only runs for `text/plain`, `text/markdown`, and Notion pages. Binary files (images, videos) imported from the cloud don't go through this code path.

---

## Position Offset System

The `position` column in `source_chunks` is not just an ordering number — it's also used to separate different types of chunks for the same source:

```
position 0–999     Main content chunks (primary extracted text)
position 1000–1999 Audio/video Whisper transcription chunks
position 2000–2999 Image OCR chunks (Vision AI re-chunked with prefix)
position 3000+     Video frame descriptions (NOT from chunkText — see below)
```

### Video Frames — A Different Kind of Chunk

Video frames are stored in `source_chunks` at positions 3000+ but they are **NOT produced by `chunkText`**. Each frame is already a small self-contained description from the Vision AI:

```ts
// transcription.ts — transcribeVideoFrames
const frameChunks = frames.map((frame, i) => ({
  sourceId,
  position: 3000 + i,
  content: `[Visual Frame ${formatTimestamp(frame.timestamp)}] ${frame.description}`,
}));
```

Each frame description is one row, one chunk, already short enough to not need splitting. Format: `[Visual Frame 00:05] A presenter is standing in front of a whiteboard showing a bar chart...`

---

## What Happens to Chunks After Creation

### Step 1: Saved to `source_chunks` table

```
source_chunks
├── id = 1,  source_id = 42, position = 0,    content = "The Q3 budget was..."
├── id = 2,  source_id = 42, position = 1,    content = "...operations team noted..."
└── id = 3,  source_id = 42, position = 2,    content = "...final headcount approved..."
```

### Step 2: Embeddings generated (non-blocking, best-effort)

```ts
// job-queue.ts — runs after DB save, non-blocking
for (let i = 0; i < chunks.length; i++) {
  const embedding = await generateEmbedding(chunks[i]);
  await db.execute(sql`
    UPDATE source_chunks
    SET embedding = ${vectorStr}::vector
    WHERE source_id = ${entityId} AND position = ${i}
  `);
}
```

Each chunk's text is sent to **NVIDIA's `nv-embedqa-e5-v5`** model which returns a `number[]` of length **1024**. This gets stored as a `vector(1024)` column (added by pgvector at runtime).

The embeddings are generated one at a time in a loop, each requiring an API call. This is slow for large documents — a 20-chunk document makes 20 API calls sequentially.

### Step 3: Chunks are used in search

At search time:
- **FTS** searches `source_chunks.content` column via `tsvector` (keyword matching)
- **Semantic search** compares query embedding against each `source_chunks.embedding` via `<=>` operator (vector distance)

Only the most relevant chunks are returned, not all of them.

### Step 4: When user attaches a file to chat

When a user pins a specific source to a conversation (`buildContextFromSelection`), all chunks are loaded in position order and joined:

```ts
const chunks = await db
  .select()
  .from(sourceChunksTable)
  .where(eq(sourceChunksTable.sourceId, item.id))
  .orderBy(asc(sourceChunksTable.position))
  .limit(48);                   // max 48 chunks

const text = chunks.map(c => c.content).join("\n\n");
// capped at 14,000 chars total
```

---

## Full Lifecycle of a Chunk

```
File uploaded
      │
      ▼
Content extracted (Vision AI / Whisper / URL fetch / etc.)
      │
      ▼
chunkText(content, 2000, 250)
      │
      ├── Chunk 1: "The Q3 budget..."        ─── saved to source_chunks (position=0)
      ├── Chunk 2: "...operations team..."   ─── saved to source_chunks (position=1)
      └── Chunk 3: "...headcount approved..." ── saved to source_chunks (position=2)
                                                        │
                                          (non-blocking, after DB save)
                                                        │
                                                        ▼
                                          generateEmbedding(chunk[0]) → [0.12, -0.34, ...] (1024 numbers)
                                          UPDATE source_chunks SET embedding = vector WHERE position=0
                                          generateEmbedding(chunk[1]) → [0.08,  0.91, ...]
                                          UPDATE source_chunks SET embedding = vector WHERE position=1
                                          generateEmbedding(chunk[2]) → [-0.21, 0.44, ...]
                                          UPDATE source_chunks SET embedding = vector WHERE position=2
                                                        │
                                                        ▼
                                          source_chunks table:
                                          ┌────┬───────────┬──────────┬───────────────┬────────────────────┐
                                          │ id │ source_id │ position │ content       │ embedding          │
                                          ├────┼───────────┼──────────┼───────────────┼────────────────────┤
                                          │ 1  │ 42        │ 0        │ "The Q3..."   │ [0.12, -0.34, ...] │
                                          │ 2  │ 42        │ 1        │ "...ops..."   │ [0.08,  0.91, ...] │
                                          │ 3  │ 42        │ 2        │ "...heads..." │ [-0.21, 0.44, ...] │
                                          └────┴───────────┴──────────┴───────────────┴────────────────────┘
                                                        │
                              ┌─────────────────────────┤
                              │                         │
                   User searches workspace     User pins file to chat
                              │                         │
                    FTS + Vector search         Load all 48 chunks
                    finds chunk 2 only          join in order
                              │                         │
                    AI gets chunk 2 text        AI gets all 3 chunks
                    (most relevant piece)       (full document)
```

---

## Known Issues

### 1. Images are chunked twice
For image uploads, the Vision AI description goes through `chunkText` twice:
- Once in `processIngestSourceJob` → positions 0, 1, 2...
- Once in `transcribeImage` → positions 2000, 2001, 2002... (same content, `[Image OCR]` prefix)

This creates duplicate rows in `source_chunks` for every image. The search will surface both and they carry identical content.

### 2. Videos run Whisper twice
For video uploads:
- `extractVideoContent` inside `processIngestSourceJob` runs Whisper → used for combined content
- `transcribeAudioVideo` (called non-blocking) runs Whisper again → produces `[Transcription]` chunks at 1000+

Two API calls to Whisper for the same audio. Wasted cost and latency.

### 3. Embeddings are sequential, not parallel
The embedding loop:
```ts
for (let i = 0; i < chunks.length; i++) {
  const embedding = await generateEmbedding(chunks[i]);
  ...
}
```
Runs one chunk at a time. A document with 25 chunks makes 25 sequential NVIDIA API calls. These could be parallelized with `Promise.all` to be significantly faster.

---

## Key Numbers Reference

| Setting | Value |
|---|---|
| Chunk size | 2000 characters |
| Chunk overlap | 250 characters |
| Min boundary position | 50% of chunk (1000 chars in) |
| Embedding dimensions per chunk | 1024 |
| Embedding model | `nvidia/nv-embedqa-e5-v5` |
| Max input to embedding model | 8192 chars (chunks fit comfortably) |
| Position range — main content | 0–999 |
| Position range — transcription | 1000–1999 |
| Position range — image OCR | 2000–2999 |
| Position range — video frames | 3000+ |
| Max chunks loaded for pinned chat | 48 |
| Max combined chars for pinned chat | 14,000 |
