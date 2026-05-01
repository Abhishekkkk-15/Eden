import { Router, type IRouter } from "express";
import { db, blocksTable, pagesTable } from "@workspace/db";
import { asc, eq, sql, inArray } from "drizzle-orm";
import {
  CreateBlockBody,
  CreateBlockParams,
  UpdateBlockBody,
  UpdateBlockParams,
  DeleteBlockParams,
  ReorderBlocksBody,
  ReorderBlocksParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/pages/:id/blocks", async (req, res) => {
  const { id } = CreateBlockParams.parse(req.params);
  const body = CreateBlockBody.parse(req.body);

  const [page] = await db.select().from(pagesTable).where(eq(pagesTable.id, id));
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  let position = body.position;
  if (position === undefined) {
    const [maxRow] = await db
      .select({ maxPos: sql<number>`coalesce(max(${blocksTable.position}), -1)` })
      .from(blocksTable)
      .where(eq(blocksTable.pageId, id));
    position = (maxRow?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(blocksTable)
    .values({
      pageId: id,
      type: body.type,
      content: body.content,
      checked: body.checked ?? false,
      position,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/blocks/:id", async (req, res) => {
  const { id } = UpdateBlockParams.parse(req.params);
  const body = UpdateBlockBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.type !== undefined) updates.type = body.type;
  if (body.content !== undefined) updates.content = body.content;
  if (body.checked !== undefined) updates.checked = body.checked;
  if (body.position !== undefined) updates.position = body.position;
  if (Object.keys(updates).length === 0) {
    const [block] = await db.select().from(blocksTable).where(eq(blocksTable.id, id));
    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    res.json(block);
    return;
  }
  const [updated] = await db
    .update(blocksTable)
    .set(updates)
    .where(eq(blocksTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  res.json(updated);
});

router.delete("/blocks/:id", async (req, res) => {
  const { id } = DeleteBlockParams.parse(req.params);
  await db.delete(blocksTable).where(eq(blocksTable.id, id));
  res.status(204).end();
});

router.post("/pages/:id/blocks/reorder", async (req, res) => {
  const { id } = ReorderBlocksParams.parse(req.params);
  const body = ReorderBlocksBody.parse(req.body);
  if (body.orderedIds.length === 0) {
    res.json([]);
    return;
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < body.orderedIds.length; i += 1) {
      const blockId = body.orderedIds[i]!;
      await tx
        .update(blocksTable)
        .set({ position: i })
        .where(eq(blocksTable.id, blockId));
    }
  });
  const blocks = await db
    .select()
    .from(blocksTable)
    .where(
      body.orderedIds.length > 0
        ? inArray(blocksTable.id, body.orderedIds)
        : eq(blocksTable.pageId, id),
    )
    .orderBy(asc(blocksTable.position), asc(blocksTable.id));
  res.json(blocks);
});

export default router;
