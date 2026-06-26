import { Router, type IRouter } from "express";
import healthRouter from "./modules/health/health.routes";
import pagesRouter from "./modules/pages/pages.routes";
import blocksRouter from "./modules/blocks/blocks.routes";
import sourcesRouter from "./modules/sources/sources.routes";
import searchRouter from "./modules/search/search.routes";
import chatRouter from "./modules/chat/chat.routes";
import agentsRouter from "./modules/agents/agents.routes";
import dashboardRouter from "./modules/dashboard/dashboard.routes";
import workflowsRouter from "./modules/workflows/workflows.routes";
import cloudIntegrationsRouter from "./modules/integrations/cloud-integrations.routes";
import settingsRouter from "./modules/settings/settings.routes";
import authRouter from "./modules/auth/auth.routes";
import { authenticate } from "./middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);

// Cloud integrations OAuth routes (must be public for callbacks)
router.use(cloudIntegrationsRouter);

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
router.use("/settings", settingsRouter);

export default router;
