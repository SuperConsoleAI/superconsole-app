import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "cloudflare:workers";
import * as schema from "../db/schema";

// @libsql/client/web is the HTTP-only client required on Cloudflare Workers
// (no native bindings). Same Turso DB + schema as 7a.
export function getDb() {
  const url = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, "https://");
  const client = createClient({ url, authToken: env.TURSO_AUTH_TOKEN });
  return drizzle(client, { schema });
}
