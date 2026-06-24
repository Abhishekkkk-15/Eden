import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/media", express.static(path.resolve(import.meta.dirname, "..", "uploads")));

app.use("/api", router);

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const e = err as { name?: string; message?: string; status?: number; issues?: unknown };
    if (e?.name === "ZodError") {
      req.log.warn({ err }, "validation failed");
      res.status(400).json({ error: "Invalid request", issues: e.issues });
      return;
    }
    req.log.error({ err }, "unhandled error");
    res
      .status(typeof e?.status === "number" ? e.status : 500)
      .json({ error: e?.message ?? "Internal server error" });
  },
);

export default app;
