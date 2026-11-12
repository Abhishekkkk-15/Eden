import { Router, type IRouter } from "express";
import { SearchWorkspaceQueryParams } from "../../validation/schemas";
import { searchWorkspace } from "../../infrastructure/rag";

const router: IRouter = Router();

router.get("/search", async (req, res) => {
  const user = (req as any).user;
  const { q, limit, mode, includeContent } = SearchWorkspaceQueryParams.parse(req.query);
  const hits = await searchWorkspace(user.id, q, { limit, mode, includeContent });
  res.json(hits);
});

export default router;
