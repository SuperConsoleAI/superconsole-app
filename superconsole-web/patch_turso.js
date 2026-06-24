import { createClient } from "@libsql/client";

const client = createClient({
  url: "libsql://superconsole-superconsole.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ",
});

async function run() {
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS \`plugins\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`description\` text NOT NULL,
	\`author\` text NOT NULL,
	\`version\` text DEFAULT '1.0.0' NOT NULL,
	\`icon_url\` text,
	\`docs_url\` text,
	\`github_url\` text,
	\`category\` text NOT NULL,
	\`scope\` text DEFAULT 'project' NOT NULL,
	\`skill_ids\` text DEFAULT '[]' NOT NULL,
	\`agent_ids\` text DEFAULT '[]' NOT NULL,
	\`mcp_ids\` text DEFAULT '[]' NOT NULL,
	\`command_ids\` text DEFAULT '[]' NOT NULL,
	\`hook_ids\` text DEFAULT '[]' NOT NULL,
	\`connector_ids\` text DEFAULT '[]' NOT NULL,
	\`skills_url\` text DEFAULT '[]' NOT NULL,
	\`commands_url\` text DEFAULT '[]' NOT NULL,
	\`hooks_url\` text DEFAULT '[]' NOT NULL,
	\`mcp_url\` text DEFAULT '[]' NOT NULL,
	\`connector_auth\` text DEFAULT '[]' NOT NULL,
	\`featured\` integer DEFAULT 0 NOT NULL,
	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);`);
    console.log("plugins created");
  } catch (e) {
    console.error(e);
  }
}
run();
