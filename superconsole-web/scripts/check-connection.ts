import { config } from "dotenv";
import { createClient } from "@libsql/client";

config({ path: "../.env" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("TURSO_DATABASE_URL is not set (expected in ../.env)");
  process.exit(1);
}

const EXPECTED = [
  "users",
  "organizations",
  "org_members",
  "projects",
  "project_members",
  "connectors",
  "org_connectors",
  "project_llm_keys",
  "org_settings",
];

async function main() {
  const client = createClient({ url: url!, authToken });

  const ping = await client.execute("SELECT 1 AS ok");
  console.log("Connection OK:", ping.rows[0]);

  const res = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
  );
  const tables = res.rows.map((r) => String(r.name));
  console.log("Tables in Turso:", tables);

  const missing = EXPECTED.filter((t) => !tables.includes(t));
  if (missing.length > 0) {
    console.error("Missing expected tables:", missing);
    process.exit(1);
  }
  console.log(`All ${EXPECTED.length} expected tables present.`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
