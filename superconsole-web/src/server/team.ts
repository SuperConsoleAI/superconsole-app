import { and, eq, notInArray } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "./turso";
import { ensureUser } from "./data";
import type { SessionUser } from "./auth";
import {
  orgInvitations,
  orgMembers,
  projectMembers,
  projects,
  users,
} from "../db/schema";

export interface MemberRow {
  userId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: "active" | "invited";
}

const ORG_ROLES = ["owner", "admin", "member"];
const INVITE_ROLES = ["admin", "member"];
const PROJECT_ROLES = ["editor", "viewer"];

type Db = ReturnType<typeof getDb>;

async function orgRole(
  db: Db,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

// Owner/Admin may manage the team. Returns the caller's role.
async function requireManager(
  db: Db,
  orgId: string,
  userId: string,
): Promise<string> {
  const role = await orgRole(db, orgId, userId);
  if (!role) throw new Error("Not a member of this organization");
  if (role !== "owner" && role !== "admin")
    throw new Error("Only owners and admins can manage the team");
  return role;
}

async function countOwners(db: Db, orgId: string): Promise<number> {
  const rows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "owner")));
  return rows.length;
}

async function projectOrg(db: Db, projectId: string): Promise<string> {
  const rows = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (rows.length === 0) throw new Error("Project not found");
  return rows[0].orgId;
}

// --- Org members ---

export async function listOrgMembers(
  user: SessionUser,
  orgId: string,
): Promise<MemberRow[]> {
  const db = getDb();
  const userId = await ensureUser(user);
  if (!(await orgRole(db, orgId, userId)))
    throw new Error("Not a member of this organization");

  const active = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(users.email);

  const pending = await db
    .select({ email: orgInvitations.email, role: orgInvitations.role })
    .from(orgInvitations)
    .where(
      and(eq(orgInvitations.orgId, orgId), eq(orgInvitations.status, "pending")),
    )
    .orderBy(orgInvitations.email);

  return [
    ...active.map((m) => ({ ...m, status: "active" as const })),
    ...pending.map((p) => ({
      userId: null,
      email: p.email,
      name: null,
      role: p.role,
      status: "invited" as const,
    })),
  ];
}

export async function inviteOrgMember(
  user: SessionUser,
  orgId: string,
  email: string,
  role: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  await requireManager(db, orgId, userId);
  if (!INVITE_ROLES.includes(role)) throw new Error("Role must be admin or member");

  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw new Error("Enter a valid email address");

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (existing.length > 0) {
    const uid = existing[0].id;
    if (await orgRole(db, orgId, uid))
      throw new Error("This person is already a member");
    await db
      .insert(orgMembers)
      .values({ orgId, userId: uid, role })
      .onConflictDoNothing();
    return;
  }

  await db
    .insert(orgInvitations)
    .values({
      id: ulid(),
      orgId,
      email: normalized,
      role,
      status: "pending",
      invitedBy: userId,
    })
    .onConflictDoUpdate({
      target: [orgInvitations.orgId, orgInvitations.email],
      set: { role, status: "pending" },
    });
}

export async function updateOrgMemberRole(
  user: SessionUser,
  orgId: string,
  targetUserId: string,
  role: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const callerRole = await requireManager(db, orgId, userId);
  if (!ORG_ROLES.includes(role)) throw new Error("Invalid role");

  const targetRole = await orgRole(db, orgId, targetUserId);
  if (!targetRole) throw new Error("Member not found");

  if ((role === "owner" || targetRole === "owner") && callerRole !== "owner")
    throw new Error("Only an owner can change owner roles");
  if (
    targetRole === "owner" &&
    role !== "owner" &&
    (await countOwners(db, orgId)) <= 1
  )
    throw new Error("An organization must keep at least one owner");

  await db
    .update(orgMembers)
    .set({ role })
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)));
}

export async function removeOrgMember(
  user: SessionUser,
  orgId: string,
  targetUserId: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const callerRole = await requireManager(db, orgId, userId);

  const targetRole = await orgRole(db, orgId, targetUserId);
  if (!targetRole) throw new Error("Member not found");
  if (targetRole === "owner") {
    if (callerRole !== "owner")
      throw new Error("Only an owner can remove an owner");
    if ((await countOwners(db, orgId)) <= 1)
      throw new Error("An organization must keep at least one owner");
  }

  const orgProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.orgId, orgId));
  for (const p of orgProjects) {
    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, p.id),
          eq(projectMembers.userId, targetUserId),
        ),
      );
  }
  await db
    .delete(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)));
}

export async function cancelOrgInvitation(
  user: SessionUser,
  orgId: string,
  email: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  await requireManager(db, orgId, userId);
  await db
    .delete(orgInvitations)
    .where(
      and(
        eq(orgInvitations.orgId, orgId),
        eq(orgInvitations.email, email.trim().toLowerCase()),
      ),
    );
}

// --- Project members ---

export async function listProjectMembers(
  user: SessionUser,
  projectId: string,
): Promise<MemberRow[]> {
  const db = getDb();
  const userId = await ensureUser(user);
  const orgId = await projectOrg(db, projectId);
  if (!(await orgRole(db, orgId, userId)))
    throw new Error("Not a member of this project's organization");

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(users.email);
  return rows.map((m) => ({ ...m, status: "active" as const }));
}

export async function listAddableProjectMembers(
  user: SessionUser,
  projectId: string,
): Promise<MemberRow[]> {
  const db = getDb();
  const userId = await ensureUser(user);
  const orgId = await projectOrg(db, projectId);
  if (!(await orgRole(db, orgId, userId)))
    throw new Error("Not a member of this project's organization");

  const current = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const excludeIds = current.map((c) => c.userId);

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(
      excludeIds.length
        ? and(
            eq(orgMembers.orgId, orgId),
            notInArray(orgMembers.userId, excludeIds),
          )
        : eq(orgMembers.orgId, orgId),
    )
    .orderBy(users.email);
  return rows.map((m) => ({ ...m, status: "active" as const }));
}

export async function addProjectMember(
  user: SessionUser,
  projectId: string,
  targetUserId: string,
  role: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  if (!PROJECT_ROLES.includes(role))
    throw new Error("Role must be editor or viewer");
  const orgId = await projectOrg(db, projectId);
  await requireManager(db, orgId, userId);
  if (!(await orgRole(db, orgId, targetUserId)))
    throw new Error("User must be a member of the organization first");

  await db
    .insert(projectMembers)
    .values({ projectId, userId: targetUserId, role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role },
    });
}

export async function updateProjectMemberRole(
  user: SessionUser,
  projectId: string,
  targetUserId: string,
  role: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  if (!PROJECT_ROLES.includes(role))
    throw new Error("Role must be editor or viewer");
  const orgId = await projectOrg(db, projectId);
  await requireManager(db, orgId, userId);
  await db
    .update(projectMembers)
    .set({ role })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    );
}

export async function removeProjectMember(
  user: SessionUser,
  projectId: string,
  targetUserId: string,
): Promise<void> {
  const db = getDb();
  const userId = await ensureUser(user);
  const orgId = await projectOrg(db, projectId);
  await requireManager(db, orgId, userId);
  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    );
}
