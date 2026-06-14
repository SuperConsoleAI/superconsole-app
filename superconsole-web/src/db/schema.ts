import { sql } from "drizzle-orm";
import {
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => ulid());

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const users = sqliteTable(
  "users",
  {
    id: id(),
    workosId: text("workos_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_workos_id_unq").on(t.workosId),
    uniqueIndex("users_email_unq").on(t.email),
  ],
);

export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
});

export const orgMembers = sqliteTable(
  "org_members",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("org_members_user_idx").on(t.userId),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    localPathHint: text("local_path_hint"),
    createdAt: createdAt(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
  ],
);

export const orgInvitations = sqliteTable(
  "org_invitations",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("org_invitations_org_idx").on(t.orgId),
    uniqueIndex("org_invitations_org_email_unq").on(t.orgId, t.email),
  ],
);

export const projectInvitations = sqliteTable(
  "project_invitations",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("project_invitations_project_idx").on(t.projectId),
    uniqueIndex("project_invitations_project_email_unq").on(
      t.projectId,
      t.email,
    ),
  ],
);

export const connectors = sqliteTable(
  "connectors",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    credentialsEncrypted: text("credentials_encrypted"),
    scope: text("scope").notNull().default("project"),
    status: text("status").notNull().default("disconnected"),
    connectedBy: text("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("connectors_project_idx").on(t.projectId),
    uniqueIndex("connectors_project_service_unq").on(t.projectId, t.service),
  ],
);

export const orgConnectors = sqliteTable(
  "org_connectors",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    credentialsEncrypted: text("credentials_encrypted"),
    status: text("status").notNull().default("disconnected"),
    connectedBy: text("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("org_connectors_org_idx").on(t.orgId),
    uniqueIndex("org_connectors_org_service_unq").on(t.orgId, t.service),
  ],
);

export const projectLlmKeys = sqliteTable(
  "project_llm_keys",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    baseUrl: text("base_url"),
    model: text("model"),
    extraEnv: text("extra_env"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_llm_keys_project_idx").on(t.projectId),
    uniqueIndex("project_llm_keys_project_provider_unq").on(
      t.projectId,
      t.provider,
    ),
  ],
);

export const orgLlmKeys = sqliteTable(
  "org_llm_keys",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    baseUrl: text("base_url"),
    model: text("model"),
    extraEnv: text("extra_env"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("org_llm_keys_org_idx").on(t.orgId),
    uniqueIndex("org_llm_keys_org_provider_unq").on(t.orgId, t.provider),
  ],
);

export const accountLlmKeys = sqliteTable(
  "account_llm_keys",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    baseUrl: text("base_url"),
    model: text("model"),
    extraEnv: text("extra_env"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("account_llm_keys_user_idx").on(t.userId),
    uniqueIndex("account_llm_keys_user_provider_unq").on(t.userId, t.provider),
  ],
);

export const orgSettings = sqliteTable(
  "org_settings",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
);
