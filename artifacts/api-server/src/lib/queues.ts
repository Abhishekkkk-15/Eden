import { Queue } from "bullmq";
import { redis } from "./redis";

export const CLOUD_IMPORT_QUEUE = "cloud_import";
export const AI_JOB_QUEUE = "ai_job";

const queueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
};

export const cloudImportQueue = new Queue(CLOUD_IMPORT_QUEUE, queueOptions);
export const aiJobQueue = new Queue(AI_JOB_QUEUE, queueOptions);

console.log("[Queues] BullMQ queues initialized");
