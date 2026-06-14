import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "./turso";
import { encrypt } from "./crypto";
import { ensureUser } from "./data";
import type { SessionUser } from "./auth";
import {
  accountLlmKeys,
  orgLlmKeys,
  orgMembers,
  projectLlmKeys,
  projects,
} from "../db/schema";

export type LlmScope = "account" | "org" | "project";

export interface LlmKeyRow {
  provider: string;
  hasKey: boolean;
  baseUrl: string | null;
  model: string | null;
  extraEnv: string | null;
  updatedAt: string;
}

export interface LlmKeyInput {
  provider: string;
  apiKey: string;
  baseUrl: string | null;
  model: string | null;
  extraEnv: string | null;
}

type Db = ReturnType<typeof getDb>;

function table(scope: LlmScope) {
  switch (scope) {
    case "account":
      return { t: accountLlmKeys, col: accountLlmKeys.userId };
    case "org":
      return { t: orgLlmKeys, col: orgLlmKeys.orgId };
    case "project":
      return { t: projectLlmKeys, col: projectLlmKeys.projectId };
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

// Resolve and authorize the effective scope id for this user.
async function authorize(
  db: Db,
  userId: string,
  scope: LlmScope,
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

export async function listLlmKeys(
  user: SessionUser,
  scope: LlmScope,
  scopeId: string,
): Promise<LlmKeyRow[]> {
  const db = getDb();
  const userId = await ensureUser(user);
  const id = await authorize(db, userId, scope, scopeId);
  const { t, col } = table(scope);

  const rows = await db
    .select({
      provider: t.provider,
      apiKeyEncrypted: t.apiKeyEncrypted,
      baseUrl: t.baseUrl,
      model: t.model,
      extraEnv: t.extraEnv,
      updatedAt: t.updatedAt,
    })
    .from(t)
    .where(eq(col, id))
    .orderBy(t.provider);

  return rows.map((r) => ({
    provider: r.provider,
    hasKey: !!r.apiKeyEncrypted && r.apiKeyEncrypted.length > 0,
    baseUrl: r.baseUrl,
    model: r.model,
    extraEnv: r.extraEnv,
    updatedAt: r.updatedAt,
  }));
}

export async function setLlmKey(
  user: SessionUser,
  scope: LlmScope,
  scopeId: string,
  input: LlmKeyInput,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const id = await authorize(db, userId, scope, scopeId);
  const { t, col } = table(scope);

  const baseUrl = input.baseUrl?.trim() || null;
  const model = input.model?.trim() || null;
  const extraEnv = input.extraEnv?.trim() || null;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const update: Record<string, unknown> = {
    baseUrl,
    model,
    extraEnv,
    updatedAt: now,
  };
  const encrypted =
    input.apiKey.trim().length > 0 ? await encrypt(input.apiKey.trim()) : null;
  if (encrypted !== null) update.apiKeyEncrypted = encrypted;

  await db
    .insert(t)
    .values({
      id: ulid(),
      [scope === "account" ? "userId" : scope === "org" ? "orgId" : "projectId"]:
        id,
      provider: input.provider,
      apiKeyEncrypted: encrypted,
      baseUrl,
      model,
      extraEnv,
      updatedAt: now,
    } as typeof t.$inferInsert)
    .onConflictDoUpdate({ target: [col, t.provider], set: update });
}

export async function deleteLlmKey(
  user: SessionUser,
  scope: LlmScope,
  scopeId: string,
  provider: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const id = await authorize(db, userId, scope, scopeId);
  const { t, col } = table(scope);
  await db.delete(t).where(and(eq(col, id), eq(t.provider, provider)));
}
