import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../.env" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("TURSO_DATABASE_URL is not set (expected in ../.env)");
}

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url, authToken },
  verbose: true,
  strict: true,
});
