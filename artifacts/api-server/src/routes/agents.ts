import { Router, type IRouter } from "express";
import { db, agentsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  CreateAgentBody,
  UpdateAgentBody,
  UpdateAgentParams,
  DeleteAgentParams,
  RunAgentBody,
  RunAgentParams,
} from "@workspace/api-zod";
import { buildRagContext } from "../lib/rag";
import { completeText } from "../lib/ai";

const router: IRouter = Router();

router.get("/agents", async (req, res) => {
  const user = (req as any).user;
  const rows = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.userId, user.id))
    .orderBy(desc(agentsTable.updatedAt));
  res.json(rows);
});

router.post("/agents", async (req, res) => {
  const body = CreateAgentBody.parse(req.body);
  const user = (req as any).user;
  const [created] = await db
    .insert(agentsTable)
    .values({
      userId: user.id,
      name: body.name,
      description: body.description,
      emoji: body.emoji,
      prompt: body.prompt,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/agents/:id", async (req, res) => {
  const { id } = UpdateAgentParams.parse(req.params);
  const body = UpdateAgentBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.prompt !== undefined) updates.prompt = body.prompt;
  if (Object.keys(updates).length === 0) {
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(agent);
    return;
  }
  const [updated] = await db
    .update(agentsTable)
    .set(updates)
    .where(eq(agentsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(updated);
});

router.delete("/agents/:id", async (req, res) => {
  const { id } = DeleteAgentParams.parse(req.params);
  await db.delete(agentsTable).where(eq(agentsTable.id, id));
  res.status(204).end();
});

router.post("/agents/:id/run", async (req, res) => {
  const { id } = RunAgentParams.parse(req.params);
  const body = RunAgentBody.parse(req.body);
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const user = (req as any).user;
  let citations: Awaited<ReturnType<typeof buildRagContext>>["citations"] = [];
  let context = "";
  if (body.useWorkspaceContext) {
    const r = await buildRagContext(user.id, body.input);
    context = r.contextText;
    citations = r.citations;
  }

  const system = context
    ? `${agent.prompt}\n\nUse the following workspace context if relevant.\n\n--- CONTEXT ---\n${context}\n--- END CONTEXT ---`
    : agent.prompt;

  const output = await completeText({
    system,
    user: body.input,
  });

  res.json({ output, citations });
});

export default router;
