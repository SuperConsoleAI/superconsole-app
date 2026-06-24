#!/usr/bin/env node
// Push the 5 catalog tables directly to Turso via HTTP API.
// Run: node scripts/push-catalog-tables.mjs

const URL = "https://superconsole-superconsole.aws-us-east-1.turso.io";
const TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ";

const TABLES = [
  `CREATE TABLE IF NOT EXISTS connector_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    oauth_url TEXT,
    api_key_fields TEXT NOT NULL DEFAULT '[]',
    docs_url TEXT,
    icon_url TEXT,
    scope TEXT NOT NULL DEFAULT 'project',
    install_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS mcp_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT NOT NULL,
    github_url TEXT NOT NULL,
    install_command TEXT NOT NULL,
    install_args TEXT NOT NULL DEFAULT '[]',
    required_env_vars TEXT NOT NULL DEFAULT '[]',
    icon_url TEXT,
    docs_url TEXT,
    install_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS commands_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slash TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT NOT NULL,
    github_url TEXT NOT NULL,
    content TEXT,
    icon_url TEXT,
    install_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS hooks_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    hook_type TEXT NOT NULL,
    github_url TEXT NOT NULL,
    content TEXT,
    icon_url TEXT,
    install_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    icon_url TEXT,
    docs_url TEXT,
    github_url TEXT,
    category TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'project',
    skill_ids TEXT NOT NULL DEFAULT '[]',
    agent_ids TEXT NOT NULL DEFAULT '[]',
    mcp_ids TEXT NOT NULL DEFAULT '[]',
    command_ids TEXT NOT NULL DEFAULT '[]',
    hook_ids TEXT NOT NULL DEFAULT '[]',
    connector_ids TEXT NOT NULL DEFAULT '[]',
    skills_url TEXT,
    commands_url TEXT,
    hooks_url TEXT,
    connector_auth TEXT NOT NULL DEFAULT '[]',
    install_count INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS installed_plugins (
    id TEXT PRIMARY KEY NOT NULL,
    plugin_id TEXT NOT NULL REFERENCES plugins(id),
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    installed_by TEXT NOT NULL,
    version TEXT NOT NULL
  )`,
];

async function exec(sql) {
  const res = await fetch(`${URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql } }, { type: "close" }],
    }),
  });
  const json = await res.json();
  if (!res.ok || json.results?.[0]?.type === "error") {
    throw new Error(JSON.stringify(json.results?.[0]?.error ?? json));
  }
  return json;
}

for (const sql of TABLES) {
  const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? "?";
  process.stdout.write(`Creating ${name}... `);
  try {
    await exec(sql);
    console.log("✓");
  } catch (e) {
    console.log("✗", e.message);
  }
}
console.log("Done.");
