import { Router, type IRouter } from "express";
import { db, pagesTable, blocksTable, sourceChunksTable, sourcesTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  CreatePageBody,
  UpdatePageBody,
  GetPageParams,
  UpdatePageParams,
  DeletePageParams,
} from "@workspace/api-zod";
import { removeUploadedFile } from "../lib/source-media";

const router: IRouter = Router();

async function collectDescendantPageIds(rootId: number): Promise<number[]> {
  const allPages = await db.select().from(pagesTable);
  const childrenByParent = new Map<number | null, number[]>();

  for (const page of allPages) {
    const key = page.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(page.id);
    childrenByParent.set(key, list);
  }

  const result: number[] = [];
  const stack = [rootId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) stack.push(childId);
  }

  return result;
}

router.get("/pages", async (_req, res) => {
  const rows = await db
    .select()
    .from(pagesTable)
    .orderBy(asc(pagesTable.position), asc(pagesTable.id));
  res.json(rows);
});

router.post("/pages", async (req, res) => {
  const body = CreatePageBody.parse(req.body);
  const [maxRow] = await db
    .select({ maxPos: sql<number>`coalesce(max(${pagesTable.position}), -1)` })
    .from(pagesTable)
    .where(
      body.parentId == null
        ? sql`${pagesTable.parentId} IS NULL`
        : eq(pagesTable.parentId, body.parentId),
    );
  const nextPos = (maxRow?.maxPos ?? -1) + 1;

  const [created] = await db
    .insert(pagesTable)
    .values({
      kind: body.kind ?? "page",
      title: body.title,
      emoji: body.emoji ?? null,
      parentId: body.parentId ?? null,
      position: nextPos,
    })
    .returning();
  res.status(201).json(created);
});

router.get("/pages/:id", async (req, res) => {
  const { id } = GetPageParams.parse(req.params);
  const [page] = await db.select().from(pagesTable).where(eq(pagesTable.id, id));
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  const blocks = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.pageId, id))
    .orderBy(asc(blocksTable.position), asc(blocksTable.id));
  res.json({ ...page, blocks });
});

async function wouldCreateCycle(folderId: number, newParentId: number | null): Promise<boolean> {
  if (newParentId === null) return false;
  if (folderId === newParentId) return true;

  const allPages = await db.select().from(pagesTable);
  const parentById = new Map<number, number | null>();

  for (const page of allPages) {
    parentById.set(page.id, page.parentId ?? null);
  }

  let cursor: number | null = newParentId;
  while (cursor !== null) {
    if (cursor === folderId) return true;
    cursor = parentById.get(cursor) ?? null;
  }

  return false;
}

router.patch("/pages/:id", async (req, res) => {
  const { id } = UpdatePageParams.parse(req.params);
  const body = UpdatePageBody.parse(req.body);

  // Prevent circular reference when moving folders
  if (body.parentId !== undefined && body.parentId !== null) {
    const wouldCycle = await wouldCreateCycle(id, body.parentId);
    if (wouldCycle) {
      res.status(400).json({ error: "Cannot move a folder into its own descendant" });
      return;
    }
  }

  const updates: Record<string, unknown> = {};
  if (body.kind !== undefined) updates.kind = body.kind;
  if (body.title !== undefined) updates.title = body.title;
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.parentId !== undefined) updates.parentId = body.parentId;
  if (body.position !== undefined) updates.position = body.position;
  if (Object.keys(updates).length === 0) {
    const [page] = await db.select().from(pagesTable).where(eq(pagesTable.id, id));
    if (!page) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    res.json(page);
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
  res.json(updated);
});

router.delete("/pages/:id", async (req, res) => {
  const { id } = DeletePageParams.parse(req.params);
  const pageIds = await collectDescendantPageIds(id);
  const childSources = await db
    .select({ id: sourcesTable.id, mediaPath: sourcesTable.mediaPath })
    .from(sourcesTable)
    .where(inArray(sourcesTable.parentPageId, pageIds));
  const sourceIds = childSources.map((s) => s.id);
  if (sourceIds.length > 0) {
    await db.delete(sourceChunksTable).where(inArray(sourceChunksTable.sourceId, sourceIds));
  }
  await db.delete(sourcesTable).where(inArray(sourcesTable.parentPageId, pageIds));
  await db.delete(blocksTable).where(inArray(blocksTable.pageId, pageIds));
  await db.delete(pagesTable).where(inArray(pagesTable.id, pageIds));
  await Promise.all(childSources.map((source) => removeUploadedFile(source.mediaPath)));
  res.status(204).end();
});

export default router;
