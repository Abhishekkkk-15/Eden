import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  messagesTable,
  agentsTable,
  type Citation,
} from "@workspace/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  CreateConversationBody,
  GetConversationParams,
  DeleteConversationParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { buildRagContext } from "../lib/rag";
import { streamChat } from "../lib/ai";

const router: IRouter = Router();

router.get("/conversations", async (req, res) => {
  const user = (req as any).user;
  const rows = await db.execute(sql`
    SELECT c.id, c.title, c.agent_id, c.created_at, c.updated_at,
           (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c
    WHERE c.user_id = ${user.id}
    ORDER BY c.updated_at DESC
  `);
  res.json(
    (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      title: String(r.title),
      agentId: r.agent_id == null ? null : Number(r.agent_id),
      messageCount: Number(r.message_count) || 0,
      createdAt: new Date(r.created_at as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
    })),
  );
});
router.post("/conversations", async (req, res) => {
  const body = CreateConversationBody.parse(req.body);
  const user = (req as any).user;
  const [created] = await db
    .insert(conversationsTable)
    .values({
      userId: user.id,
      title: body.title,
      agentId: body.agentId ?? null,
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create conversation" });
    return;
  }
  res.status(201).json({
    id: created.id,
    title: created.title,
    agentId: created.agentId,
    messageCount: 0,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

router.get("/conversations/:id", async (req, res) => {
  const { id } = GetConversationParams.parse(req.params);
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id));
  res.json({
    id: conv.id,
    title: conv.title,
    agentId: conv.agentId,
    messageCount: Number(count) || 0,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    messages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      citations: m.citations ?? [],
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.delete("/conversations/:id", async (req, res) => {
  const { id } = DeleteConversationParams.parse(req.params);
  await db.delete(messagesTable).where(eq(messagesTable.conversationId, id));
  await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
  res.status(204).end();
});

router.post("/conversations/:id/messages", async (req, res) => {
  const { id } = SendMessageParams.parse(req.params);
  const body = SendMessageBody.parse(req.body);

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  let agentPrompt: string | null = null;
  let agentName: string | null = null;
  if (conv.agentId != null) {
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, conv.agentId));
    if (agent) {
      agentPrompt = agent.prompt;
      agentName = agent.name;
    }
  }

  await db.insert(messagesTable).values({
    conversationId: id,
    role: "user",
    content: body.content,
    citations: [],
  });

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id));

  if (conv.title === "New chat" && history.length <= 1) {
    const newTitle = body.content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    await db
      .update(conversationsTable)
      .set({ title: newTitle })
      .where(eq(conversationsTable.id, id));
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let citations: Citation[] = [];
  let assembled = "";

  const user = (req as any).user;
  try {
    const { contextText, citations: ragCitations } = await buildRagContext(user.id, body.content);
    citations = ragCitations;
    if (citations.length > 0) {
      send({ citations });
    }

    const baseSystem =
      agentPrompt ??
      "You are Eden, a calm and precise AI assistant for a personal knowledge workspace. Answer clearly and concisely. When you use the workspace context, reference it naturally without inventing facts.";
    const system = contextText
      ? `${baseSystem}\n\nUse the following workspace context when relevant. If the answer is not present, say what you do know and suggest what to look for next.\n\n--- WORKSPACE CONTEXT ---\n${contextText}\n--- END CONTEXT ---`
      : baseSystem;

    const messagesForModel: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: system },
    ];
    for (const m of history) {
      if (m.role === "user" || m.role === "assistant") {
        messagesForModel.push({ role: m.role, content: m.content });
      }
    }

    for await (const delta of streamChat(messagesForModel)) {
      assembled += delta;
      send({ content: delta });
    }
  } catch (err) {
    req.log.error({ err }, "chat stream failed");
    if (!assembled) {
      assembled = "I ran into an error generating a response. Please try again.";
      send({ content: assembled });
    }
  }

  await db.insert(messagesTable).values({
    conversationId: id,
    role: "assistant",
    content: assembled,
    citations,
  });
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, id));

  send({ done: true, citations });
  res.end();
});

export default router;
