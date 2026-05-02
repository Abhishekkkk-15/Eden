import { Router, type IRouter } from "express";
import { db, sourcesTable, sourceChunksTable, pagesTable, blocksTable, transcriptionsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  CreateSourceBody,
  GetSourceParams,
  UpdateSourceBody,
  UpdateSourceParams,
  DeleteSourceParams,
} from "@workspace/api-zod";
import { chunkText } from "../lib/rag";
import { summarize } from "../lib/ai";
import {
  extractImageContent,
  extractVideoContent,
  extractYouTubeContent,
  getMediaUrl,
  getYouTubeEmbedUrl,
  parseDataUrl,
  persistUploadedFile,
  removeUploadedFile,
} from "../lib/source-media";
import { transcribeSource } from "../lib/transcription";
import { NodeHtmlMarkdown } from "node-html-markdown";

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
};

function toSourceResponse(row: SourceListRow) {
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
  };
}

async function fetchUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "EdenAIWorkspace/1.0 (+https://replit.com)" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const markdown = NodeHtmlMarkdown.translate(html);
  return markdown.slice(0, 100000);
}

router.get("/sources", async (req, res) => {
  const user = (req as any).user;
  // Union query to get both sources and pages (documents) in one list
  const rows = await db.execute(sql`
    SELECT 
      id, kind, title, url, parent_page_id, media_path, media_mime_type, media_size_bytes,
      summary, status, created_at, chunk_count, is_page
    FROM (
      SELECT 
        s.id, s.kind, s.title, s.url, s.parent_page_id, s.media_path, s.media_mime_type, s.media_size_bytes,
        s.summary, s.status, s.created_at,
        (SELECT count(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
        false as is_page
      FROM sources s
      WHERE s.user_id = ${user.id}
      UNION ALL
      SELECT 
        p.id, 'page' as kind, p.title, null as url, p.parent_id as parent_page_id, 
        null as media_path, null as media_mime_type, null as media_size_bytes,
        null as summary, 'ready' as status, p.created_at,
        0 as chunk_count,
        true as is_page
      FROM pages p
      WHERE p.kind = 'page' AND p.user_id = ${user.id}
    ) combined
    ORDER BY created_at DESC
  `);
  res.json(
    (rows.rows as Array<Record<string, unknown>>).map((r) =>
      toSourceResponse({
        id: Number(r.id),
        kind: String(r.kind),
        title: String(r.title),
        url: r.url == null ? null : String(r.url),
        parentPageId: r.parent_page_id == null ? null : Number(r.parent_page_id),
        mediaPath: r.media_path == null ? null : String(r.media_path),
        mediaMimeType: r.media_mime_type == null ? null : String(r.media_mime_type),
        mediaSizeBytes:
          r.media_size_bytes == null ? null : Number(r.media_size_bytes),
        summary: r.summary == null ? null : String(r.summary),
        chunkCount: Number(r.chunk_count) || 0,
        status: String(r.status),
        createdAt: new Date(r.created_at as string).toISOString(),
        isPage: Boolean(r.is_page),
      }),
    ),
  );
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

  let uploaded:
    | {
        buffer: Buffer;
        mimeType: string;
      }
    | undefined;

  if (body.kind === "image" || body.kind === "video" || body.kind === "audio") {
    if (!body.fileDataUrl) {
      res.status(400).json({ error: "fileDataUrl is required for uploaded media" });
      return;
    }

    uploaded = parseDataUrl(body.fileDataUrl);

    const isValidImage =
      body.kind === "image" && uploaded.mimeType.startsWith("image/");
    const isValidVideo =
      body.kind === "video" && uploaded.mimeType.startsWith("video/");
    const isValidAudio =
      body.kind === "audio" && uploaded.mimeType.startsWith("audio/");

    if (!isValidImage && !isValidVideo && !isValidAudio) {
      res.status(400).json({ error: "Uploaded file type does not match source kind" });
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
      mediaMimeType: uploaded?.mimeType ?? null,
      mediaSizeBytes: uploaded?.buffer.byteLength ?? null,
      content: body.content ?? "",
      status: "processing",
    })
    .returning();
  if (!pending) {
    res.status(500).json({ error: "Failed to create source" });
    return;
  }

  let mediaPath: string | null = null;

  try {
    if (uploaded) {
      mediaPath = await persistUploadedFile({
        sourceId: pending.id,
        originalFilename: body.originalFilename,
        mimeType: uploaded.mimeType,
        buffer: uploaded.buffer,
      });

      await db
        .update(sourcesTable)
        .set({ mediaPath })
        .where(eq(sourcesTable.id, pending.id));
    }
  } catch (err) {
    req.log.error({ err, sourceId: pending.id }, "failed to persist uploaded media");
    await db.delete(sourcesTable).where(eq(sourcesTable.id, pending.id));
    res.status(500).json({ error: "Failed to store uploaded media" });
    return;
  }

  res.status(201).json(
    toSourceResponse({
      id: pending.id,
      kind: pending.kind,
      title: pending.title,
      url: pending.url,
      parentPageId: pending.parentPageId,
      mediaPath,
      mediaMimeType: pending.mediaMimeType,
      mediaSizeBytes: pending.mediaSizeBytes,
      summary: pending.summary,
      chunkCount: 0,
      status: pending.status,
      createdAt: pending.createdAt.toISOString(),
    }),
  );

  void (async () => {
    try {
      let content = body.content ?? "";
      let transcription: string | null = null;

      // Run transcription for media files in parallel with other processing
      // (image, video, audio all get a dedicated transcriptions table row)
      if (["video", "audio", "image"].includes(body.kind)) {
        void (async () => {
          try {
            await transcribeSource(pending.id, body.kind, mediaPath);
            req.log.info({ sourceId: pending.id, kind: body.kind }, "transcription completed");
          } catch (txErr) {
            req.log.warn({ err: txErr, sourceId: pending.id }, "transcription failed (non-critical)");
          }
        })();
      }

      if (body.kind === "url") {
        if (!body.url) throw new Error("URL is required for URL-based sources");
        content = await fetchUrl(body.url);
      } else if (body.kind === "youtube") {
        if (!body.url) throw new Error("URL is required for YouTube sources");
        const extracted = await extractYouTubeContent(body.url);
        content = extracted.content;
      } else if (body.kind === "image") {
        const imageDataUrl = body.fileDataUrl;
        if (!imageDataUrl) throw new Error("Image upload payload missing");
        const extracted = await extractImageContent({
          dataUrl: imageDataUrl,
          title: body.title,
          originalFilename: body.originalFilename,
        });
        content = extracted.content;
      } else if (body.kind === "video" || body.kind === "audio") {
        if (!uploaded) throw new Error("Media upload payload missing");
        const extracted = await extractVideoContent({
          buffer: uploaded.buffer,
          title: body.title,
          originalFilename: body.originalFilename,
        });
        content = extracted.content;
      }

      const chunks = await chunkText(content);
      let summary: string | null = null;
      try {
        if (body.kind === "image") {
          summary = content || null;
        } else {
          summary = await summarize(content);
        }
      } catch (summaryErr) {
        req.log.warn({ err: summaryErr, sourceId: pending.id }, "summary generation failed");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(sourcesTable)
          .set({ content, summary, status: "ready" })
          .where(eq(sourcesTable.id, pending.id));
        if (chunks.length > 0) {
          await tx.insert(sourceChunksTable).values(
            chunks.map((c, i) => ({
              sourceId: pending.id,
              position: i,
              content: c,
            })),
          );
        }
      });
    } catch (err) {
      req.log.error({ err, sourceId: pending.id }, "source ingestion failed");
      await db
        .update(sourcesTable)
        .set({ status: "error" })
        .where(eq(sourcesTable.id, pending.id));
    }
  })();
});

router.get("/sources/:id", async (req, res) => {
  const { id } = GetSourceParams.parse(req.params);
  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, id));
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

export default router;
