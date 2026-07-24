import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "./turso";
import { decrypt, encrypt } from "./crypto";
import { ensureUser } from "./data";
import type { SessionUser } from "./auth";
import { connectorDef, type ConnectorScope } from "../connector-registry";
import {
  accountConnectors,
  connectors,
  orgConnectors,
  orgMembers,
  projects,
} from "../db/schema";

export interface ConnectorFieldValue {
  key: string;
  secret: boolean;
  value: string | null;
  hasValue: boolean;
}

export interface ConnectorView {
  service: string;
  status: string | null;
  fields: ConnectorFieldValue[];
}

type Db = ReturnType<typeof getDb>;

// scope -> (table, id column, insert id field). All three share the same
// service / credentials_encrypted / status columns.
function table(scope: ConnectorScope) {
  switch (scope) {
    case "account":
      return {
        t: accountConnectors,
        col: accountConnectors.userId,
        idField: "userId" as const,
      };
    case "org":
      return {
        t: orgConnectors,
        col: orgConnectors.orgId,
        idField: "orgId" as const,
      };
    case "project":
      return {
        t: connectors,
        col: connectors.projectId,
        idField: "projectId" as const,
      };
  }
}

async function isOrgMember(db: Db, userId: string, orgId: string) {
  const rows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Authorize the caller for this scope and return the effective scope id.
async function authorize(
  db: Db,
  userId: string,
  scope: ConnectorScope,
  scopeId: string,
): Promise<string> {
  if (scope === "account") return userId;
  if (scope === "org") {
    if (!(await isOrgMember(db, userId, scopeId)))
      throw new Error("Not a member of this organization");
    return scopeId;
  }
  const proj = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, scopeId))
    .limit(1);
  if (proj.length === 0) throw new Error("Project not found");
  if (!(await isOrgMember(db, userId, proj[0].orgId)))
    throw new Error("Not a member of this project's organization");
  return scopeId;
}

async function parseBlob(
  encrypted: string | null,
): Promise<Record<string, string>> {
  if (!encrypted) return {};
  try {
    const plain = await decrypt(encrypted);
    const obj = JSON.parse(plain);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function viewFromBlob(
  service: string,
  status: string | null,
  blob: Record<string, string>,
): ConnectorView | null {
  const def = connectorDef(service);
  if (!def) return null;
  return {
    service,
    status,
    fields: def.fields.map((f) => {
      const v = blob[f.key];
      const has = typeof v === "string" && v.length > 0;
      return {
        key: f.key,
        secret: f.secret,
        value: f.secret ? null : has ? v : null,
        hasValue: has,
      };
    }),
  };
}

export async function listConnectors(
  user: SessionUser,
  scope: ConnectorScope,
  scopeId: string,
): Promise<ConnectorView[]> {
  const db = getDb();
  const userId = await ensureUser(user);
  const id = await authorize(db, userId, scope, scopeId);
  const { t, col } = table(scope);

  const rows = await db
    .select({
      service: t.service,
      status: t.status,
      enc: t.credentialsEncrypted,
    })
    .from(t)
    .where(eq(col, id))
    .orderBy(t.service);

  const out: ConnectorView[] = [];
  for (const r of rows) {
    const view = viewFromBlob(r.service, r.status, await parseBlob(r.enc));
    if (view) out.push(view);
  }
  return out;
}

export async function setConnector(
  user: SessionUser,
  scope: ConnectorScope,
  scopeId: string,
  service: string,
  fields: Record<string, string>,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const id = await authorize(db, userId, scope, scopeId);
  const def = connectorDef(service);
  if (!def) throw new Error(`Unknown service '${service}'`);
  if (!def.scopes.includes(scope))
    throw new Error(`${def.label} is not available at the ${scope} level`);
  const { t, col, idField } = table(scope);

  const existingRows = await db
    .select({ enc: t.credentialsEncrypted })
    .from(t)
    .where(and(eq(col, id), eq(t.service, service)))
    .limit(1);
  const prev = await parseBlob(existingRows[0]?.enc ?? null);

  const blob: Record<string, string> = {};
  for (const f of def.fields) {
    const incoming = fields[f.key]?.trim();
    if (f.secret) {
      if (incoming) blob[f.key] = incoming;
      else if (prev[f.key]) blob[f.key] = prev[f.key];
    } else if (incoming) {
      blob[f.key] = incoming;
    }
  }
  if (Object.keys(blob).length === 0)
    throw new Error("Enter at least one credential");

  const encrypted = await encrypt(JSON.stringify(blob));
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const values: Record<string, unknown> = {
    id: ulid(),
    [idField]: id,
    service,
    credentialsEncrypted: encrypted,
    status: "connected",
    connectedBy: userId,
    updatedAt: now,
  };
  if (scope === "project") values.scope = "project";

  await db
    .insert(t)
    .values(values as typeof t.$inferInsert)
    .onConflictDoUpdate({
      target: [col, t.service],
      set: {
        credentialsEncrypted: encrypted,
        status: "connected",
        connectedBy: userId,
        updatedAt: now,
      },
    });
}

export async function deleteConnector(
  user: SessionUser,
  scope: ConnectorScope,
  scopeId: string,
  service: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const id = await authorize(db, userId, scope, scopeId);
  const { t, col } = table(scope);
  await db.delete(t).where(and(eq(col, id), eq(t.service, service)));
}

// ─── Test before save ─────────────────────────────────────────────────────────

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  details?: string;
}

function ok(message: string, details?: string): ConnectorTestResult {
  return { success: true, message, details };
}
function fail(message: string): ConnectorTestResult {
  return { success: false, message };
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnectorCredentials(
  service: string,
  credentials: Record<string, string>,
): Promise<ConnectorTestResult> {
  const f = (key: string) => credentials[key] ?? "";

  try {
    switch (service) {
      case "supabase": {
        const url = f("url").replace(/\/$/, "");
        const key = f("service_role_key");
        if (!url || !key) return fail("URL and service role key are required");
        const r = await fetchWithTimeout(`${url}/rest/v1/`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (r.ok || r.status === 404) return ok("Connected to Supabase");
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Unexpected status: ${r.status}`);
      }

      case "github": {
        const token = f("token");
        if (!token) return fail("Token is required");
        const r = await fetchWithTimeout("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "SuperConsole" },
        });
        if (r.ok) {
          const body = await r.json();
          return ok(`Connected as @${body.login}`, `GitHub user: ${body.login}`);
        }
        if (r.status === 401) return fail("Invalid token");
        return fail(`GitHub error: ${r.status}`);
      }

      case "shopify": {
        const raw = f("shop_domain").replace(/\/$/, "");
        const apiKey = f("api_key");
        if (!raw || !apiKey) return fail("Shop domain and API key are required");
        const domain = raw.includes(".") ? raw : `${raw}.myshopify.com`;
        const r = await fetchWithTimeout(
          `https://${domain}/admin/api/2024-01/shop.json`,
          { headers: { "X-Shopify-Access-Token": apiKey } },
        );
        if (r.ok) {
          const body = await r.json();
          return ok("Connected to Shopify", `Store: ${body.shop?.name ?? "Unknown"}`);
        }
        if (r.status === 401) return fail("Invalid API key");
        if (r.status === 404) return fail("Shop domain not found");
        return fail(`Shopify error: ${r.status}`);
      }

      case "slack": {
        const token = f("bot_token");
        if (!token) return fail("Bot token is required");
        const r = await fetchWithTimeout("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const body = await r.json();
          if (body.ok) return ok("Connected to Slack", `${body.user} in ${body.team}`);
          return fail(`Slack error: ${body.error ?? "unknown"}`);
        }
        return fail(`Slack error: ${r.status}`);
      }

      case "notion": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://api.notion.com/v1/users/me", {
          headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28" },
        });
        if (r.ok) {
          const body = await r.json();
          return ok("Connected to Notion", `User: ${body.name ?? "Unknown"}`);
        }
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Notion error: ${r.status}`);
      }

      case "linear": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ viewer { id name email } }" }),
        });
        if (r.ok) {
          const body = await r.json();
          return ok("Connected to Linear", `User: ${body.data?.viewer?.name ?? "Unknown"}`);
        }
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Linear error: ${r.status}`);
      }

      case "stripe": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (r.ok) {
          const mode = apiKey.startsWith("sk_live_") ? "live" : "test";
          return ok("Connected to Stripe", `Mode: ${mode}`);
        }
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Stripe error: ${r.status}`);
      }

      case "beehiiv": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://api.beehiiv.com/v2/publications", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (r.ok) return ok("Connected to Beehiiv");
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Beehiiv error: ${r.status}`);
      }

      case "telegram": {
        const token = f("bot_token");
        if (!token) return fail("Bot token is required");
        const r = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`);
        if (r.ok) {
          const body = await r.json();
          if (body.ok) return ok("Connected to Telegram", `Bot: @${body.result?.username ?? "bot"}`);
          return fail("Invalid bot token");
        }
        return fail("Invalid bot token");
      }

      case "tavily":
      case "web_search": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1 }),
        });
        if (r.ok) return ok("Connected to Tavily");
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Tavily error: ${r.status}`);
      }

      case "turso": {
        const dbUrl = f("url");
        const authToken = f("auth_token");
        if (!dbUrl || !authToken) return fail("Database URL and auth token are required");
        // libsql:// is the native protocol; the HTTP pipeline needs https://
        const httpUrl = dbUrl.replace(/\/$/, "").replace(/^libsql:\/\//, "https://");
        const r = await fetchWithTimeout(`${httpUrl}/v2/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [{ type: "execute", stmt: { sql: "SELECT 1" } }],
          }),
        });
        if (r.ok) return ok("Connected to Turso");
        if (r.status === 401) return fail("Invalid auth token");
        return fail(`Turso error: ${r.status}`);
      }

      case "airtable": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://api.airtable.com/v0/meta/whoami", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (r.ok) return ok("Connected to Airtable");
        if (r.status === 401) return fail("Invalid API key");
        return fail(`Airtable error: ${r.status}`);
      }

      case "convertkit": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout(
          `https://api.convertkit.com/v3/account?api_key=${apiKey}`,
        );
        if (r.ok) return ok("Connected to ConvertKit");
        if (r.status === 401) return fail("Invalid API key");
        return fail(`ConvertKit error: ${r.status}`);
      }

      case "gmail": {
        const apiKey = f("api_key");
        if (!apiKey) return fail("API key is required");
        const r = await fetchWithTimeout("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (r.ok) {
          const body = await r.json();
          return ok("Connected to Gmail", `Account: ${body.email ?? "unknown"}`);
        }
        if (r.status === 401) return fail("Invalid or expired token");
        return fail(`Gmail error: ${r.status}`);
      }

      default:
        return ok("No test available for this connector — credentials saved as-is");
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return fail("Connection timed out");
    return fail(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

