import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const URL = "https://superconsole-superconsole.aws-us-east-1.turso.io";
const TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ";

// The hardcoded connectors array
const REGISTRY = [
  {
    id: "github",
    label: "GitHub",
    category: "integrations",
    fields: [{ key: "token", label: "Personal access token", secret: true }],
  },
  {
    id: "slack",
    label: "Slack",
    category: "integrations",
    oauthUrl: "https://superconsole.ai/api/oauth/slack",
  },
  {
    id: "google-workspace",
    label: "Google Workspace",
    category: "integrations",
    oauthUrl: "https://superconsole.ai/api/oauth/google",
  },
  {
    id: "figma",
    label: "Figma",
    category: "integrations",
    fields: [{ key: "api_key", label: "API Key", secret: true }],
  },
  {
    id: "notion",
    label: "Notion",
    category: "integrations",
    fields: [{ key: "api_key", label: "Integration Secret", secret: true }],
  },
  {
    id: "linear",
    label: "Linear",
    category: "integrations",
    fields: [{ key: "api_key", label: "API Key", secret: true }],
  },
  {
    id: "gitlab",
    label: "GitLab",
    category: "integrations",
    fields: [{ key: "token", label: "Access Token", secret: true }],
  },
  {
    id: "atlassian",
    label: "Atlassian (Jira/Confluence)",
    category: "integrations",
    fields: [
      { key: "email", label: "Email", secret: false },
      { key: "api_token", label: "API Token", secret: true },
    ],
  },
  {
    id: "supabase",
    label: "Supabase",
    category: "integrations",
    fields: [{ key: "access_token", label: "Access Token", secret: true }],
  },
  {
    id: "vercel",
    label: "Vercel",
    category: "integrations",
    fields: [{ key: "token", label: "Access Token", secret: true }],
  },
  {
    id: "pinecone",
    label: "Pinecone",
    category: "integrations",
    fields: [{ key: "api_key", label: "API Key", secret: true }],
  },
  {
    id: "snowflake",
    label: "Snowflake",
    category: "connectors",
    fields: [
      { key: "account", label: "Account Identifier", secret: false },
      { key: "username", label: "Username", secret: false },
      { key: "password", label: "Password", secret: true },
    ],
  },
  {
    id: "postgres",
    label: "PostgreSQL",
    category: "connectors",
    fields: [{ key: "connection_string", label: "Connection String", secret: true }],
  },
];

async function exec(sql, args) {
  const res = await fetch(`${URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args } }, { type: "close" }],
    }),
  });
  const json = await res.json();
  if (!res.ok || json.results?.[0]?.type === "error") {
    throw new Error(JSON.stringify(json.results?.[0]?.error ?? json));
  }
  return json;
}

async function run() {
  for (const c of REGISTRY) {
    const authType = c.oauthUrl ? "oauth" : "api_key";
    const apiKeyFields = c.fields ? JSON.stringify(c.fields) : "[]";
    const sql = `
      INSERT INTO connector_catalog 
        (id, name, description, category, auth_type, oauth_url, api_key_fields, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'project')
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, category=excluded.category,
        auth_type=excluded.auth_type, oauth_url=excluded.oauth_url,
        api_key_fields=excluded.api_key_fields
    `;
    const args = [
      { type: "text", value: c.id },
      { type: "text", value: c.label },
      { type: "text", value: `Official ${c.label} integration.` },
      { type: "text", value: c.category },
      { type: "text", value: authType },
      c.oauthUrl ? { type: "text", value: c.oauthUrl } : { type: "null" },
      { type: "text", value: apiKeyFields },
    ];

    process.stdout.write(`Seeding connector: ${c.id}... `);
    try {
      await exec(sql, args);
      console.log("✓");
    } catch (e) {
      console.log("✗", e.message);
    }
  }
  console.log("Done.");
}

run();
