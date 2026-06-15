import { and, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "./turso";
import type { SessionUser } from "./auth";
import {
  connectors,
  orgConnectors,
  orgInvitations,
  orgMembers,
  organizations,
  projectInvitations,
  projectMembers,
  projects,
  users,
} from "../db/schema";

export interface OrgSummary {
  id: string;
  name: string;
  plan: string;
  role: string;
  logoUrl: string | null;
}

export interface ConnectorSummary {
  id: string;
  service: string;
  status: string;
  scope: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  localPathHint: string | null;
  logoUrl: string | null;
  connectors: ConnectorSummary[];
}

type Db = ReturnType<typeof getDb>;

async function loadOrgs(db: Db, userId: string): Promise<OrgSummary[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
      role: orgMembers.role,
      logoUrl: organizations.logoUrl,
    })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .orderBy(organizations.name);
}

// Match pending invitations by email and convert them into memberships.
// Mirrors auth::accept_pending_invitations on the desktop.
async function acceptPendingInvitations(
  db: Db,
  userId: string,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const orgInvites = await db
    .select({ id: orgInvitations.id, orgId: orgInvitations.orgId, role: orgInvitations.role })
    .from(orgInvitations)
    .where(
      and(
        eq(orgInvitations.email, normalized),
        eq(orgInvitations.status, "pending"),
      ),
    );
  for (const inv of orgInvites) {
    await db
      .insert(orgMembers)
      .values({ orgId: inv.orgId, userId, role: inv.role })
      .onConflictDoNothing();
    await db
      .update(orgInvitations)
      .set({ status: "accepted" })
      .where(eq(orgInvitations.id, inv.id));
  }

  const projectInvites = await db
    .select({
      id: projectInvitations.id,
      projectId: projectInvitations.projectId,
      role: projectInvitations.role,
    })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.email, normalized),
        eq(projectInvitations.status, "pending"),
      ),
    );
  for (const inv of projectInvites) {
    await db
      .insert(projectMembers)
      .values({ projectId: inv.projectId, userId, role: inv.role })
      .onConflictDoNothing();
    await db
      .update(projectInvitations)
      .set({ status: "accepted" })
      .where(eq(projectInvitations.id, inv.id));
  }
}

// Ensure the WorkOS user exists in Turso and has at least one org. Mirrors the
// desktop upsert so the web portal works for users who sign in here first.
export async function ensureUser(user: SessionUser): Promise<string> {
  const db = getDb();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.workosId, user.workosId))
    .limit(1);

  let userId: string;
  if (existing.length > 0) {
    userId = existing[0].id;
    if (user.profilePictureUrl) {
      await db
        .update(users)
        .set({ logoUrl: user.profilePictureUrl })
        .where(eq(users.id, userId));
    }
  } else {
    userId = ulid();
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
    await db.insert(users).values({
      id: userId,
      workosId: user.workosId,
      email: user.email,
      name,
      logoUrl: user.profilePictureUrl ?? null,
    });
  }

  await acceptPendingInvitations(db, userId, user.email);

  const orgs = await loadOrgs(db, userId);
  if (orgs.length === 0) {
    const orgId = ulid();
    await db
      .insert(organizations)
      .values({ id: orgId, name: "Personal", plan: "free", ownerId: userId });
    await db
      .insert(orgMembers)
      .values({ orgId, userId, role: "owner" });
  }

  return userId;
}

export interface DashboardData {
  user: { email: string; name: string | null; logoUrl: string | null };
  orgs: OrgSummary[];
  activeOrg: OrgSummary | null;
  projects: ProjectSummary[];
  orgConnectors: ConnectorSummary[];
}

export async function loadDashboard(
  user: SessionUser,
  requestedOrgId?: string,
): Promise<DashboardData> {
  const db = getDb();
  const userId = await ensureUser(user);
  const orgs = await loadOrgs(db, userId);

  const userRow = await db
    .select({ logoUrl: users.logoUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  const activeOrg =
    orgs.find((o) => o.id === requestedOrgId) ?? orgs[0] ?? null;

  let projectList: ProjectSummary[] = [];
  let orgConnectorList: ConnectorSummary[] = [];

  if (activeOrg) {
    const projectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        localPathHint: projects.localPathHint,
        logoUrl: projects.logoUrl,
      })
      .from(projects)
      .where(eq(projects.orgId, activeOrg.id))
      .orderBy(projects.name);

    const projectIds = projectRows.map((p) => p.id);
    const connectorRows = projectIds.length
      ? await db
          .select({
            id: connectors.id,
            projectId: connectors.projectId,
            service: connectors.service,
            status: connectors.status,
            scope: connectors.scope,
          })
          .from(connectors)
          .where(inArray(connectors.projectId, projectIds))
      : [];

    projectList = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      localPathHint: p.localPathHint,
      logoUrl: p.logoUrl,
      connectors: connectorRows
        .filter((c) => c.projectId === p.id)
        .map((c) => ({
          id: c.id,
          service: c.service,
          status: c.status,
          scope: c.scope,
        })),
    }));

    orgConnectorList = await db
      .select({
        id: orgConnectors.id,
        service: orgConnectors.service,
        status: orgConnectors.status,
      })
      .from(orgConnectors)
      .where(eq(orgConnectors.orgId, activeOrg.id))
      .then((rows) =>
        rows.map((c) => ({
          id: c.id,
          service: c.service,
          status: c.status,
          scope: "org",
        })),
      );
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;

  return {
    user: { email: user.email, name: displayName, logoUrl: userRow?.logoUrl ?? null },
    orgs,
    activeOrg,
    projects: projectList,
    orgConnectors: orgConnectorList,
  };
}
