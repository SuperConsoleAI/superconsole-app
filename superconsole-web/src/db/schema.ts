import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
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
    logoUrl: text("logo_url"),
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
  logoUrl: text("logo_url"),
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
    logoUrl: text("logo_url"),
    // Desktop-managed project settings (no web UI; guarded read-only here).
    defaultRunMode: text("default_run_mode").notNull().default("cli"),
    defaultCli: text("default_cli").notNull().default("claude"),
    defaultProvider: text("default_provider").notNull().default("anthropic"),
    defaultModel: text("default_model").notNull().default(""),
    scriptSetup: text("script_setup").notNull().default(""),
    scriptRun: text("script_run").notNull().default(""),
    scriptTeardown: text("script_teardown").notNull().default(""),
    scriptAutoRun: integer("script_auto_run").notNull().default(0),
    repoUrl: text("repo_url").notNull().default(""),
    description: text("description").notNull().default(""),
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

export const accountConnectors = sqliteTable(
  "account_connectors",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    credentialsEncrypted: text("credentials_encrypted"),
    status: text("status").notNull().default("disconnected"),
    connectedBy: text("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("account_connectors_user_idx").on(t.userId),
    uniqueIndex("account_connectors_user_service_unq").on(t.userId, t.service),
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

// Phase 18 — Skills. Metadata only; skill content lives in workspace files
// (.superconsole/skills/*.md) on disk and is never stored in the DB.
export const projectSkillIndex = sqliteTable(
  "project_skill_index",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    tags: text("tags"),
    scope: text("scope").notNull().default("project"),
    active: text("active").notNull().default("1"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_skill_index_project_idx").on(t.projectId),
    uniqueIndex("project_skill_index_unq").on(t.projectId, t.skillName),
  ],
);

export const orgSkillIndex = sqliteTable(
  "org_skill_index",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    tags: text("tags"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("org_skill_index_org_idx").on(t.orgId),
    uniqueIndex("org_skill_index_unq").on(t.orgId, t.skillName),
  ],
);

// SuperConsole-owned agent catalog. Files live in a public GitHub repo; this
// table holds the filterable metadata + the file manifest. No org scoping.
export const agentCatalog = sqliteTable(
  "agent_catalog",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    imageUrl: text("image_url"),
    skills: text("skills"),
    connectors: text("connectors"),
    tags: text("tags"),
    repo: text("repo").notNull(),
    gitRef: text("git_ref").notNull().default("main"),
    basePath: text("base_path").notNull(),
    files: text("files").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("agent_catalog_name_unq").on(t.name)],
);

export const projectMemoryIndex = sqliteTable(
  "project_memory_index",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    slug: text("slug").notNull(),
    title: text("title"),
    summary: text("summary"),
    tags: text("tags"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_memory_index_project_idx").on(t.projectId),
    uniqueIndex("project_memory_index_unq").on(t.projectId, t.category, t.slug),
  ],
);

export const orgMemoryIndex = sqliteTable(
  "org_memory_index",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title"),
    body: text("body"),
    tags: text("tags"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("org_memory_index_org_idx").on(t.orgId),
    uniqueIndex("org_memory_index_unq").on(t.orgId, t.slug),
  ],
);

export const wikiIndex = sqliteTable(
  "wiki_index",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title"),
    summary: text("summary"),
    tags: text("tags"),
    content: text("content"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("wiki_index_project_idx").on(t.projectId),
    uniqueIndex("wiki_index_unq").on(t.projectId, t.slug),
  ],
);

// Phase 21: usage monitoring. One canonical schema reused by all three levels
// (project/org/account) so a single display path renders every level. These
// are the shared cross-machine/member totals; the desktop keeps a local mirror
// for fast display and pushes deltas here on session end. Raw per-session
// events stay on-device and never reach the cloud.
const usageColumns = () => ({
  id: text("id").primaryKey().notNull(),
  tokensPromptLifetime: integer("tokens_prompt_lifetime").notNull().default(0),
  tokensPromptCachedLifetime: integer("tokens_prompt_cached_lifetime")
    .notNull()
    .default(0),
  tokensCompletionLifetime: integer("tokens_completion_lifetime")
    .notNull()
    .default(0),
  tokensReasoningLifetime: integer("tokens_reasoning_lifetime")
    .notNull()
    .default(0),
  costLifetimeUsd: real("cost_lifetime_usd").notNull().default(0),
  sessionsLifetime: integer("sessions_lifetime").notNull().default(0),
  cacheHitsLifetime: integer("cache_hits_lifetime").notNull().default(0),
  analyticsLifetime: text("analytics_lifetime").notNull().default("{}"),
  usage24h: text("usage_24h").notNull().default("[]"),
  usage7d: text("usage_7d").notNull().default("[]"),
  usage30d: text("usage_30d").notNull().default("[]"),
  usage12m: text("usage_12m").notNull().default("[]"),
  byModel: text("by_model").notNull().default("{}"),
  byProvider: text("by_provider").notNull().default("{}"),
  byCli: text("by_cli").notNull().default("{}"),
  byMember: text("by_member").notNull().default("{}"),
  byProject: text("by_project").notNull().default("{}"),
  byOrg: text("by_org").notNull().default("{}"),
  heatmap365d: text("heatmap_365d").notNull().default("{}"),
  lastSyncedAt: text("last_synced_at"),
  updatedAt: updatedAt(),
});

export const projectUsage = sqliteTable("project_usage", usageColumns());
export const orgUsage = sqliteTable("org_usage", usageColumns());
export const accountUsage = sqliteTable("account_usage", usageColumns());
