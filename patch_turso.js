import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  try {
    await client.execute(`DROP TABLE plugins`);
    console.log("plugins dropped");
  } catch (e) {
    console.error(e);
  }
}
run();
