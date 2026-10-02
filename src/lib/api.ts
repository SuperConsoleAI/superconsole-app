import { invoke } from "@tauri-apps/api/core";

export interface Workspace {
  id: number;
  name: string;
  path: string;
  cli: string;
  organization_id: number;
  org_id: string | null;
  created_at: string;
  project_id: string | null;
  default_run_mode: "cli" | "chat";
  default_cli: string;
  default_provider: string;
  default_model: string;
  script_setup: string;
  script_run: string;
  script_teardown: string;
  script_auto_run: boolean;
  repo_url: string;
  description: string;
  env_files: string;
}

export interface EnvEntry {
  key: string;
  value: string;
  comment: string | null;
  is_secret: boolean;
}

export interface GitStatus {
  branch: string;
  isDirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasRemote: boolean;
  hasCommits: boolean;
}

export interface FileDiff {
  path: string;
  status: string;
  insertions: number;
  deletions: number;
}

export interface GitDiff {
  summary: string;
  filesChanged: FileDiff[];
  insertions: number;
  deletions: number;
  totalFiles: number;
}

export interface GitPushResult {
  branch: string;
  prUrl?: string;
}


export interface WorkspaceUpdate {
  defaultRunMode: string;
  defaultCli: string;
  defaultProvider: string;
  defaultModel: string;
  scriptSetup: string;
  scriptRun: string;
  scriptTeardown: string;
  scriptAutoRun: boolean;
  repoUrl: string;
  description: string;
}

export type LlmScope = "account" | "org" | "project";

export interface LlmKeyView {
  provider: string;
  has_key: boolean;
  base_url: string | null;
  model: string | null;
  extra_env: string | null;
  updated_at: string | null;
}

export const LLM_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "local", label: "Local" },
] as const;

export interface Organization {
  id: number;
  org_id: string | null;
  name: string;
  created_at: string;
  logo_url?: string | null;
}

export interface AuthUser {
  id: string;
  workos_id: string;
  email: string;
  name: string | null;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  logo_url?: string | null;
  banner?: string | null;
  bio?: string | null;
  social?: string;
  theme?: string;
  is_active?: number;
  is_public?: number;
  show_team?: number;
  show_projects?: number;
  show_usage?: number;
  off_platform?: number;
}

export interface CloudOrg {
  id: string;
  name: string;
  plan: string;
  role: string;
  logo_url?: string | null;
}

export interface AuthInfo {
  user: AuthUser;
  orgs: CloudOrg[];
}

export interface SessionInfo {
  session_id: string;
  context_files: string[];
  env_loaded: boolean;
}

export interface SessionTab {
  id: string;
  cli: string;
  label: string;
  relPath?: string;
  preview?: boolean;
  dirty?: boolean;
  closeRequested?: boolean;
  resumeId?: string;
  initialInput?: string;
}

export interface FileEntry {
  name: string;
  rel_path: string;
  is_dir: boolean;
}

export interface Job {
  id: number;
  workspace_id: number;
  name: string;
  command: string;
  schedule: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  run_mode: "cli" | "chat" | "agent" | "auto";
  run_config: string;
  trigger_type: "cron" | "api" | "github";
  trigger_config: string;
  allowed_connectors: string;
  last_run_cost_usd: number;
  last_run_tokens: number;
  last_run_session_id: string | null;
  agent_id?: string | null;
  user_id?: string | null;
  // ── Loop system (Phase 25) ──
  /** JSON-encoded exit condition, or null/undefined for run-once. */
  exit_condition?: string | null;
  /** Hard retry cap. 1 = run-once (default). */
  max_attempts: number;
  /** How many attempts have fired for the current loop (reset on completion). */
  current_attempt: number;
}

/** Discriminated union for all supported exit condition types. */
export type ExitConditionType =
  | "command"
  | "inbox_approved"
  | "llm_score"
  | "contains"
  | "file_exists";

export interface ExitCondition {
  type: ExitConditionType;
  /** Shell command to run in workspace dir (type=command). Exit 0 = done. */
  command?: string;
  /** Substring to find in job output (type=contains). */
  text?: string;
  /** Relative file path to check for (type=file_exists). */
  path?: string;
  /** Minimum score to pass (type=llm_score). Default 4. */
  threshold?: number;
  /** Score scale upper bound (type=llm_score). Default 5. */
  max?: number;
  /** Scoring instructions for the LLM (type=llm_score). */
  prompt?: string;
}

export interface JobRunConfig {
  cli?: string;
  model?: string;
  provider?: string;
  agent?: string;
}

export interface JobTriggerConfig {
  cron?: string;
  repo?: string;
  event?: string;
  branch?: string;
}

export interface WorkspaceConnector {
  service: string;
  label: string;
  scope: "account" | "org" | "project";
}

export interface InboxItem {
  id: number;
  workspace_id: number;
  job_id: number | null;
  title: string;
  output: string;
  status: string;
  created_at: string;
}

export interface SessionLog {
  id: number;
  workspace_id: number;
  cli: string;
  started_at: string;
  ended_at: string | null;
  label: string | null;
  session_id: string;
  tokens_prompt?: number;
  tokens_completion?: number;
  tokens_reasoning?: number;
  cost_usd?: number;
  model?: string;
  provider?: string;
  user_id?: string | null;
  rate_prompt_per_1m?: number | null;
  rate_cached_per_1m?: number | null;
  rate_completion_per_1m?: number | null;
  rate_reasoning_per_1m?: number | null;
}

export interface SessionFeedItem {
  id: string;
  session_type: 'cli' | 'chat';
  workspace_id: number;
  workspace_name: string;
  cli: string;
  provider: string;
  model: string;
  last_message_preview: string;
  started_at: string;
  updated_at: string;
  tokens_total: number;
  cost_usd: number;
  job_id?: number;
  agent_id?: string;
  user_id?: string | null;
  resume_id: string;
  rate_prompt_per_1m?: number | null;
  rate_cached_per_1m?: number | null;
  rate_completion_per_1m?: number | null;
  rate_reasoning_per_1m?: number | null;
}

export interface CliSession {
  id: string;
  cli: string;
  workspace_path: string;
  file_path: string;
  size_bytes: number;
  modified_at: string;
  message_count: number;
  title?: string | null;
  preview?: string | null;
}

export interface CliSessionMessage {
  role: string;
  content: string;
  timestamp?: string | null;
  model?: string | null;
}

export interface Agent {
  name: string;
  description: string;
  skills: string[];
  connectors: string[];
  context: string[];
  instructions: string;
  folderPath: string;
  readme: string | null;
}

export interface CatalogAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  skills: string[];
  connectors: string[];
  tags: string[];
  version: number;
}

export interface CatalogAgentInput {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  skills: string[];
  connectors: string[];
  tags: string[];
  repo: string;
  gitRef: string;
  basePath: string;
  files: string[];
}

/// Local metadata row for a workspace agent (mirrors `agents` SQLite table).
export interface AgentRow {
  id: string;
  workspaceId: number;
  name: string;
  description: string;
  schedule: string;
  defaultRunMode: string;
  defaultCli: string;
  defaultProvider: string;
  defaultModel: string;
  skills: string;       // comma-separated skill names
  connectors: string;   // comma-separated connector service ids
  isActive: boolean;
  agentId: string | null;   // Turso cloud ULID, null until synced
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CLI_PRESETS = [
  { id: "claude", label: "Claude Code" },
  { id: "droid", label: "Droid" },
  { id: "antigravity", label: "Antigravity" },
  { id: "codex", label: "Codex" },
  { id: "warp", label: "Warp" },
  { id: "cursor", label: "Cursor" },
  { id: "opencode", label: "OpenCode" },
  { id: "grok", label: "Grok Build" },
] as const;

export interface ChatSession {
  id: string;
  workspace_id?: number | null;
  project_id: string;
  name: string | null;
  is_star: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_at: string | null;
  preview: string | null;
  first_user: string | null;
  provider: string | null;
  model: string | null;
  user_id?: string | null;
}

export interface ChatMessage {
  id: number;
  session_id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  user_id?: string | null;
  created_at: string;
}

export interface CompactResult {
  messagesBefore: number;
  messagesAfter: number;
}

// Phase 21: usage monitoring. One canonical aggregate shape is reused at every
// level (project/org/account) so a single display path renders all three.
export type UsageLevel = "project" | "org" | "user" | "account";

// A daily/hourly/monthly bucket inside a rolling window (usage_24h/7d/30d/12m).
export interface UsageBucket {
  date: string;
  tokens_prompt: number;
  tokens_completion: number;
  cost_usd: number;
  sessions: number;
}

// One year's totals inside analytics_lifetime, keyed by year (e.g. "2026").
export interface UsageYear {
  tokens_prompt: number;
  tokens_completion: number;
  cost_usd: number;
  sessions: number;
  cache_hits: number;
}

// One day in heatmap_365d, keyed by "YYYY-MM-DD".
export interface UsageHeatDay {
  cost_usd: number;
  sessions: number;
  tokens: number;
}

// Generic breakdown entry; fields present depend on the map (by_model carries
// provider, by_project carries name, etc.). All numeric fields are optional.
export interface UsageBreakdown {
  cost_usd?: number;
  sessions?: number;
  tokens?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  provider?: string;
  name?: string;
}

export interface UsageRow {
  id: string;
  tokens_prompt_lifetime: number;
  tokens_prompt_cached_lifetime: number;
  tokens_completion_lifetime: number;
  tokens_reasoning_lifetime: number;
  cost_lifetime_usd: number;
  sessions_lifetime: number;
  cache_hits_lifetime: number;
  analytics_lifetime: Record<string, UsageYear>;
  usage_24h: UsageBucket[];
  usage_7d: UsageBucket[];
  usage_30d: UsageBucket[];
  usage_12m: UsageBucket[];
  by_model: Record<string, UsageBreakdown>;
  by_provider: Record<string, UsageBreakdown>;
  by_cli: Record<string, UsageBreakdown>;
  by_member: Record<string, UsageBreakdown>;
  by_project: Record<string, UsageBreakdown>;
  by_org: Record<string, UsageBreakdown>;
  heatmap_365d: Record<string, UsageHeatDay>;
  updated_at?: string;
}

// Clean a stored model id for display, mirroring how chat.rs calls the provider.
// OpenRouter-routed models keep the full `vendor/model` id (that's what is sent,
// e.g. "google/gemini-3.5-flash"). Native providers drop the `vendor/` prefix,
// and Anthropic converts the dotted catalog id to the hyphenated native name
// (OpenAI/Gemini keep their dots). e.g. "anthropic/claude-opus-4.8" (anthropic)
// → "claude-opus-4-8", "openai/gpt-5.5" → "gpt-5.5".
export function modelDisplayName(
  model: string | null | undefined,
  provider?: string | null,
): string {
  if (!model) return "";
  if (provider === "openrouter") return model;
  const slash = model.indexOf("/");
  const vendor = slash >= 0 ? model.slice(0, slash) : "";
  const bare = slash >= 0 ? model.slice(slash + 1) : model;
  return vendor === "anthropic" ? bare.replace(/\./g, "-") : bare;
}

// Common models per provider; users can also type a custom model id.
export const CHAT_PROVIDERS = [
  {
    id: "openrouter",
    label: "OpenRouter",
    recommended: true,
    models: [
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-opus-4.1",
      "openai/gpt-5",
      "google/gemini-2.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o3"],
  },
  {
    id: "gemini",
    label: "Gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  {
    id: "local",
    label: "Local (Ollama)",
    models: ["llama3.2", "qwen2.5-coder", "deepseek-r1"],
  },
] as const;

export interface OpenrouterModel {
  id: string;
  name: string;
  context_length: number;
  prompt_price: number;
  completion_price: number;
  supports_reasoning: boolean;
  created: number;
}

export interface MemberView {
  user_id: string | null;
  email: string;
  name: string | null;
  role: string;
  status: "active" | "invited";
}

export const ORG_ROLES = [
  { id: "admin", label: "Admin" },
  { id: "member", label: "Member" },
] as const;

export const PROJECT_ROLES = [
  { id: "editor", label: "Editor" },
  { id: "viewer", label: "Viewer" },
] as const;

export type ConnectorScope = "account" | "project" | "org";

export type ConnectorCategory = "integrations" | "connectors";

const ALL_CONNECTOR_SCOPES: ConnectorScope[] = ["account", "org", "project"];

export interface ConnectorFieldDef {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  /** If true, this field is optional (form shows helper text instead of error). */
  optional?: boolean;
}

export interface ConnectorDef {
  id: string;
  label: string;
  category: ConnectorCategory;
  scopes: ConnectorScope[];
  fields: ConnectorFieldDef[];
  description?: string;
  docsUrl?: string;
}

export interface ConnectorFieldValue {
  key: string;
  secret: boolean;
  value: string | null;
  has_value: boolean;
}

export interface ConnectorView {
  service: string;
  status: string | null;
  fields: ConnectorFieldValue[];
}

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  details?: string;
}

// Hardcoded registry (API key / token only for Phase 17). Must mirror the
// service ids, field keys, and scopes in src-tauri/src/connectors.rs.
export const CONNECTOR_REGISTRY: ConnectorDef[] = [
  {
    id: "github",
    label: "GitHub",
    category: "integrations",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "token", label: "Personal access token", secret: true }],
  },
  {
    id: "slack",
    label: "Slack",
    category: "integrations",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "linear",
    label: "Linear",
    category: "integrations",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "gmail",
    label: "Gmail",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "email", label: "Email address", secret: false },
    ],
  },
  {
    id: "google_drive",
    label: "Google Drive",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "shopify",
    label: "Shopify",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      { key: "api_key", label: "Admin API token", secret: true },
      { key: "shop_domain", label: "Shop domain", secret: false, placeholder: "store.myshopify.com" },
    ],
  },
  {
    id: "beehiiv",
    label: "Beehiiv",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "publication_id", label: "Publication ID", secret: false },
    ],
  },
  {
    id: "convertkit",
    label: "ConvertKit",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "stripe",
    label: "Stripe",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "Secret key", secret: true }],
  },
  {
    id: "buffer",
    label: "Buffer",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "access_token", label: "Access token", secret: true }],
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      { key: "api_secret", label: "API secret", secret: true },
      { key: "measurement_id", label: "Measurement ID", secret: false },
    ],
  },
  {
    id: "turso",
    label: "Turso",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      { key: "auth_token", label: "Auth token", secret: true },
      { key: "url", label: "Database URL", secret: false, placeholder: "libsql://..." },
    ],
  },
  {
    id: "supabase",
    label: "Supabase",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      { key: "service_role_key", label: "Service role key", secret: true },
      { key: "url", label: "Project URL", secret: false },
    ],
  },
  {
    id: "notion",
    label: "Notion",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "Integration token", secret: true }],
  },
  {
    id: "airtable",
    label: "Airtable",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "telegram",
    label: "Telegram",
    category: "connectors",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      // bot_token: required at org level, optional at project level
      // (leave blank to inherit the org bot — Option A).
      // Fill it in to use a dedicated bot for this project (Option B).
      { key: "bot_token", label: "Bot Token", secret: true, optional: true },
      { key: "chat_id", label: "Chat ID", secret: false, placeholder: "-100123456789" },
      { key: "thread_id", label: "Message Thread ID", secret: false, optional: true },
      { key: "allowed_user_ids", label: "Allowed User IDs", secret: false, optional: true, placeholder: "Add Telegram user IDs separated by ," },
    ],
  },
  {
    id: "web_search",
    label: "Web Search",
    category: "integrations",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "Tavily API key", secret: true }],
  },
  // Composio — 1000+ tools via one connection (Gmail, GitHub, Slack, Notion, HubSpot…).
  // Injected as COMPOSIO_API_KEY env var in every PTY session where connected.
  {
    id: "composio",
    label: "Composio",
    category: "connectors",
    description: "1000+ tools via one connection — Gmail, GitHub, Slack, Notion, HubSpot and more",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [
      {
        key: "api_key",
        label: "Composio API Key",
        secret: true,
        placeholder: "From composio.dev → Settings → API Keys",
      },
    ],
    docsUrl: "https://docs.composio.dev",
  },
];

export interface Skill {
  name: string;
  description: string;
  tags: string[];
  scope: string;
  version: number;
  auto: boolean;
  active: boolean;
  file_path: string;
  source: string;
  author?: string;
  skill_catalog_id?: string;
}

export interface LibrarySkill {
  name: string;
  description: string;
  tags: string[];
  category: string;
  author?: string;
  body: string;
}

export interface OrgSkillView {
  name: string;
  tags: string[];
  in_library: boolean;
}

/** A saved session log file (.superconsole/sessions/YYYY-MM-DD-<slug>.md). */
export interface SessionLogFile {
  id: string;
  workspaceId: number;
  filePath: string;
  agentId?: string;
  sessionId?: string;
  date: string;
  agentName: string;
  model: string;
  costUsd: number;
  tokens: number;
  summary: string;
  cloudId?: string;
  userId?: string;
  createdAt: string;
}

/** An entry in the community skill catalog (Turso skill_catalog table). */
export interface CatalogSkillEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string;         // comma-separated
  githubUrl: string;
  readme: string;
  author: string;
  stars: number;
  syncedAt: string;
}

export interface MemoryEntry {
  category: string;
  slug: string;
  title: string;
  date: string;
  body: string;
  tags: string[];
  summary: string;
  source: string;
  author?: string;
  skill_catalog_id?: string;
}

export interface OrgMemoryEntry {
  slug: string;
  title: string;
  body: string;
  tags: string[];
}

export const MEMORY_CATEGORIES = [
  { id: "preferences", label: "Preferences" },
  { id: "decisions", label: "Decisions" },
  { id: "facts", label: "Key Facts" },
  { id: "patterns", label: "Patterns" },
  { id: "recent", label: "Recent Actions" },
] as const;

export interface WikiPage {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  updated: string;
  body: string;
  source: string;
  author?: string;
  skill_catalog_id?: string;
}

export interface ContextFile {
  name: string;
  slug: string;
  file_path: string;
  size_bytes: number;
  modified_at: string;
}

export interface SlashCommand {
  name: string;
  slash: string;
  description: string;
  file_path: string;
  source: string;
  author?: string;
  skill_catalog_id?: string;
}

export const SKILL_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "content", label: "Content" },
  { id: "research", label: "Research" },
  { id: "dev", label: "Dev" },
  { id: "ops", label: "Ops" },
] as const;

export const api = {
  authStatus: () => invoke<AuthInfo | null>("auth_status"),
  signIn: () => invoke<string>("sign_in"),
  signOut: () => invoke<void>("sign_out"),
  updateUserProfile: (params: {
    username?: string;
    fullName?: string;
    avatarUrl?: string;
    bio?: string;
    isPublic?: boolean;
    offPlatform?: boolean;
  }) =>
    invoke<AuthInfo>("update_user_profile", {
      username: params.username,
      fullName: params.fullName,
      avatarUrl: params.avatarUrl,
      bio: params.bio,
      isPublic: params.isPublic,
      offPlatform: params.offPlatform,
    }),
  listWorkspaces: () => invoke<Workspace[]>("list_workspaces"),
  addWorkspace: (
    name: string,
    path: string,
    cli: string,
    organizationId: number,
    orgId?: string | null,
    projectId?: string | null,
  ) =>
    invoke<Workspace>("add_workspace", {
      name,
      path,
      cli,
      organizationId,
      orgId: orgId ?? undefined,
      projectId: projectId ?? undefined,
    }),
  listOrganizations: () => invoke<Organization[]>("list_organizations"),
  addOrganization: (name: string, orgId?: string | null) =>
    invoke<Organization>("add_organization", { name, orgId: orgId ?? undefined }),
  removeWorkspace: (id: number) => invoke<void>("remove_workspace", { id }),
  startSession: (
    workspaceId: number,
    sessionId: string,
    cli: string,
    rows: number,
    cols: number,
    resumeSessionId?: string,
    isDark?: boolean,
  ) =>
    invoke<SessionInfo>("start_session", {
      workspaceId,
      sessionId,
      cli,
      rows,
      cols,
      resumeSessionId,
      isDark,
    }),
  writeSession: (sessionId: string, data: string) =>
    invoke<void>("write_session", { sessionId, data }),
  resizeSession: (sessionId: string, rows: number, cols: number) =>
    invoke<void>("resize_session", { sessionId, rows, cols }),
  stopSession: (sessionId: string) => invoke<void>("stop_session", { sessionId }),
  sessionActive: (sessionId: string) => invoke<boolean>("session_active", { sessionId }),
  listSlashCommands: (workspaceId: number) =>
    invoke<string[]>("list_slash_commands", { workspaceId }),
  updateWorkspaceCli: (id: number, cli: string) =>
    invoke<void>("update_workspace_cli", { id, cli }),
  updateWorkspace: (id: number, u: WorkspaceUpdate) =>
    invoke<void>("update_workspace", { id, ...u }),
  setWorkspaceEnvFiles: (workspaceId: number, envFiles: string[]) =>
    invoke<void>("set_workspace_env_files", { workspaceId, envFiles }),
  readEnvFile: (workspaceId: number) =>
    invoke<EnvEntry[]>("read_env_file", { workspaceId }),
  writeEnvFile: (workspaceId: number, entries: EnvEntry[]) =>
    invoke<void>("write_env_file", { workspaceId, entries }),
  setEnvEntry: (workspaceId: number, key: string, value: string) =>
    invoke<void>("set_env_entry", { workspaceId, key, value }),
  deleteEnvEntry: (workspaceId: number, key: string) =>
    invoke<void>("delete_env_entry", { workspaceId, key }),
  listDir: (workspaceId: number, rel: string) =>
    invoke<FileEntry[]>("list_dir", { workspaceId, rel }),
  readFile: (workspaceId: number, rel: string) =>
    invoke<string>("read_file", { workspaceId, rel }),
  writeFile: (workspaceId: number, rel: string, content: string) =>
    invoke<void>("write_file", { workspaceId, rel, content }),
  createEntry: (workspaceId: number, rel: string, isDir: boolean) =>
    invoke<void>("create_entry", { workspaceId, rel, isDir }),
  deleteEntry: (workspaceId: number, rel: string) =>
    invoke<void>("delete_entry", { workspaceId, rel }),
  listCliSessions: (workspacePath: string, cli: string) =>
    invoke<CliSession[]>("list_cli_sessions", { workspacePath, cli }),
  readCliSession: (filePath: string, cli: string) =>
    invoke<CliSessionMessage[]>("read_cli_session", { filePath, cli }),
  listJobs: (workspaceId: number) => invoke<Job[]>("list_jobs", { workspaceId }),
  addJob: (
    workspaceId: number,
    name: string,
    command: string,
    schedule: string,
    extra?: {
      runMode?: string;
      runConfig?: string;
      triggerType?: string;
      triggerConfig?: string;
      allowedConnectors?: string;
      exitCondition?: string | null;
      maxAttempts?: number;
    },
  ) => invoke<Job>("add_job", { workspaceId, name, command, schedule, ...extra }),
  updateJob: (
    id: number,
    name: string,
    command: string,
    schedule: string,
    runMode: string,
    runConfig: string,
    triggerType: string,
    triggerConfig: string,
    allowedConnectors: string,
    exitCondition?: string | null,
    maxAttempts?: number,
  ) =>
    invoke<Job>("update_job", {
      id,
      name,
      command,
      schedule,
      runMode,
      runConfig,
      triggerType,
      triggerConfig,
      allowedConnectors,
      exitCondition,
      maxAttempts,
    }),
  listWorkspaceConnectors: (workspaceId: number) =>
    invoke<WorkspaceConnector[]>("list_workspace_connectors", { workspaceId }),
  setJobEnabled: (id: number, enabled: boolean) =>
    invoke<void>("set_job_enabled", { id, enabled }),
  deleteJob: (id: number) => invoke<void>("delete_job", { id }),
  runJobNow: (id: number) => invoke<void>("run_job_now", { id }),
  listAgents: (workspaceId: number) => invoke<Agent[]>("list_agents", { workspaceId }),
  readAgent: (workspaceId: number, name: string) =>
    invoke<Agent>("read_agent", { workspaceId, name }),
  saveAgent: (workspaceId: number, agent: Agent) =>
    invoke<void>("save_agent", { workspaceId, agent }),
  deleteAgent: (workspaceId: number, name: string) =>
    invoke<void>("delete_agent", { workspaceId, name }),
  runAgentNow: (workspaceId: number, name: string) =>
    invoke<void>("run_agent_now", { workspaceId, name }),
  listWorkspaceAgents: (workspaceId: number) =>
    invoke<AgentRow[]>("list_workspace_agents", { workspaceId }),
  upsertAgentMetadata: (
    workspaceId: number,
    name: string,
    description: string,
    schedule: string,
    defaultRunMode: string,
    defaultCli: string,
    defaultProvider: string,
    defaultModel: string,
    skills: string,
    connectors: string,
    isActive: boolean,
  ) =>
    invoke<AgentRow>("upsert_agent_metadata", {
      workspaceId, name, description, schedule,
      defaultRunMode, defaultCli, defaultProvider, defaultModel,
      skills, connectors, isActive,
    }),
  deleteAgentMetadata: (workspaceId: number, name: string) =>
    invoke<void>("delete_agent_metadata", { workspaceId, name }),
  setAgentActive: (workspaceId: number, name: string, isActive: boolean) =>
    invoke<void>("set_agent_active", { workspaceId, name, isActive }),
  listAgentSessions: (workspaceId: number, agentName: string) =>
    invoke<SessionFeedItem[]>("list_agent_sessions", { workspaceId, agentName }),
  listCatalogAgents: () => invoke<CatalogAgent[]>("list_catalog_agents"),
  installCatalogAgent: (workspaceId: number, id: string) =>
    invoke<void>("install_catalog_agent", { workspaceId, id }),
  upsertCatalogAgent: (input: CatalogAgentInput) =>
    invoke<void>("upsert_catalog_agent", { input }),
  importRepoAgents: (repo: string, gitRef: string) =>
    invoke<number>("import_repo_agents", { repo, gitRef }),
  detectRepoAgents: (repo: string, gitRef: string) =>
    invoke<CatalogAgentInput[]>("detect_repo_agents", { repo, gitRef }),
  deleteCatalogAgent: (id: string) => invoke<void>("delete_catalog_agent", { id }),
  installRepoAgent: (workspaceId: number, repo: string, gitRef: string) =>
    invoke<string>("install_repo_agent", { workspaceId, repo, gitRef }),
  scaffoldProjectFromRepo: (parentDir: string, repo: string, gitRef: string) =>
    invoke<string>("scaffold_project_from_repo", { parentDir, repo, gitRef }),
  scaffoldSuperconsoleDir: (workspaceId: number) =>
    invoke<string[]>("scaffold_superconsole_dir", { workspaceId }),
  listInbox: () => invoke<InboxItem[]>("list_inbox"),
  inboxUnreadCount: () => invoke<number>("inbox_unread_count"),
  markInboxRead: (id: number) => invoke<void>("mark_inbox_read", { id }),
  deleteInboxItem: (id: number) => invoke<void>("delete_inbox_item", { id }),
  setInboxStatus: (id: number, status: "read" | "approved" | "rejected") =>
    invoke<void>("set_inbox_status", { id, status }),
  listSessionHistory: (workspaceId: number) =>
    invoke<SessionLog[]>("list_session_history", { workspaceId }),
  listUserSessions: (workspaceId?: number) =>
    invoke<SessionFeedItem[]>("list_user_sessions", { workspaceId: workspaceId ?? null }),
  listJobSessions: (jobId: number) =>
    invoke<SessionFeedItem[]>("list_job_sessions", { jobId }),
  listAllJobSessions: (workspaceId?: number) =>
    invoke<SessionFeedItem[]>("list_all_job_sessions", { workspaceId: workspaceId ?? null }),
  getInboxSession: (inboxId: number) =>
    invoke<SessionFeedItem | null>("get_inbox_session", { inboxId }),
  getSettings: () => invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  ensureWorkspaceProject: (workspaceId: number, cloudOrgId: string) =>
    invoke<string>("ensure_workspace_project", { workspaceId, cloudOrgId }),
  listLlmKeys: (scope: LlmScope, scopeId: string) =>
    invoke<LlmKeyView[]>("list_llm_keys", { scope, scopeId }),
  setLlmKey: (
    scope: LlmScope,
    scopeId: string,
    provider: string,
    apiKey: string,
    baseUrl: string | null,
    model: string | null,
    extraEnv: string | null,
  ) =>
    invoke<void>("set_llm_key", {
      scope,
      scopeId,
      provider,
      apiKey,
      baseUrl,
      model,
      extraEnv,
    }),
  deleteLlmKey: (scope: LlmScope, scopeId: string, provider: string) =>
    invoke<void>("delete_llm_key", { scope, scopeId, provider }),
  syncCloudCache: () => invoke<void>("sync_cloud_cache"),
  syncOrgCache: (orgId: string) => invoke<void>("sync_org_cache", { orgId }),
  chatSend: (
    requestId: string,
    workspaceId: number,
    provider: string,
    model: string,
    messages: { role: string; content: string }[],
    toolMode?: string,
    reasoning?: string,
  ) =>
    invoke<void>("chat_send", {
      requestId,
      workspaceId,
      provider,
      model,
      messages,
      toolMode,
      reasoning,
    }),
  stopChat: (requestId: string) => invoke<void>("stop_chat", { requestId }),
  compactChatSession: (
    workspaceId: number,
    sessionId: string,
    provider: string,
    model: string,
  ) =>
    invoke<CompactResult>("compact_chat_session", { workspaceId, sessionId, provider, model }),
  deleteChatMessage: (id: number) => invoke<void>("delete_chat_message", { id }),
  readAttachment: (path: string) => invoke<string>("read_attachment", { path }),
  gitInfo: (workspaceId: number) =>
    invoke<{ branch: string | null; insertions: number; deletions: number }>("git_info", {
      workspaceId,
    }),
  gitStatus: (workspaceId: number) =>
    invoke<GitStatus>("git_status_cmd", { workspaceId }),
  gitDiffSummary: (workspaceId: number) =>
    invoke<GitDiff>("git_diff_summary", { workspaceId }),
  gitGenerateCommitMessage: (workspaceId: number) =>
    invoke<string>("git_generate_commit_message", { workspaceId }),
  gitCommitChanges: (workspaceId: number, message: string) =>
    invoke<void>("git_commit_changes", { workspaceId, message }),
  gitInitRepo: (workspaceId: number) =>
    invoke<void>("git_init_repo", { workspaceId }),
  gitCommitAndPush: (
    workspaceId: number,
    message: string,
    createPr: boolean,
    prTitle?: string,
    prBody?: string,
  ) =>
    invoke<GitPushResult>("git_commit_and_push", {
      workspaceId,
      message,
      createPr,
      prTitle,
      prBody,
    }),
  listOpenrouterModels: () => invoke<OpenrouterModel[]>("list_openrouter_models"),
  hasProviderKey: (workspaceId: number, provider: string) =>
    invoke<boolean>("has_provider_key", { workspaceId, provider }),
  listChatSessions: (projectId: string) =>
    invoke<ChatSession[]>("list_chat_sessions", { projectId }),
  createChatSession: (projectId: string) =>
    invoke<ChatSession>("create_chat_session", { projectId }),
  listChatMessages: (sessionId: string) =>
    invoke<ChatMessage[]>("list_chat_messages", { sessionId }),
  addChatMessage: (
    sessionId: string,
    role: string,
    content: string,
    provider: string | null,
    model: string | null,
  ) =>
    invoke<ChatMessage>("add_chat_message", { sessionId, role, content, provider, model }),
  deleteCliSession: (id: number) => invoke<void>("delete_cli_session", { id }),
  renameCliSession: (id: number, label: string | null) =>
    invoke<void>("rename_cli_session", { id, label }),
  renameChatSession: (id: string, name: string) =>
    invoke<void>("rename_chat_session", { id, name }),
  starChatSession: (id: string, isStar: boolean) =>
    invoke<void>("star_chat_session", { id, isStar }),
  deleteChatSession: (id: string) =>
    invoke<void>("delete_chat_session", { id }),
  moveChatSession: (id: string, toProject: string) =>
    invoke<void>("move_chat_session", { id, toProject }),
  // Reads the local usage cache (mirror of the Turso shared totals). Returns a
  // zeroed row if the entity has no usage yet.
  getUsage: (level: UsageLevel, id: string) =>
    invoke<UsageRow>("get_usage", { level, id }),
  clearLocalCloudData: () => invoke<void>("clear_local_cloud_data"),
  listOrgMembers: (orgId: string) =>
    invoke<MemberView[]>("list_org_members", { orgId }),
  inviteOrgMember: (orgId: string, email: string, role: string) =>
    invoke<void>("invite_org_member", { orgId, email, role }),
  updateOrgMemberRole: (orgId: string, userId: string, role: string) =>
    invoke<void>("update_org_member_role", { orgId, userId, role }),
  removeOrgMember: (orgId: string, userId: string) =>
    invoke<void>("remove_org_member", { orgId, userId }),
  cancelOrgInvitation: (orgId: string, email: string) =>
    invoke<void>("cancel_org_invitation", { orgId, email }),
  listProjectMembers: (projectId: string) =>
    invoke<MemberView[]>("list_project_members", { projectId }),
  listAddableProjectMembers: (projectId: string) =>
    invoke<MemberView[]>("list_addable_project_members", { projectId }),
  addProjectMember: (projectId: string, userId: string, role: string) =>
    invoke<void>("add_project_member", { projectId, userId, role }),
  updateProjectMemberRole: (projectId: string, userId: string, role: string) =>
    invoke<void>("update_project_member_role", { projectId, userId, role }),
  removeProjectMember: (projectId: string, userId: string) =>
    invoke<void>("remove_project_member", { projectId, userId }),
  listConnectors: (scope: ConnectorScope, scopeId: string) =>
    invoke<ConnectorView[]>("list_connectors", { scope, scopeId }),
  setConnector: (
    scope: ConnectorScope,
    scopeId: string,
    service: string,
    fields: Record<string, string>,
  ) => invoke<string>("set_connector", { scope, scopeId, service, fields }),
  deleteConnector: (scope: ConnectorScope, scopeId: string, service: string) =>
    invoke<void>("delete_connector", { scope, scopeId, service }),
  testConnector: (service: string, credentialsJson: string) =>
    invoke<ConnectorTestResult>("test_connector_cmd", { service, credentialsJson }),
  listSkills: (workspaceId: number) =>
    invoke<Skill[]>("list_skills", { workspaceId }),
  scanDetectedSkills: (workspaceId: number) =>
    invoke<Skill[]>("scan_detected_skills", { workspaceId }),
  readWorkspaceSkill: (workspaceId: number, filePath: string) =>
    invoke<string>("read_workspace_skill", { workspaceId, filePath }),
  createSkill: (
    workspaceId: number,
    name: string,
    description: string,
    tags: string[],
    body: string,
  ) => invoke<Skill>("create_skill", { workspaceId, name, description, tags, body }),
  updateSkill: (workspaceId: number, name: string, content: string) =>
    invoke<Skill>("update_skill", { workspaceId, name, content }),
  deleteSkill: (workspaceId: number, name: string) =>
    invoke<void>("delete_skill", { workspaceId, name }),
  setSkillActive: (workspaceId: number, name: string, active: boolean) =>
    invoke<void>("set_skill_active", { workspaceId, name, active }),
  listSkillLibrary: () => invoke<LibrarySkill[]>("list_skill_library"),
  // Account scope: machine-global library.
  listGlobalSkills: () => invoke<Skill[]>("list_global_skills"),
  getGlobalSkill: (name: string) => invoke<string>("get_global_skill", { name }),
  createGlobalSkill: (name: string, description: string, tags: string[], body: string) =>
    invoke<Skill>("create_global_skill", { name, description, tags, body }),
  updateGlobalSkill: (name: string, content: string) =>
    invoke<void>("update_global_skill", { name, content }),
  deleteGlobalSkill: (name: string) => invoke<void>("delete_global_skill", { name }),
  installLibrarySkillGlobal: (name: string) =>
    invoke<Skill>("install_library_skill_global", { name }),
  importGlobalSkillFromUrl: (url: string, name: string | null) =>
    invoke<Skill>("import_global_skill_from_url", { url, name }),
  // Org scope: references to global-library skills.
  listOrgSkills: (orgId: string) => invoke<OrgSkillView[]>("list_org_skills", { orgId }),
  attachOrgSkill: (orgId: string, name: string) =>
    invoke<void>("attach_org_skill", { orgId, name }),
  detachOrgSkill: (orgId: string, name: string) =>
    invoke<void>("detach_org_skill", { orgId, name }),
  // Project scope: references to global skills + materialize into the repo.
  attachSkillToProject: (workspaceId: number, name: string) =>
    invoke<Skill>("attach_skill_to_project", { workspaceId, name }),
  detachSkillFromProject: (workspaceId: number, name: string) =>
    invoke<void>("detach_skill_from_project", { workspaceId, name }),
  materializeSkillToWorkspace: (workspaceId: number, name: string) =>
    invoke<Skill>("materialize_skill_to_workspace", { workspaceId, name }),

  // Phase B — session log files.
  saveSessionLog: (
    workspaceId: number,
    sessionId: string,
    agentName: string,
    model: string,
    costUsd: number,
    tokens: number,
    summary: string,
    slug: string,
  ) =>
    invoke<SessionLogFile>("save_session_log", {
      workspaceId, sessionId, agentName, model, costUsd, tokens, summary, slug,
    }),
  listSessionLogFiles: (workspaceId: number) =>
    invoke<SessionLogFile[]>("list_session_logs", { workspaceId }),
  deleteSessionLogFile: (workspaceId: number, id: string) =>
    invoke<void>("delete_session_log", { workspaceId, id }),

  // Phase C — skill GitHub library + community catalog.
  installSkillFromGithubUrl: (
    url: string,
    name: string | null,
    scope: "global" | "project",
    workspaceId?: number,
  ) =>
    invoke<Skill>("install_skill_from_github_url", { url, name, scope, workspaceId }),
  fetchSkillCatalog: () =>
    invoke<CatalogSkillEntry[]>("fetch_skill_catalog"),
  submitToSkillCatalog: (
    name: string,
    description: string,
    category: string,
    tags: string[],
    githubUrl: string,
    readme: string,
    author: string,
  ) =>
    invoke<CatalogSkillEntry>("submit_to_skill_catalog", {
      name, description, category, tags, githubUrl, readme, author,
    }),

  // Phase 19: memory.
  listMemory: (workspaceId: number) =>
    invoke<MemoryEntry[]>("list_memory", { workspaceId }),
  searchMemory: (workspaceId: number, query: string) =>
    invoke<MemoryEntry[]>("search_memory", { workspaceId, query }),
  writeMemory: (
    workspaceId: number,
    category: string,
    title: string,
    body: string,
    tags: string[],
  ) => invoke<MemoryEntry>("write_memory", { workspaceId, category, title, body, tags }),
  deleteMemory: (workspaceId: number, category: string, slug: string) =>
    invoke<void>("delete_memory", { workspaceId, category, slug }),
  wipeMemory: (workspaceId: number) => invoke<void>("wipe_memory", { workspaceId }),
  listOrgMemory: (orgId: string) =>
    invoke<OrgMemoryEntry[]>("list_org_memory", { orgId }),
  writeOrgMemory: (orgId: string, title: string, body: string, tags: string[]) =>
    invoke<OrgMemoryEntry>("write_org_memory", { orgId, title, body, tags }),
  deleteOrgMemory: (orgId: string, slug: string) =>
    invoke<void>("delete_org_memory", { orgId, slug }),

  // Phase 20: wiki.
  listWiki: (workspaceId: number) => invoke<WikiPage[]>("list_wiki", { workspaceId }),
  readWiki: (workspaceId: number, slug: string) =>
    invoke<string>("read_wiki", { workspaceId, slug }),
  searchWiki: (workspaceId: number, query: string) =>
    invoke<WikiPage[]>("search_wiki", { workspaceId, query }),
  writeWiki: (
    workspaceId: number,
    slug: string | null,
    title: string,
    summary: string,
    tags: string[],
    body: string,
  ) => invoke<WikiPage>("write_wiki", { workspaceId, slug, title, summary, tags, body }),
  deleteWiki: (workspaceId: number, slug: string) =>
    invoke<void>("delete_wiki", { workspaceId, slug }),
  seedWikiFromFiles: (workspaceId: number) =>
    invoke<WikiPage[]>("seed_wiki_from_files", { workspaceId }),

  // Context files (.superconsole/context/).
  listContextFiles: (workspaceId: number) =>
    invoke<ContextFile[]>("list_context_files", { workspaceId }),
  readContextFile: (workspaceId: number, slug: string) =>
    invoke<string>("read_context_file", { workspaceId, slug }),
  writeContextFile: (workspaceId: number, slug: string, content: string) =>
    invoke<void>("write_context_file", { workspaceId, slug, content }),
  deleteContextFile: (workspaceId: number, slug: string) =>
    invoke<void>("delete_context_file", { workspaceId, slug }),
  seedContextFiles: (workspaceId: number) =>
    invoke<string[]>("seed_context_files", { workspaceId }),

  // Slash commands (.superconsole/commands/ + .claude/commands/ + global).
  listCommands: (workspaceId: number) =>
    invoke<SlashCommand[]>("list_commands", { workspaceId }),
  readCommand: (workspaceId: number, slash: string) =>
    invoke<string>("read_command", { workspaceId, slash }),
  writeCommand: (
    workspaceId: number,
    name: string,
    slash: string,
    description: string,
    content: string,
  ) => invoke<void>("write_command", { workspaceId, name, slash, description, content }),
  deleteCommand: (workspaceId: number, name: string) =>
    invoke<void>("delete_command", { workspaceId, name }),
  listGlobalCommands: () => invoke<SlashCommand[]>("list_global_commands"),
  readGlobalCommand: (name: string) =>
    invoke<string>("read_global_command", { name }),
  writeGlobalCommand: (
    name: string,
    slash: string,
    description: string,
    content: string,
  ) => invoke<void>("write_global_command", { name, slash, description, content }),
  deleteGlobalCommand: (name: string) =>
    invoke<void>("delete_global_command", { name }),

  // Phase 16: MCP tool infrastructure.
  ensureMcpConfig: (workspaceId: number) =>
    invoke<string>("ensure_mcp_config", { workspaceId }),

  // Telegram: detect chat_id + thread_id from the first message sent to the bot.
  detectTelegramChat: () =>
    invoke<{ chat_id: string; thread_id: string | null; chat_title: string | null }>(
      "detect_telegram_chat",
    ),
  refreshTelegramBots: () => invoke<void>("refresh_telegram_bots"),

  // ── Phase Plugins — Hooks ──────────────────────────────────────────────────
  listHooks: (workspaceId: number) =>
    invoke<HookFile[]>("list_hooks_cmd", { workspaceId }),
  readHook: (workspaceId: number, hookType: string) =>
    invoke<string>("read_hook_cmd", { workspaceId, hookType }),
  writeHook: (workspaceId: number, hookType: string, content: string) =>
    invoke<void>("write_hook_cmd", { workspaceId, hookType, content }),
  deleteHook: (workspaceId: number, hookType: string) =>
    invoke<void>("delete_hook_cmd", { workspaceId, hookType }),

  // ── Phase Plugins — Plugin marketplace ────────────────────────────────────
  listPluginsCatalog: (scope: string, scopeId: string, category?: string) =>
    invoke<PluginListItem[]>("list_plugins_catalog", { scope, scopeId, category }),
  searchPluginsCatalog: (scope: string, scopeId: string, query: string) =>
    invoke<PluginListItem[]>("search_plugins_catalog", { scope, scopeId, query }),
  getPlugin: (scope: string, scopeId: string, pluginId: string) =>
    invoke<PluginListItem>("get_plugin", { scope, scopeId, pluginId }),
  installPlugin: (scope: string, scopeId: string, pluginId: string) =>
    invoke<string>("install_plugin", { scope, scopeId, pluginId }),
  uninstallPlugin: (scope: string, scopeId: string, pluginId: string) =>
    invoke<void>("uninstall_plugin", { scope, scopeId, pluginId }),
  listInstalledPlugins: (scope: string, scopeId: string) =>
    invoke<WorkspacePlugin[]>("list_installed_plugins", { scope, scopeId }),
  installPluginFromUrl: (scope: string, scopeId: string, githubUrl: string) =>
    invoke<string>("install_plugin_from_url", { scope, scopeId, githubUrl }),

  // ── Phase Plugins — Catalog read ──────────────────────────────────────────
  listConnectorCatalog: () =>
    invoke<ConnectorCatalogEntry[]>("list_connector_catalog"),
  listMcpCatalog: () =>
    invoke<McpCatalogEntry[]>("list_mcp_catalog"),
  listCommandsCatalog: () =>
    invoke<CommandsCatalogEntry[]>("list_commands_catalog"),
  listHooksCatalog: (hookType?: string) =>
    invoke<HooksCatalogEntry[]>("list_hooks_catalog_cmd", { hookType }),

  // ── Phase Plugins — Submit to cloud (dev/admin) ───────────────────────────
  submitCommandToCloud: (input: SubmitCommandInput) =>
    invoke("submit_command_to_cloud", { input }),
  submitMcpToCloud: (input: SubmitMcpInput) =>
    invoke("submit_mcp_to_cloud", { input }),
  submitConnectorToCloud: (input: SubmitConnectorInput) =>
    invoke("submit_connector_to_cloud", { input }),
  submitPluginToCloud: (input: SubmitPluginInput) =>
    invoke<void>("submit_plugin_to_cloud", { input }),

  // Rules
  listRules: (workspaceId: number) => invoke<RuleFile[]>("tauri_list_rules", { workspaceId }),
  readRule: (workspaceId: number, slug: string) => invoke<string>("tauri_read_rule", { workspaceId, slug }).then(content => ({ slug, name: slug, description: "", content, always_apply: true } as RuleFile)),
  writeRule: (workspaceId: number, slug: string, content: string) => invoke<void>("tauri_write_rule", { workspaceId, slug, content }),
  deleteRule: (workspaceId: number, slug: string) => invoke<void>("tauri_delete_rule", { workspaceId, slug }),

  // ── LocalDB Studio (Real-time In-App SQLite Explorer) ──────────────────────
  listLocalDbTables: () => invoke<LocalDbTableSummary[]>("local_db_list_tables"),
  getLocalDbTableSchema: (tableName: string) =>
    invoke<LocalDbTableSchema>("local_db_get_table_schema", { tableName }),
  getLocalDbTableData: (params: {
    tableName: string;
    page?: number;
    pageSize?: number;
    search?: string;
    sortCol?: string;
    sortDesc?: boolean;
    onlyCurrentUser?: boolean;
  }) =>
    invoke<LocalDbTableDataResult>("local_db_get_table_data", {
      tableName: params.tableName,
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      sortCol: params.sortCol,
      sortDesc: params.sortDesc,
      onlyCurrentUser: params.onlyCurrentUser,
    }),

  // ── UserDB (Personal Turso Cloud Database & Off-Platform Isolation) ───────
  getUserDbConfig: () => invoke<UserDbConfig>("userdb_get_config"),
  saveUserDbConfig: (url: string, token: string) =>
    invoke<UserDbConfig>("userdb_save_config", { url, token }),
  testUserDbConnection: (url?: string, token?: string) =>
    invoke<UserDbTestResult>("userdb_test_connection", { url, token }),
  provisionUserDb: (url?: string, token?: string) =>
    invoke<UserDbProvisionResult>("userdb_provision", { url, token }),
  setUserDbOffPlatform: (offPlatform: number) =>
    invoke<UserDbConfig>("userdb_set_off_platform", { offPlatform }),
  getUserDbStatus: () => invoke<UserDbStatus>("userdb_get_status"),
  syncUserDbAll: () => invoke<UserDbSyncStats>("userdb_sync_all"),
};

// ── UserDB Types ─────────────────────────────────────────────────────────────

export interface UserDbConfig {
  url: string;
  tokenMasked: string;
  hasToken: boolean;
  offPlatform: number;
  isConfigured: boolean;
}

export interface UserDbTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
}

export interface UserDbProvisionResult {
  success: boolean;
  statementsExecuted: number;
  message: string;
}

export interface UserDbSyncStats {
  success: boolean;
  installedPluginsSynced: number;
  sessionHistorySynced: number;
  chatSessionsSynced: number;
  usageRowsSynced: number;
  message: string;
}

export interface UserDbStatus {
  isConfigured: boolean;
  offPlatform: number;
  isConnected: boolean;
  latencyMs?: number | null;
  tableCount: number;
  canonicalTableCount: number;
  tables: string[];
  errorMessage?: string | null;
}

// ── LocalDB Studio Types ──────────────────────────────────────────────────────

export interface LocalDbTableSummary {
  name: string;
  rowCount: number;
  userRowCount: number | null;
  hasUserId: boolean;
  category: "account" | "org" | "project" | "catalog" | "system";
}

export interface LocalDbColumnInfo {
  cid: number;
  name: string;
  typeName: string;
  notnull: boolean;
  dfltValue: string | null;
  pk: boolean;
}

export interface LocalDbIndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface LocalDbTableSchema {
  tableName: string;
  columns: LocalDbColumnInfo[];
  indexes: LocalDbIndexInfo[];
  createStatement: string;
}

export interface LocalDbTableDataResult {
  columns: string[];
  rows: any[][];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface SubmitPluginInput {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  githubUrl?: string;
  iconUrl?: string;
  docsUrl?: string;
  skillIds: string;      // JSON array string
  agentIds: string;      // JSON array string
  mcpIds: string;        // JSON array string
  commandIds: string;
  hookIds: string;
  ruleIds: string;
  connectorIds: string;    // JSON array string
  skillsUrl?: string;
  agentsUrl?: string;
  commandsUrl?: string;
  hooksUrl?: string;
  rulesUrl?: string;
  mcpUrl?: string;
  connectorAuth: string; // JSON array string
  featured: boolean;
}

// ── Phase Plugins — types ──────────────────────────────────────────────────────

export interface HookFile {
  hookType: string;
  filename: string;
  content: string;
  exists: boolean;
}

export interface ConnectorAuth {
  service: string;
  authType: string;
  keyFields: string[];
  oauthUrl?: string | null;
}

export interface PluginListItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  iconUrl?: string | null;
  category: string;
  featured: boolean;
  installed: boolean;
  skillCount: number;
  mcpCount: number;
  hookCount: number;
  skillIds: string;
  mcpIds: string;
  commandIds: string;
  connectorIds: string;
  skillsUrl?: string;
  commandsUrl?: string;
  hooksUrl?: string;
  mcpUrl?: string;
  githubUrl?: string | null;
  docsUrl?: string | null;
  connectorAuth: ConnectorAuth[];
}

export interface WorkspacePlugin {
  id: string;
  workspaceId: number;
  pluginId: string;
  installedAt: string;
  version: string;
}

export interface ConnectorCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  oauthUrl?: string | null;
  apiKeyFields: string;
  docsUrl?: string | null;
  iconUrl?: string | null;
  scope: string;
  syncedAt: string;
}

export interface McpCatalogEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  githubUrl: string;
  installCommand: string;
  installArgs: string;
  requiredEnvVars: string;
  iconUrl?: string | null;
  syncedAt: string;
}

export interface McpListItem {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  type: string;
  url: string | null;
  command: string | null;
  args: string;
  env: string;
  requiredEnvVars: string;
  githubUrl: string | null;
  iconUrl: string | null;
  docsUrl: string | null;
  installCount: number;
}

export interface CommandsCatalogEntry {
  id: string;
  name: string;
  slash: string;
  description: string;
  author: string;
  category: string;
  githubUrl: string;
  syncedAt: string;
}

export interface HooksCatalogEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  hookType: string;
  githubUrl: string;
  syncedAt: string;
}


export interface SubmitConnectorInput {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  oauthUrl?: string;
  apiKeyFields: string; // JSON
  docsUrl?: string;
  iconUrl?: string;
  scope: string;
}

export interface SubmitMcpInput {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  type: string;
  url?: string;
  command?: string;
  args?: string; // JSON
  env?: string; // JSON
  requiredEnvVars: string; // JSON
  githubUrl?: string;
  iconUrl?: string;
  docsUrl?: string;
}

export interface SubmitCommandInput {
  id: string;
  name: string;
  slash: string;
  description: string;
  author: string;
  category: string;
  githubUrl: string;
  content?: string;
  iconUrl?: string;
}

export interface RuleFile {
  slug: string;
  name: string;
  description: string;
  content: string;
  always_apply: boolean;
  author?: string;
}

