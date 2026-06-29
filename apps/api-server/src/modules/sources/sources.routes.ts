import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, sourcesTable, sourceChunksTable, pagesTable, blocksTable, transcriptionsTable, sourceTagsTable } from "@workspace/db";
import { and, asc, eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  CreateSourceBody,
  GetSourceParams,
  UpdateSourceBody,
  UpdateSourceParams,
  DeleteSourceParams,
} from "../../validation/schemas";
import {
  getMediaUrl,
  getYouTubeEmbedUrl,
  removeUploadedFile,
} from "./media";
import { queueJob } from "../../workers/job-queue";

const router: IRouter = Router();

type SourceListRow = {
  id: number;
  kind: string;
  title: string;
  url: string | null;
  parentPageId: number | null;
  mediaPath: string | null;
  mediaMimeType: string | null;
  mediaSizeBytes: number | null;
  summary: string | null;
  chunkCount: number;
  status: string;
  createdAt: string;
  isPage?: boolean;
  tags?: string[];
};

function toSourceResponse(row: SourceListRow) {
  let tags: string[] = [];
  try {
    if (typeof row.tags === "string") {
      tags = JSON.parse(row.tags);
    } else if (Array.isArray(row.tags)) {
      tags = row.tags;
    }
  } catch (e) {
    console.error("[toSourceResponse] Failed to parse tags:", e);
  }

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    url: row.url,
    parentPageId: row.parentPageId,
    mediaUrl: getMediaUrl(row.mediaPath),
    embedUrl: row.kind === "youtube" ? getYouTubeEmbedUrl(row.url) : null,
    mediaMimeType: row.mediaMimeType,
    mediaSizeBytes: row.mediaSizeBytes,
    summary: row.summary,
    chunkCount: row.chunkCount,
    status: row.status,
    createdAt: row.createdAt,
    isPage: row.isPage ?? false,
    tags: tags.filter(t => t !== null),
  };
}

router.post("/uploads/sign", async (req, res) => {
  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({ error: "Cloudinary not configured" });
    return;
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "eden/sources";
  const paramStr = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(paramStr + apiSecret).digest("hex");

  res.json({ signature, timestamp, apiKey, cloudName, folder });
});

function mapRow(r: Record<string, unknown>) {
  return toSourceResponse({
    id: Number(r.id),
    kind: String(r.kind),
    title: String(r.title),
    url: r.url == null ? null : String(r.url),
    parentPageId: r.parent_page_id == null ? null : Number(r.parent_page_id),
    mediaPath: r.media_path == null ? null : String(r.media_path),
    mediaMimeType: r.media_mime_type == null ? null : String(r.media_mime_type),
    mediaSizeBytes: r.media_size_bytes == null ? null : Number(r.media_size_bytes),
    summary: r.summary == null ? null : String(r.summary),
    chunkCount: Number(r.chunk_count) || 0,
    status: String(r.status),
    createdAt: new Date(r.created_at as string).toISOString(),
    isPage: Boolean(r.is_page),
    tags: r.tags as string[],
  });
}

router.get("/sources", async (req, res) => {
  const user = (req as any).user;

  // Paginated, folder-scoped fetch when ?parentId= is present
  if ("parentId" in req.query) {
    const rawParentId = String(req.query.parentId ?? "");
    const parentId = rawParentId === "null" ? null : Number(rawParentId);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;

    let countResult, rows;

    if (parentId == null) {
      countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT s.id FROM sources s WHERE s.user_id = ${user.id} AND s.parent_page_id IS NULL
          UNION ALL
          SELECT p.id FROM pages p WHERE p.kind = 'page' AND p.user_id = ${user.id} AND p.parent_id IS NULL
        ) combined
      `);
      rows = await db.execute(sql`
        SELECT id, kind, title, url, parent_page_id, media_path, media_mime_type, media_size_bytes, summary, status, created_at, chunk_count, is_page, tags
        FROM (
          SELECT
            s.id, s.kind, s.title, s.url, s.parent_page_id, s.media_path, s.media_mime_type, s.media_size_bytes,
            s.summary, s.status, s.created_at,
            (SELECT count(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
            false as is_page,
            COALESCE((SELECT json_agg(st.tag) FROM source_tags st WHERE st.source_id = s.id), '[]'::json) AS tags
          FROM sources s WHERE s.user_id = ${user.id} AND s.parent_page_id IS NULL
          UNION ALL
          SELECT
            p.id, 'page' as kind, p.title, null as url, p.parent_id as parent_page_id,
            null as media_path, null as media_mime_type, null as media_size_bytes,
            null as summary, 'ready' as status, p.created_at,
            0 as chunk_count, true as is_page, '[]'::json as tags
          FROM pages p WHERE p.kind = 'page' AND p.user_id = ${user.id} AND p.parent_id IS NULL
        ) combined
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
    } else {
      countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT s.id FROM sources s WHERE s.user_id = ${user.id} AND s.parent_page_id = ${parentId}
          UNION ALL
          SELECT p.id FROM pages p WHERE p.kind = 'page' AND p.user_id = ${user.id} AND p.parent_id = ${parentId}
        ) combined
      `);
      rows = await db.execute(sql`
        SELECT id, kind, title, url, parent_page_id, media_path, media_mime_type, media_size_bytes, summary, status, created_at, chunk_count, is_page, tags
        FROM (
          SELECT
            s.id, s.kind, s.title, s.url, s.parent_page_id, s.media_path, s.media_mime_type, s.media_size_bytes,
            s.summary, s.status, s.created_at,
            (SELECT count(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
            false as is_page,
            COALESCE((SELECT json_agg(st.tag) FROM source_tags st WHERE st.source_id = s.id), '[]'::json) AS tags
          FROM sources s WHERE s.user_id = ${user.id} AND s.parent_page_id = ${parentId}
          UNION ALL
          SELECT
            p.id, 'page' as kind, p.title, null as url, p.parent_id as parent_page_id,
            null as media_path, null as media_mime_type, null as media_size_bytes,
            null as summary, 'ready' as status, p.created_at,
            0 as chunk_count, true as is_page, '[]'::json as tags
          FROM pages p WHERE p.kind = 'page' AND p.user_id = ${user.id} AND p.parent_id = ${parentId}
        ) combined
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
    }

    const total = Number((countResult.rows[0] as any).total ?? 0);
    res.json({
      items: (rows.rows as Array<Record<string, unknown>>).map(mapRow),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
    return;
  }

  // Legacy flat fetch (used by pickers, command palette, chat context, etc.)
  const rows = await db.execute(sql`
    SELECT
      id, kind, title, url, parent_page_id, media_path, media_mime_type, media_size_bytes,
      summary, status, created_at, chunk_count, is_page, tags
    FROM (
      SELECT
        s.id, s.kind, s.title, s.url, s.parent_page_id, s.media_path, s.media_mime_type, s.media_size_bytes,
        s.summary, s.status, s.created_at,
        (SELECT count(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
        false as is_page,
        COALESCE((SELECT json_agg(st.tag) FROM source_tags st WHERE st.source_id = s.id), '[]'::json) AS tags
      FROM sources s
      WHERE s.user_id = ${user.id}
      UNION ALL
      SELECT
        p.id, 'page' as kind, p.title, null as url, p.parent_id as parent_page_id,
        null as media_path, null as media_mime_type, null as media_size_bytes,
        null as summary, 'ready' as status, p.created_at,
        0 as chunk_count,
        true as is_page,
        '[]'::json as tags
      FROM pages p
      WHERE p.kind = 'page' AND p.user_id = ${user.id}
    ) combined
    ORDER BY created_at DESC
  `);
  res.json((rows.rows as Array<Record<string, unknown>>).map(mapRow));
});

router.post("/sources", async (req, res) => {
  const body = CreateSourceBody.parse(req.body);

  if ((body.kind === "url" || body.kind === "youtube") && !body.url) {
    res.status(400).json({ error: "URL is required for this source type" });
    return;
  }
  if (body.kind === "text" && !body.content?.trim()) {
    res.status(400).json({ error: "Content is required for text sources" });
    return;
  }
  if (["image", "video", "audio"].includes(body.kind) && !body.mediaUrl) {
    res.status(400).json({ error: "mediaUrl is required — upload the file to Cloudinary first" });
    return;
  }

  if (body.parentPageId != null) {
    const [parentPage] = await db
      .select({ id: pagesTable.id })
      .from(pagesTable)
      .where(eq(pagesTable.id, body.parentPageId));
    if (!parentPage) {
      res.status(400).json({ error: "Parent page or folder not found" });
      return;
    }
  }

  const user = (req as any).user;
  const [pending] = await db
    .insert(sourcesTable)
    .values({
      userId: user.id,
      kind: body.kind,
      title: body.title,
      url: body.url ?? null,
      parentPageId: body.parentPageId ?? null,
      mediaPath: body.mediaUrl ?? null,
      mediaMimeType: body.mediaMimeType ?? null,
      mediaSizeBytes: body.mediaSizeBytes ?? null,
      content: body.content ?? "",
      status: "processing",
    })
    .returning();
  if (!pending) {
    res.status(500).json({ error: "Failed to create source" });
    return;
  }

  res.status(201).json(
    toSourceResponse({
      id: pending.id,
      kind: pending.kind,
      title: pending.title,
      url: pending.url,
      parentPageId: pending.parentPageId,
      mediaPath: pending.mediaPath,
      mediaMimeType: pending.mediaMimeType,
      mediaSizeBytes: pending.mediaSizeBytes,
      summary: pending.summary,
      chunkCount: 0,
      status: pending.status,
      createdAt: pending.createdAt.toISOString(),
    }),
  );

  try {
    await queueJob(user.id, "ingest_source", "source", pending.id, {
      kind: body.kind,
      url: body.url ?? null,
      originalFilename: body.originalFilename ?? null,
      parentPageId: body.parentPageId ?? null,
    });
  } catch (err) {
    req.log.error({ err, sourceId: pending.id }, "failed to queue ingestion job");
    await db.update(sourcesTable).set({ status: "error" }).where(eq(sourcesTable.id, pending.id));
  }
});

router.get("/sources/folder-counts", async (req, res) => {
  const user = (req as any).user;
  const rows = await db.execute(sql`
    SELECT parent_page_id, COUNT(*)::int AS count FROM (
      SELECT parent_page_id FROM sources
      WHERE user_id = ${user.id} AND parent_page_id IS NOT NULL
      UNION ALL
      SELECT parent_id AS parent_page_id FROM pages
      WHERE kind = 'page' AND user_id = ${user.id} AND parent_id IS NOT NULL
    ) combined
    GROUP BY parent_page_id
  `);
  const counts: Record<number, number> = {};
  for (const row of rows.rows as Array<Record<string, unknown>>) {
    counts[Number(row.parent_page_id)] = Number(row.count);
  }
  res.json(counts);
});

router.get("/sources/:id", async (req, res) => {
  const { id } = GetSourceParams.parse(req.params);

  const [source] = await db
    .select({
      id: sourcesTable.id,
      kind: sourcesTable.kind,
      title: sourcesTable.title,
      url: sourcesTable.url,
      parentPageId: sourcesTable.parentPageId,
      mediaPath: sourcesTable.mediaPath,
      mediaMimeType: sourcesTable.mediaMimeType,
      mediaSizeBytes: sourcesTable.mediaSizeBytes,
      summary: sourcesTable.summary,
      status: sourcesTable.status,
      createdAt: sourcesTable.createdAt,
      content: sourcesTable.content,
      tags: sql`COALESCE((SELECT json_agg(st.tag) FROM source_tags st WHERE st.source_id = ${sourcesTable.id}), '[]'::json)`,
    })
    .from(sourcesTable)
    .where(eq(sourcesTable.id, id));
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const chunks = await db
    .select()
    .from(sourceChunksTable)
    .where(eq(sourceChunksTable.sourceId, id))
    .orderBy(asc(sourceChunksTable.position));
  res.json({
    id: source.id,
    kind: source.kind,
    title: source.title,
    url: source.url,
    parentPageId: source.parentPageId,
    mediaUrl: getMediaUrl(source.mediaPath),
    embedUrl: source.kind === "youtube" ? getYouTubeEmbedUrl(source.url) : null,
    mediaMimeType: source.mediaMimeType,
    mediaSizeBytes: source.mediaSizeBytes,
    summary: source.summary,
    chunkCount: chunks.length,
    status: source.status,
    createdAt: source.createdAt.toISOString(),
    content: source.content,
    chunks,
    tags: source.tags as string[],
  });
});

// Get transcription for a source
router.get("/sources/:id/transcription", async (req, res) => {
  const { id } = GetSourceParams.parse(req.params);
  const [transcription] = await db
    .select({
      id: transcriptionsTable.id,
      content: transcriptionsTable.content,
      model: transcriptionsTable.model,
      createdAt: transcriptionsTable.createdAt,
    })
    .from(transcriptionsTable)
    .where(eq(transcriptionsTable.sourceId, id));

  if (!transcription) {
    res.status(404).json({ error: "Transcription not found" });
    return;
  }

  res.json({
    sourceId: id,
    ...transcription,
    createdAt: transcription.createdAt.toISOString(),
  });
});

router.patch("/sources/:id", async (req, res) => {
  const { id } = UpdateSourceParams.parse(req.params);
  const body = UpdateSourceBody.parse(req.body);

  if (body.parentPageId != null) {
    const [parentPage] = await db
      .select({ id: pagesTable.id, kind: pagesTable.kind })
      .from(pagesTable)
      .where(eq(pagesTable.id, body.parentPageId));
    if (!parentPage) {
      res.status(400).json({ error: "Target folder not found" });
      return;
    }
  }

  // First, try to find and update as a source
  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, id));

  if (source) {
    // It's a source - update it
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.parentPageId !== undefined) updates.parentPageId = body.parentPageId;

    if (Object.keys(updates).length === 0) {
      const chunkRows = await db.execute(sql`
        SELECT count(*) AS chunk_count
        FROM source_chunks
        WHERE source_id = ${id}
      `);
      const chunkCount = Number((chunkRows.rows[0] as Record<string, unknown> | undefined)?.chunk_count ?? 0);
      res.json(
        toSourceResponse({
          id: source.id,
          kind: source.kind,
          title: source.title,
          url: source.url,
          parentPageId: source.parentPageId,
          mediaPath: source.mediaPath,
          mediaMimeType: source.mediaMimeType,
          mediaSizeBytes: source.mediaSizeBytes,
          summary: source.summary,
          chunkCount,
          status: source.status,
          createdAt: source.createdAt.toISOString(),
          tags: (await db.select({ tag: sourceTagsTable.tag }).from(sourceTagsTable).where(eq(sourceTagsTable.sourceId, id))).map(t => t.tag),
        }),
      );
      return;
    }

    const [updated] = await db
      .update(sourcesTable)
      .set(updates)
      .where(eq(sourcesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    const chunkRows = await db.execute(sql`
      SELECT count(*) AS chunk_count
      FROM source_chunks
      WHERE source_id = ${id}
    `);
    const chunkCount = Number((chunkRows.rows[0] as Record<string, unknown> | undefined)?.chunk_count ?? 0);
    res.json(
      toSourceResponse({
        id: updated.id,
        kind: updated.kind,
        title: updated.title,
        url: updated.url,
        parentPageId: updated.parentPageId,
        mediaPath: updated.mediaPath,
        mediaMimeType: updated.mediaMimeType,
        mediaSizeBytes: updated.mediaSizeBytes,
        summary: updated.summary,
        chunkCount,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        tags: (await db.select({ tag: sourceTagsTable.tag }).from(sourceTagsTable).where(eq(sourceTagsTable.sourceId, id))).map(t => t.tag),
      }),
    );
    return;
  }

  // Not a source - try to find and update as a page (document)
  const [page] = await db.select().from(pagesTable).where(and(eq(pagesTable.id, id), eq(pagesTable.kind, "page")));

  if (page) {
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.parentPageId !== undefined) updates.parentId = body.parentPageId;

    if (Object.keys(updates).length === 0) {
      res.json(
        toSourceResponse({
          id: page.id,
          kind: "page",
          title: page.title,
          url: null,
          parentPageId: page.parentId,
          mediaPath: null,
          mediaMimeType: null,
          mediaSizeBytes: null,
          summary: null,
          chunkCount: 0,
          status: "ready",
          createdAt: page.createdAt.toISOString(),
          isPage: true,
        }),
      );
      return;
    }

    const [updated] = await db
      .update(pagesTable)
      .set(updates)
      .where(eq(pagesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    res.json(
      toSourceResponse({
        id: updated.id,
        kind: "page",
        title: updated.title,
        url: null,
        parentPageId: updated.parentId,
        mediaPath: null,
        mediaMimeType: null,
        mediaSizeBytes: null,
        summary: null,
        chunkCount: 0,
        status: "ready",
        createdAt: updated.createdAt.toISOString(),
        isPage: true,
      }),
    );
    return;
  }

  res.status(404).json({ error: "Item not found" });
});

router.delete("/sources/:id", async (req, res) => {
  const { id } = DeleteSourceParams.parse(req.params);

  // Try to delete as a source first
  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, id));
  if (source) {
    await db.delete(sourceChunksTable).where(eq(sourceChunksTable.sourceId, id));
    await db.delete(sourcesTable).where(eq(sourcesTable.id, id));
    await removeUploadedFile(source?.mediaPath);
    res.status(204).end();
    return;
  }

  // Try to delete as a page (document)
  const [page] = await db.select().from(pagesTable).where(and(eq(pagesTable.id, id), eq(pagesTable.kind, "page")));
  if (page) {
    // Delete associated blocks first
    await db.delete(blocksTable).where(eq(blocksTable.pageId, id));
    await db.delete(pagesTable).where(eq(pagesTable.id, id));
    res.status(204).end();
    return;
  }

  res.status(404).json({ error: "Item not found" });
});

// Bulk tag sources
router.post("/sources/bulk/tags", async (req, res) => {
  const user = (req as any).user;
  const { ids, tags } = z.object({
    ids: z.array(z.number()),
    tags: z.array(z.string()),
  }).parse(req.body);

  if (ids.length === 0 || tags.length === 0) {
    res.status(400).json({ error: "Missing ids or tags" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      for (const id of ids) {
        // Verify ownership
        const [source] = await tx
          .select()
          .from(sourcesTable)
          .where(and(eq(sourcesTable.id, id), eq(sourcesTable.userId, user.id)));

        if (!source) continue;

        for (const tag of tags) {
          const normalized = tag.trim().toLowerCase();
          if (!normalized) continue;

          await tx
            .insert(sourceTagsTable)
            .values({
              sourceId: id,
              tag: normalized,
            })
            .onConflictDoNothing();
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to bulk tag sources:", error);
    res.status(500).json({ error: "Failed to bulk tag sources" });
  }
});

export default router;
