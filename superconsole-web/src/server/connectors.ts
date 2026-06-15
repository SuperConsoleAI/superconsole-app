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
