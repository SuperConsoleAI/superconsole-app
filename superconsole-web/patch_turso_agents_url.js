import { createClient } from "@libsql/client";

const client = createClient({
  url: "libsql://superconsole-superconsole.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ",
});

async function run() {
  try {
    console.log("Adding agents_url to plugins...");
    await client.execute(`ALTER TABLE plugins ADD COLUMN agents_url text DEFAULT '[]' NOT NULL;`);
    console.log("Adding agents_url to installed_plugins...");
    await client.execute(`ALTER TABLE installed_plugins ADD COLUMN agents_url text DEFAULT '[]' NOT NULL;`);
    console.log("Done!");
  } catch (e) {
    console.error(e);
  }
}
run();
