import "./load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { startJobQueueProcessor } from "./lib/job-queue";
import { startCloudImportProcessor } from "./lib/cloud-import-processor";
import { startNotionAgent } from "./lib/notion-agent";
import { initEmbeddingExtension } from "./lib/embed-init";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Initialize pgvector for semantic search (non-blocking)
void initEmbeddingExtension();

// Start job queue processor
const stopJobProcessor = startJobQueueProcessor();

// Start cloud import processor (handles Dropbox/Google Drive imports)
const stopCloudImportProcessor = startCloudImportProcessor();

// Start autonomous Notion agent
const stopNotionAgent = startNotionAgent();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("Shutting down server...");
  stopJobProcessor();
  stopCloudImportProcessor();
  stopNotionAgent();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down server...");
  stopJobProcessor();
  stopCloudImportProcessor();
  stopNotionAgent();
  process.exit(0);
});
