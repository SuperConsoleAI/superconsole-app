import { invoke } from "@tauri-apps/api/core";

export interface Workspace {
  id: number;
  name: string;
  path: string;
  cli: string;
  organization_id: number;
  created_at: string;
}

export interface Organization {
  id: number;
  name: string;
  created_at: string;
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

export const api = {
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
};
