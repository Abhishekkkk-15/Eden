import { db, pagesTable, blocksTable, sourcesTable, sourceChunksTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Citation } from "@workspace/db";

export type RagHit = {
  kind: "page" | "block" | "source" | "chunk";
  refId: number;
  pageId: number | null;
  sourceId: number | null;
  title: string;
  snippet: string;
  score: number;
};

type TsMode = "websearch" | "plain";

/** Folders have no blocks; chat RAG needs an inventory so the model can answer questions about drive structure. */
async function buildFolderInventoryText(
  folderId: number,
  userId: string,
  folderTitle: string,
): Promise<string> {
  const children = await db
    .select()
    .from(pagesTable)
    .where(and(eq(pagesTable.parentId, folderId), eq(pagesTable.userId, userId)))
    .orderBy(asc(pagesTable.position), asc(pagesTable.id));

  const subfolders = children.filter((p) => p.kind === "folder");
  const docs = children.filter((p) => p.kind === "page");

  const childSources = await db
    .select()
    .from(sourcesTable)
    .where(and(eq(sourcesTable.parentPageId, folderId), eq(sourcesTable.userId, userId)))
    .orderBy(asc(sourcesTable.createdAt), asc(sourcesTable.id));

  const lines: string[] = [`Folder "${folderTitle}" contains:`];

  for (const f of subfolders) {
    lines.push(`- Subfolder: ${f.emoji ? `${f.emoji} ` : ""}${f.title}`);
  }
  for (const d of docs) {
    lines.push(`- Document: ${d.title}`);
  }

  const maxFiles = 20;
  for (let i = 0; i < childSources.length; i++) {
    if (i >= maxFiles) {
      lines.push(`- … and ${childSources.length - maxFiles} more file(s) in this folder`);
      break;
    }
    const s = childSources[i]!;
    const excerpt = (s.summary || s.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320);
    lines.push(`- File: ${s.title} (${s.kind})${excerpt ? ` — ${excerpt}` : ""}`);
  }

  if (lines.length === 1) {
    return `Folder "${folderTitle}" is empty (no subfolders, documents, or files).`;
  }

  return lines.join("\n");
}

function tsQueryFragment(q: string, mode: TsMode) {
  return mode === "websearch" ?
      sql`websearch_to_tsquery('english', ${q})`
    : sql`plainto_tsquery('english', ${q})`;
}

async function searchWorkspaceWithMode(
  userId: string,
  q: string,
  limit: number,
  mode: TsMode,
): Promise<RagHit[]> {
  const tsq = tsQueryFragment(q, mode);

  const pageRows = await db.execute(sql`
    SELECT p.id, p.title,
           ts_rank(to_tsvector('english', coalesce(p.emoji, '') || ' ' || p.title), ${tsq}) AS score,
           ts_headline('english', coalesce(p.emoji, '') || ' ' || p.title, ${tsq},
             'StartSel=, StopSel=, MaxFragments=1, MaxWords=18, MinWords=4') AS snippet
    FROM pages p
    WHERE p.user_id = ${userId}
      AND to_tsvector('english', coalesce(p.emoji, '') || ' ' || p.title) @@ ${tsq}
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  const blockRows = await db.execute(sql`
    SELECT b.id, b.page_id, b.content, p.title AS page_title,
           ts_rank(to_tsvector('english', b.content), ${tsq}) AS score,
           ts_headline('english', b.content, ${tsq},
             'StartSel=, StopSel=, MaxFragments=1, MaxWords=24, MinWords=6') AS snippet
    FROM blocks b
    JOIN pages p ON p.id = b.page_id
    WHERE p.user_id = ${userId} AND b.content <> '' AND to_tsvector('english', b.content) @@ ${tsq}
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  const sourceRows = await db.execute(sql`
    SELECT s.id, s.title, s.summary,
           ts_rank(to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')), ${tsq}) AS score,
           ts_headline('english', coalesce(s.summary, s.title), ${tsq},
             'StartSel=, StopSel=, MaxFragments=1, MaxWords=24, MinWords=6') AS snippet
    FROM sources s
    WHERE s.user_id = ${userId} AND to_tsvector('english', s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(s.content, '')) @@ ${tsq}
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  const chunkRows = await db.execute(sql`
    SELECT c.id, c.source_id, c.content, s.title AS source_title,
           ts_rank(to_tsvector('english', c.content), ${tsq}) AS score,
           ts_headline('english', c.content, ${tsq},
             'StartSel=, StopSel=, MaxFragments=1, MaxWords=28, MinWords=8') AS snippet
    FROM source_chunks c
    JOIN sources s ON s.id = c.source_id
    WHERE s.user_id = ${userId} AND to_tsvector('english', c.content) @@ ${tsq}
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  const hits: RagHit[] = [];
  for (const r of pageRows.rows as Array<Record<string, unknown>>) {
    hits.push({
      kind: "page",
      refId: Number(r.id),
      pageId: Number(r.id),
      sourceId: null,
      title: String(r.title),
      snippet: String(r.snippet ?? r.title ?? ""),
      score: Number(r.score) || 0,
    });
  }
  for (const r of blockRows.rows as Array<Record<string, unknown>>) {
    hits.push({
      kind: "block",
      refId: Number(r.id),
      pageId: Number(r.page_id),
      sourceId: null,
      title: String(r.page_title),
      snippet: String(r.snippet ?? r.content ?? "").slice(0, 240),
      score: Number(r.score) || 0,
    });
  }
  for (const r of sourceRows.rows as Array<Record<string, unknown>>) {
    hits.push({
      kind: "source",
      refId: Number(r.id),
      pageId: null,
      sourceId: Number(r.id),
      title: String(r.title),
      snippet: String(r.snippet ?? r.summary ?? r.title ?? ""),
      score: Number(r.score) || 0,
    });
  }
  for (const r of chunkRows.rows as Array<Record<string, unknown>>) {
    hits.push({
      kind: "chunk",
      refId: Number(r.id),
      pageId: null,
      sourceId: Number(r.source_id),
      title: String(r.source_title),
      snippet: String(r.snippet ?? r.content ?? "").slice(0, 240),
      score: Number(r.score) || 0,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Full-text search across pages, blocks, uploaded files, and chunks. Tries plain search if web syntax yields nothing (better for chat questions). */
export async function searchWorkspace(userId: string, query: string, limit = 12): Promise<RagHit[]> {
  const q = query.trim();
  if (!q) return [];
  let hits = await searchWorkspaceWithMode(userId, q, limit, "websearch");
  if (hits.length === 0) {
    hits = await searchWorkspaceWithMode(userId, q, limit, "plain");
  }
  return hits;
}

export async function buildRagContext(userId: string, query: string): Promise<{
  contextText: string;
  citations: Citation[];
}> {
  const hits = await searchWorkspace(userId, query, 14);
  if (hits.length === 0) return { contextText: "", citations: [] };

  const citationMap = new Map<string, Citation>();
  const blocks: string[] = [];

  for (const hit of hits) {
    let text = hit.snippet;
    if (hit.kind === "block" && hit.refId) {
      const [block] = await db.select().from(blocksTable).where(eq(blocksTable.id, hit.refId));
      if (block) text = block.content;
    } else if (hit.kind === "chunk" && hit.refId) {
      const [chunk] = await db
        .select()
        .from(sourceChunksTable)
        .where(eq(sourceChunksTable.id, hit.refId));
      if (chunk) text = chunk.content;
    } else if (hit.kind === "page" && hit.refId) {
      const [page] = await db.select().from(pagesTable).where(eq(pagesTable.id, hit.refId));
      if (!page) continue;
      if (page.kind === "folder") {
        text = await buildFolderInventoryText(hit.refId, userId, page.title);
      } else {
        const blockList = await db
          .select()
          .from(blocksTable)
          .where(eq(blocksTable.pageId, hit.refId))
          .limit(20);
        text = blockList.map((b) => b.content).filter(Boolean).join("\n");
      }
    } else if (hit.kind === "source" && hit.refId) {
      const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, hit.refId));
      if (source) text = source.summary || source.content.slice(0, 1200);
    }

    if (!text || text.trim().length === 0) continue;

    const citationKind: "page" | "source" =
      hit.kind === "page" || hit.kind === "block" ? "page" : "source";
    const citationRef = citationKind === "page" ? hit.pageId! : hit.sourceId!;
    const key = `${citationKind}:${citationRef}`;

    if (!citationMap.has(key)) {
      citationMap.set(key, {
        kind: citationKind,
        refId: citationRef,
        title: hit.title,
        snippet: hit.snippet.slice(0, 200),
      });
    }

    const label = citationKind === "page" ? `Page "${hit.title}"` : `Source "${hit.title}"`;
    blocks.push(`[${label}]\n${text.slice(0, 1500)}`);
  }

  return {
    contextText: blocks.join("\n\n---\n\n"),
    citations: Array.from(citationMap.values()).slice(0, 10),
  };
}

export type ChatContextItem = { type: "source" | "page" | "folder"; id: number };

function clipContextText(text: string, max: number): string {
  const t = text.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}\n…(truncated)`;
}

/**
 * Load full text for user-selected sources, documents, or folders (chat attachments).
 * All rows are scoped with userId.
 */
export async function buildContextFromSelection(
  userId: string,
  items: ChatContextItem[],
): Promise<{ contextText: string; citations: Citation[] }> {
  if (!items?.length) return { contextText: "", citations: [] };

  const seen = new Set<string>();
  const deduped: ChatContextItem[] = [];
  for (const it of items) {
    const k = `${it.type}:${it.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(it);
  }

  const blocks: string[] = [];
  const citationMap = new Map<string, Citation>();

  for (const item of deduped) {
    if (item.type === "source") {
      const [s] = await db
        .select()
        .from(sourcesTable)
        .where(and(eq(sourcesTable.id, item.id), eq(sourcesTable.userId, userId)));
      if (!s) continue;
      const chunks = await db
        .select()
        .from(sourceChunksTable)
        .where(eq(sourceChunksTable.sourceId, item.id))
        .orderBy(asc(sourceChunksTable.position))
        .limit(48);
      let text =
        chunks.length > 0 ?
          chunks.map((c) => c.content).join("\n\n")
        : (s.summary || s.content || "");
      text = clipContextText(text, 14_000);
      if (!text) continue;
      citationMap.set(`source:${s.id}`, {
        kind: "source",
        refId: s.id,
        title: s.title,
        snippet: (s.summary || text).slice(0, 200),
      });
      blocks.push(`[Attached file: "${s.title}" (${s.kind})]\n${text}`);
    } else if (item.type === "page") {
      const [p] = await db
        .select()
        .from(pagesTable)
        .where(and(eq(pagesTable.id, item.id), eq(pagesTable.userId, userId)));
      if (!p || p.kind !== "page") continue;
      const blockList = await db
        .select()
        .from(blocksTable)
        .where(eq(blocksTable.pageId, item.id))
        .orderBy(asc(blocksTable.position), asc(blocksTable.id));
      const text = clipContextText(
        blockList.map((b) => b.content).filter(Boolean).join("\n"),
        14_000,
      );
      if (!text) continue;
      citationMap.set(`page:${p.id}`, {
        kind: "page",
        refId: p.id,
        title: p.title,
        snippet: text.slice(0, 200),
      });
      blocks.push(`[Attached document: "${p.title}"]\n${text}`);
    } else if (item.type === "folder") {
      const [p] = await db
        .select()
        .from(pagesTable)
        .where(and(eq(pagesTable.id, item.id), eq(pagesTable.userId, userId)));
      if (!p || p.kind !== "folder") continue;
      const inv = await buildFolderInventoryText(item.id, userId, p.title);
      const expanded = clipContextText(inv, 16_000);
      citationMap.set(`page:${p.id}`, {
        kind: "page",
        refId: p.id,
        title: p.title,
        snippet: expanded.slice(0, 200),
      });
      blocks.push(`[Attached folder: "${p.title}"]\n${expanded}`);
    }
  }

  return {
    contextText: blocks.join("\n\n---\n\n"),
    citations: Array.from(citationMap.values()),
  };
}

export async function chunkText(text: string, chunkSize = 800, overlap = 120): Promise<string[]> {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + chunkSize);
    let cut = end;
    if (end < clean.length) {
      const para = clean.lastIndexOf("\n\n", end);
      const sent = clean.lastIndexOf(". ", end);
      const candidate = Math.max(para, sent);
      if (candidate > i + chunkSize * 0.5) cut = candidate;
    }
    chunks.push(clean.slice(i, cut).trim());
    if (cut >= clean.length) break;
    i = Math.max(cut - overlap, i + 1);
  }
  return chunks.filter((c) => c.length > 0);
}

export { inArray };
