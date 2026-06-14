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
}

export interface CloudOrg {
  id: string;
  name: string;
  plan: string;
  role: string;
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
}

export const CLI_PRESETS = [
  { id: "claude", label: "Claude Code" },
  { id: "droid", label: "Droid" },
  { id: "antigravity", label: "Antigravity" },
] as const;

export interface ChatMessage {
  id: number;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  created_at: string;
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

export type ConnectorScope = "project" | "org";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

export interface ConnectorDef {
  id: string;
  label: string;
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
    id: "gmail",
    label: "Gmail",
    scopes: ["project"],
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "email", label: "Email address", secret: false },
    ],
  },
  {
    id: "google_drive",
    label: "Google Drive",
    scopes: ["project"],
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "shopify",
    label: "Shopify",
    scopes: ["project"],
    fields: [
      { key: "api_key", label: "Admin API token", secret: true },
      { key: "shop_domain", label: "Shop domain", secret: false, placeholder: "store.myshopify.com" },
    ],
  },
  {
    id: "beehiiv",
    label: "Beehiiv",
    scopes: ["project"],
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "publication_id", label: "Publication ID", secret: false },
    ],
  },
  {
    id: "convertkit",
    label: "ConvertKit",
    scopes: ["project"],
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "stripe",
    label: "Stripe",
    scopes: ["project", "org"],
    fields: [{ key: "api_key", label: "Secret key", secret: true }],
  },
  {
    id: "buffer",
    label: "Buffer",
    scopes: ["project"],
    fields: [{ key: "access_token", label: "Access token", secret: true }],
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    scopes: ["project"],
    fields: [
      { key: "api_secret", label: "API secret", secret: true },
      { key: "measurement_id", label: "Measurement ID", secret: false },
    ],
  },
  {
    id: "turso",
    label: "Turso",
    scopes: ["project"],
    fields: [
      { key: "auth_token", label: "Auth token", secret: true },
      { key: "url", label: "Database URL", secret: false, placeholder: "libsql://..." },
    ],
  },
  {
    id: "supabase",
    label: "Supabase",
    scopes: ["project"],
    fields: [
      { key: "service_role_key", label: "Service role key", secret: true },
      { key: "url", label: "Project URL", secret: false },
    ],
  },
  {
    id: "notion",
    label: "Notion",
    scopes: ["project", "org"],
    fields: [{ key: "api_key", label: "Integration token", secret: true }],
  },
  {
    id: "airtable",
    label: "Airtable",
    scopes: ["project"],
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "telegram",
    label: "Telegram",
    scopes: ["project", "org"],
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "slack",
    label: "Slack",
    scopes: ["org"],
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "github",
    label: "GitHub",
    scopes: ["org"],
    fields: [{ key: "token", label: "Personal access token", secret: true }],
  },
];

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
  startSession: (workspaceId: number, sessionId: string, cli: string, rows: number, cols: number) =>
    invoke<SessionInfo>("start_session", { workspaceId, sessionId, cli, rows, cols }),
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
  listJobs: (workspaceId: number) => invoke<Job[]>("list_jobs", { workspaceId }),
  addJob: (workspaceId: number, name: string, command: string, schedule: string) =>
    invoke<Job>("add_job", { workspaceId, name, command, schedule }),
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
  ) =>
    invoke<void>("chat_send", { requestId, workspaceId, provider, model, messages }),
  hasProviderKey: (workspaceId: number, provider: string) =>
    invoke<boolean>("has_provider_key", { workspaceId, provider }),
  listChatMessages: (projectId: string) =>
    invoke<ChatMessage[]>("list_chat_messages", { projectId }),
  addChatMessage: (
    projectId: string,
    role: string,
    content: string,
    provider: string | null,
    model: string | null,
  ) =>
    invoke<ChatMessage>("add_chat_message", { projectId, role, content, provider, model }),
  clearChatMessages: (projectId: string) =>
    invoke<void>("clear_chat_messages", { projectId }),
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
};
