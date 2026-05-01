import { Router, type IRouter } from "express";
import { SearchWorkspaceQueryParams } from "@workspace/api-zod";
import { searchWorkspace } from "../lib/rag";

const router: IRouter = Router();

router.get("/search", async (req, res) => {
  const { q } = SearchWorkspaceQueryParams.parse(req.query);
  const hits = await searchWorkspace(q, 20);
  res.json(hits);
});

export default router;
