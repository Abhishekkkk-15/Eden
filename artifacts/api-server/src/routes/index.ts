import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pagesRouter from "./pages";
import blocksRouter from "./blocks";
import sourcesRouter from "./sources";
import searchRouter from "./search";
import chatRouter from "./chat";
import agentsRouter from "./agents";
import dashboardRouter from "./dashboard";
import workflowsRouter from "./workflows";
import authRouter from "./auth";
import { authenticate } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);

// Protect all following routes
router.use(authenticate);

router.use(pagesRouter);
router.use(blocksRouter);
router.use(sourcesRouter);
router.use(searchRouter);
router.use(chatRouter);
router.use(agentsRouter);
router.use(dashboardRouter);
router.use(workflowsRouter);

export default router;
