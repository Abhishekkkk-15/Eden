import { config } from "dotenv";
import "./src/load-env";
import { defineConfig } from "drizzle-kit";
import path from "path";
config()

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
