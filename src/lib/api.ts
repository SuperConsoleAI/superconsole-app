import { invoke } from "@tauri-apps/api/core";

export interface Workspace {
  id: number;
  name: string;
  path: string;
  cli: string;
  organization_id: number;
  created_at: string;
  project_id: string | null;
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
  name: string;
  created_at: string;
}

export interface AuthUser {
  id: string;
  workos_id: string;
  email: string;
  name: string | null;
  logo_url?: string | null;
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
  resumeId?: string;
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
  run_mode: "cli" | "chat";
  run_config: string;
  trigger_type: "cron" | "api" | "github";
  trigger_config: string;
  allowed_connectors: string;
}

export interface JobRunConfig {
  cli?: string;
  model?: string;
  provider?: string;
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
}

export interface CliSession {
  id: string;
  cli: string;
  workspace_path: string;
  file_path: string;
  size_bytes: number;
  modified_at: string;
  message_count: number;
}

export interface CliSessionMessage {
  role: string;
  content: string;
  timestamp?: string | null;
  model?: string | null;
}

export const CLI_PRESETS = [
  { id: "claude", label: "Claude Code" },
  { id: "droid", label: "Droid" },
  { id: "antigravity", label: "Antigravity" },
  { id: "codex", label: "Codex" },
] as const;

export interface ChatSession {
  id: string;
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
}

export interface ChatMessage {
  id: number;
  session_id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

// Phase 21: usage monitoring. One canonical aggregate shape is reused at every
// level (project/org/account) so a single display path renders all three.
export type UsageLevel = "project" | "org" | "account";

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
}

export interface ConnectorDef {
  id: string;
  label: string;
  category: ConnectorCategory;
  scopes: ConnectorScope[];
  fields: ConnectorFieldDef[];
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
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "web_search",
    label: "Web Search",
    category: "integrations",
    scopes: ALL_CONNECTOR_SCOPES,
    fields: [{ key: "api_key", label: "Tavily API key", secret: true }],
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
}

export interface LibrarySkill {
  name: string;
  description: string;
  tags: string[];
  category: string;
  body: string;
}

export interface OrgSkillView {
  name: string;
  tags: string[];
  in_library: boolean;
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
  listWorkspaces: () => invoke<Workspace[]>("list_workspaces"),
  addWorkspace: (name: string, path: string, cli: string, organizationId: number) =>
    invoke<Workspace>("add_workspace", { name, path, cli, organizationId }),
  listOrganizations: () => invoke<Organization[]>("list_organizations"),
  addOrganization: (name: string) => invoke<Organization>("add_organization", { name }),
  removeWorkspace: (id: number) => invoke<void>("remove_workspace", { id }),
  startSession: (
    workspaceId: number,
    sessionId: string,
    cli: string,
    rows: number,
    cols: number,
    resumeSessionId?: string,
  ) =>
    invoke<SessionInfo>("start_session", {
      workspaceId,
      sessionId,
      cli,
      rows,
      cols,
      resumeSessionId,
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
    }),
  listWorkspaceConnectors: (workspaceId: number) =>
    invoke<WorkspaceConnector[]>("list_workspace_connectors", { workspaceId }),
  setJobEnabled: (id: number, enabled: boolean) =>
    invoke<void>("set_job_enabled", { id, enabled }),
  deleteJob: (id: number) => invoke<void>("delete_job", { id }),
  runJobNow: (id: number) => invoke<void>("run_job_now", { id }),
  listInbox: () => invoke<InboxItem[]>("list_inbox"),
  inboxUnreadCount: () => invoke<number>("inbox_unread_count"),
  markInboxRead: (id: number) => invoke<void>("mark_inbox_read", { id }),
  deleteInboxItem: (id: number) => invoke<void>("delete_inbox_item", { id }),
  setInboxStatus: (id: number, status: "read" | "approved" | "rejected") =>
    invoke<void>("set_inbox_status", { id, status }),
  listSessionHistory: (workspaceId: number) =>
    invoke<SessionLog[]>("list_session_history", { workspaceId }),
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
  deleteChatMessage: (id: number) => invoke<void>("delete_chat_message", { id }),
  readAttachment: (path: string) => invoke<string>("read_attachment", { path }),
  gitInfo: (workspaceId: number) =>
    invoke<{ branch: string | null; insertions: number; deletions: number }>("git_info", {
      workspaceId,
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
  ) => invoke<void>("set_connector", { scope, scopeId, service, fields }),
  deleteConnector: (scope: ConnectorScope, scopeId: string, service: string) =>
    invoke<void>("delete_connector", { scope, scopeId, service }),
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
};
