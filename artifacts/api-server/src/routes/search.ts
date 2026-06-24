import { Router, type IRouter } from "express";
import { SearchWorkspaceQueryParams } from "../lib/validation";
import { searchWorkspace } from "../lib/rag";

const router: IRouter = Router();

router.get("/search", async (req, res) => {
  const user = (req as any).user;
  const { q } = SearchWorkspaceQueryParams.parse(req.query);
  const hits = await searchWorkspace(user.id, q, 20);
  res.json(hits);
});

export default router;
