import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pagesRouter from "./pages";
import blocksRouter from "./blocks";
import sourcesRouter from "./sources";
import searchRouter from "./search";
import chatRouter from "./chat";
import agentsRouter from "./agents";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pagesRouter);
router.use(blocksRouter);
router.use(sourcesRouter);
router.use(searchRouter);
router.use(chatRouter);
router.use(agentsRouter);
router.use(dashboardRouter);

export default router;
