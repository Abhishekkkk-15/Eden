import { Router, type IRouter } from "express";
import {
  db,
  pagesTable,
  sourcesTable,
  agentsTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { sql, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res) => {
  const user = (req as any).user;
  const [pageRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(pagesTable)
    .where(eq(pagesTable.userId, user.id));
  const [sourceRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sourcesTable)
    .where(eq(sourcesTable.userId, user.id));
  const [agentRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(agentsTable); // Agents are global for now or need userId too
  const [convRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(conversationsTable);
  const [msgRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(messagesTable);
  res.json({
    pageCount: Number(pageRow?.c ?? 0),
    sourceCount: Number(sourceRow?.c ?? 0),
    agentCount: Number(agentRow?.c ?? 0),
    conversationCount: Number(convRow?.c ?? 0),
    messageCount: Number(msgRow?.c ?? 0),
  });
});

router.get("/dashboard/recent", async (req, res) => {
  const user = (req as any).user;
  const recentPages = await db
    .select()
    .from(pagesTable)
    .where(eq(pagesTable.userId, user.id))
    .orderBy(desc(pagesTable.updatedAt))
    .limit(5);
  const recentSources = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.userId, user.id))
    .orderBy(desc(sourcesTable.createdAt))
    .limit(5);
  const recentConvs = await db
    .select()
    .from(conversationsTable)
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(5); // TODO: Add userId to conversations table

  const items = [
    ...recentPages.map((p) => ({
      kind: "page" as const,
      refId: p.id,
      title: p.title,
      subtitle: p.emoji,
      updatedAt: p.updatedAt.toISOString(),
    })),
    ...recentSources.map((s) => ({
      kind: "source" as const,
      refId: s.id,
      title: s.title,
      subtitle: s.kind,
      updatedAt: s.createdAt.toISOString(),
    })),
    ...recentConvs.map((c) => ({
      kind: "conversation" as const,
      refId: c.id,
      title: c.title,
      subtitle: null,
      updatedAt: c.updatedAt.toISOString(),
    })),
  ];

  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  res.json(items.slice(0, 10));
});

export default router;
