const { createClient } = require("@libsql/client");

const client = createClient({
  url: "libsql://superconsole-superconsole.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ",
});

async function run() {
  try {
    await client.execute(`DROP TABLE IF EXISTS mcp_catalog`);
    await client.execute(`
      CREATE TABLE mcp_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'stdio',
        url TEXT,
        command TEXT,
        args TEXT NOT NULL DEFAULT '[]',
        env TEXT NOT NULL DEFAULT '{}',
        required_env_vars TEXT NOT NULL DEFAULT '[]',
        github_url TEXT,
        icon_url TEXT,
        docs_url TEXT,
        install_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log("Recreated mcp_catalog table in Turso");
  } catch (e) {
    console.error(e);
  }
}
run();
