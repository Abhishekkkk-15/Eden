import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

console.log("[Redis] Client initialized");
