import { db, pagesTable, blocksTable, sourcesTable, sourceChunksTable } from "@workspace/db";
import { sql, eq, inArray } from "drizzle-orm";
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

export async function searchWorkspace(query: string, limit = 12): Promise<RagHit[]> {
  const q = query.trim();
  if (!q) return [];
  const tsq = sql`websearch_to_tsquery('english', ${q})`;

  const pageRows = await db.execute(sql`
    SELECT p.id, p.title,
           ts_rank(to_tsvector('english', p.title), ${tsq}) AS score,
           ts_headline('english', p.title, ${tsq},
             'StartSel=, StopSel=, MaxFragments=1, MaxWords=18, MinWords=4') AS snippet
    FROM pages p
    WHERE to_tsvector('english', p.title) @@ ${tsq}
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
    WHERE b.content <> '' AND to_tsvector('english', b.content) @@ ${tsq}
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  const sourceRows = await db.execute(sql`
    SELECT s.id, s.title, s.summary,
           ts_rank(to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')), ${tsq}) AS score,
           ts_headline('english', coalesce(s.summary, s.title), ${tsq},
             'StartSel=, StopSel=, MaxFragments=1, MaxWords=24, MinWords=6') AS snippet
    FROM sources s
    WHERE to_tsvector('english', s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(s.content, '')) @@ ${tsq}
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
    WHERE to_tsvector('english', c.content) @@ ${tsq}
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

export async function buildRagContext(query: string): Promise<{
  contextText: string;
  citations: Citation[];
}> {
  const hits = await searchWorkspace(query, 8);
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
      const blockList = await db
        .select()
        .from(blocksTable)
        .where(eq(blocksTable.pageId, hit.refId))
        .limit(20);
      text = blockList.map((b) => b.content).filter(Boolean).join("\n");
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
    citations: Array.from(citationMap.values()).slice(0, 8),
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
