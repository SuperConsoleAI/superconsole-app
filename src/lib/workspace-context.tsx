import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  api,
  CLI_PRESETS,
  type Agent,
  type Organization,
  type SessionInfo,
  type SessionTab,
  type Workspace,
} from "@/lib/api";
import { extractCleanResumeId } from "@/lib/utils";

export interface PendingNewAgent {
  agent: Agent;
  skills: string[];
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  organizations: Organization[];
  activeOrgId: number;
  setActiveOrgId: (id: number) => void;
  addOrganization: (name: string) => Promise<void>;
  openedIds: number[];
  tabsByWs: Record<number, SessionTab[]>;
  activeTabByWs: Record<number, string>;
  liveSessions: Set<string>;
  sessionInfos: Map<string, SessionInfo>;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  pendingAgent: string | null;
  setPendingAgent: (id: string | null) => void;
  pendingNewAgent: PendingNewAgent | null;
  setPendingNewAgent: (a: PendingNewAgent | null) => void;
  pendingRepoImport: { repo: string; gitRef: string } | null;
  setPendingRepoImport: (r: { repo: string; gitRef: string } | null) => void;
  openWorkspace: (id: number, defaultCli: string, runMode?: string) => void;
  openTab: (workspaceId: number, cli: string) => void;
  openScriptTab: (workspaceId: number, label: string, script: string) => void;
  openResumeTab: (workspaceId: number, cli: string, resumeId: string) => void;
  // Multi-session chat: each session (and the picker) is its own tab.
  // Picker tab id `{ws}:chat`; session tab `{ws}:chat:{sessionId}`; a fresh
  // draft `{ws}:chat:draft:{n}` until its first message creates a session.
  openChatPicker: (workspaceId: number) => void;
  openChatSession: (workspaceId: number, sessionId: string, label?: string) => void;
  newChatDraft: (workspaceId: number) => void;
  setChatTabLabel: (workspaceId: number, tabId: string, label: string) => void;
  bindChatDraftToSession: (
    workspaceId: number,
    draftTabId: string,
    sessionId: string,
    label: string,
  ) => void;
  openFileTab: (workspaceId: number, relPath: string) => void;
  setTabState: (workspaceId: number, tabId: string, state: Partial<SessionTab>) => void;
  closeTab: (workspaceId: number, tabId: string) => void;
  activateTab: (workspaceId: number, tabId: string) => void;
  addWorkspace: (name: string, path: string, cli: string) => Promise<Workspace>;
  removeWorkspace: (id: number) => Promise<void>;
  updateWorkspaceFields: (id: number, fields: Partial<Workspace>) => Promise<void>;
  setSessionState: (sessionId: string, live: boolean) => void;
  setSessionInfo: (sessionId: string, info: SessionInfo) => void;
}

const cliLabel = (cli: string) =>
  CLI_PRESETS.find((p) => p.id === cli)?.label ?? cli;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<number>(() =>
    Number(localStorage.getItem("superconsole-org") || 1),
  );
  const [openedIds, setOpenedIds] = useState<number[]>([]);
  const [tabsByWs, setTabsByWs] = useState<Record<number, SessionTab[]>>({});
  const [activeTabByWs, setActiveTabByWs] = useState<Record<number, string>>({});
  const [liveSessions, setLiveSessions] = useState<Set<string>>(new Set());
  const [sessionInfos, setSessionInfos] = useState<Map<string, SessionInfo>>(new Map());
  const [addOpen, setAddOpen] = useState(false);
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [pendingNewAgent, setPendingNewAgent] = useState<PendingNewAgent | null>(null);
  const [pendingRepoImport, setPendingRepoImport] = useState<{
    repo: string;
    gitRef: string;
  } | null>(null);

  useEffect(() => {
    api.listWorkspaces().then(setWorkspaces).catch(console.error);
    api.listOrganizations().then(setOrganizations).catch(console.error);
  }, []);

  const setActiveOrgId = useCallback((id: number) => {
    setActiveOrgIdState(id);
    localStorage.setItem("superconsole-org", String(id));
  }, []);

  const addOrganization = useCallback(async (name: string) => {
    const org = await api.addOrganization(name);
    setOrganizations((prev) => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveOrgIdState(org.id);
    localStorage.setItem("superconsole-org", String(org.id));
  }, []);

  const openTab = useCallback((workspaceId: number, cli: string) => {
    const isChat = cli === "chat";
    const tabId = isChat ? `${workspaceId}:chat` : `${workspaceId}:${cli}-${Date.now()}`;

    setTabsByWs((prev) => {
      const tabs = prev[workspaceId] ?? [];
      if (isChat) {
        if (tabs.some((t) => t.id === tabId)) {
          return prev;
        }
        const tab: SessionTab = {
          id: tabId,
          cli: "chat",
          label: "Chats",
        };
        return { ...prev, [workspaceId]: [...tabs, tab] };
      }
      const cliCount = tabs.filter((t) => t.cli === cli).length;
      const n = cliCount + 1;
      const baseLabel = cli === "shell" ? "Terminal" : cliLabel(cli);
      const tab: SessionTab = {
        id: tabId,
        cli,
        label: n === 1 ? baseLabel : `${baseLabel} ${n}`,
      };
      
      return { ...prev, [workspaceId]: [...tabs, tab] };
    });
    
    if (cli !== "shell") {
      api.updateWorkspaceCli(workspaceId, cli).catch(() => {});
      setWorkspaces((ws) =>
        ws.map((w) => (w.id === workspaceId ? { ...w, cli } : w)),
      );
    }
    
    setActiveTabByWs((a) => ({ ...a, [workspaceId]: tabId }));
  }, []);

  const openResumeTab = useCallback(
    (workspaceId: number, cli: string, resumeId: string) => {
      const cleanId = extractCleanResumeId(resumeId);
      const id = `${workspaceId}:${cli}:resume:${cleanId ? cleanId + "-" : ""}${Date.now()}`;
      setTabsByWs((prev) => {
        const tabs = prev[workspaceId] ?? [];
        const tab: SessionTab = {
          id,
          cli,
          label: `${cliLabel(cli)} (resumed)`,
          resumeId: cleanId || resumeId,
        };
        return { ...prev, [workspaceId]: [...tabs, tab] };
      });
      setActiveTabByWs((a) => ({ ...a, [workspaceId]: id }));
    },
    [],
  );

  const openChatPicker = useCallback(
    (workspaceId: number) => {
      setOpenedIds((ids) => (ids.includes(workspaceId) ? ids : [...ids, workspaceId]));
      openTab(workspaceId, "chat");
    },
    [openTab],
  );

  const activateOrAddChatTab = useCallback(
    (workspaceId: number, tab: SessionTab) => {
      setOpenedIds((ids) => (ids.includes(workspaceId) ? ids : [...ids, workspaceId]));
      setTabsByWs((prev) => {
        const tabs = prev[workspaceId] ?? [];
        if (tabs.some((t) => t.id === tab.id)) {
          return prev;
        }
        return { ...prev, [workspaceId]: [...tabs, tab] };
      });
      setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
    },
    [],
  );

  const openChatSession = useCallback(
    (workspaceId: number, sessionId: string, label?: string) => {
      activateOrAddChatTab(workspaceId, {
        id: `${workspaceId}:chat:${sessionId}`,
        cli: "chat",
        label: label?.trim() || "Chat",
      });
    },
    [activateOrAddChatTab],
  );

  // Always open a fresh draft tab so a new chat never shows a prior
  // conversation, even if an earlier draft is still pending a reply.
  const newChatDraft = useCallback(
    (workspaceId: number) => {
      activateOrAddChatTab(workspaceId, {
        id: `${workspaceId}:chat:draft:${Date.now()}`,
        cli: "chat",
        label: "New chat",
      });
    },
    [activateOrAddChatTab],
  );

  const setChatTabLabel = useCallback(
    (workspaceId: number, tabId: string, label: string) => {
      const next = label.trim() || "Chat";
      setTabsByWs((prev) => {
        const tabs = prev[workspaceId] ?? [];
        return {
          ...prev,
          [workspaceId]: tabs.map((t) => (t.id === tabId ? { ...t, label: next } : t)),
        };
      });
    },
    [],
  );

  // Once a draft's first message creates a real session, rebrand the tab so it
  // dedupes with reopens and shows the chat title.
  const bindChatDraftToSession = useCallback(
    (workspaceId: number, draftTabId: string, sessionId: string, label: string) => {
      const newId = `${workspaceId}:chat:${sessionId}`;
      setTabsByWs((prev) => {
        const tabs = prev[workspaceId] ?? [];
        const next = tabs.map((t) =>
          t.id === draftTabId ? { ...t, id: newId, label: label.trim() || "Chat" } : t,
        );
        return { ...prev, [workspaceId]: next };
      });
      setActiveTabByWs((a) =>
        a[workspaceId] === draftTabId ? { ...a, [workspaceId]: newId } : a,
      );
    },
    [],
  );

  const openFileTab = useCallback((workspaceId: number, relPath: string) => {
    setOpenedIds((ids) => (ids.includes(workspaceId) ? ids : [...ids, workspaceId]));
    const tabId = `${workspaceId}:file:${relPath}`;

    setTabsByWs((prev) => {
      const tabs = prev[workspaceId] ?? [];
      const existingIdx = tabs.findIndex((t) => t.cli === "file" && t.relPath === relPath);
      
      if (existingIdx !== -1) {
        return prev;
      }
      
      const previewIdx = tabs.findIndex((t) => t.cli === "file" && t.preview && !t.dirty);
      const newTab: SessionTab = {
        id: tabId,
        cli: "file",
        label: relPath.split("/").pop() || relPath,
        relPath,
        preview: true,
        dirty: false,
      };

      if (previewIdx !== -1) {
        // Replace existing preview tab
        const next = [...tabs];
        next[previewIdx] = newTab;
        return { ...prev, [workspaceId]: next };
      }

      // Append new preview tab
      return { ...prev, [workspaceId]: [...tabs, newTab] };
    });
    
    setActiveTabByWs((a) => ({ ...a, [workspaceId]: tabId }));
  }, []);

  const setTabState = useCallback((workspaceId: number, tabId: string, state: Partial<SessionTab>) => {
    setTabsByWs((prev) => {
      const tabs = prev[workspaceId];
      if (!tabs) return prev;
      return {
        ...prev,
        [workspaceId]: tabs.map((t) => (t.id === tabId ? { ...t, ...state } : t)),
      };
    });
  }, []);

  // Track which workspaces have already had their default tab opened so that
  // React StrictMode double-invocations don't create duplicate tabs.
  const initializedWsRef = useRef<Set<number>>(new Set());

  const openWorkspace = useCallback(
    (id: number, defaultCli: string, runMode?: string) => {
      setOpenedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      let tabToActivate = "";
      setTabsByWs((prev) => {
        const tabs = prev[id] ?? [];
        if (tabs.length === 0 && !initializedWsRef.current.has(id)) {
          // Mark as initialized immediately to prevent double-open from StrictMode
          initializedWsRef.current.add(id);
          const isChat = runMode === "chat" || defaultCli === "chat";
          const tabId = isChat ? `${id}:chat` : `${id}:${defaultCli}-${Date.now()}`;
          tabToActivate = tabId;
          const initialTab: SessionTab = isChat
            ? { id: tabId, cli: "chat", label: "Chats" }
            : { id: tabId, cli: defaultCli, label: cliLabel(defaultCli) };

          return { ...prev, [id]: [initialTab] };
        }
        return prev;
      });
      if (tabToActivate) {
        setActiveTabByWs((a) => (a[id] ? a : { ...a, [id]: tabToActivate }));
      }
    },
    [],
  );

  const openScriptTab = useCallback(
    (workspaceId: number, label: string, script: string) => {
      setOpenedIds((ids) => (ids.includes(workspaceId) ? ids : [...ids, workspaceId]));
      const tab: SessionTab = {
        id: `${workspaceId}:script:${Date.now()}`,
        cli: "shell",
        label,
        initialInput: script,
      };
      setTabsByWs((prev) => {
        const tabs = prev[workspaceId] ?? [];
        return { ...prev, [workspaceId]: [...tabs, tab] };
      });
      setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
    },
    [],
  );

  const closeTab = useCallback((workspaceId: number, tabId: string) => {
    api.stopSession(tabId).catch(() => {});
    setTabsByWs((prev) => {
      const tabs = (prev[workspaceId] ?? []).filter((t) => t.id !== tabId);
      setActiveTabByWs((a) => {
        if (a[workspaceId] !== tabId) return a;
        return { ...a, [workspaceId]: tabs[tabs.length - 1]?.id ?? "" };
      });
      return { ...prev, [workspaceId]: tabs };
    });
    setLiveSessions((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
  }, []);

  const activateTab = useCallback((workspaceId: number, tabId: string) => {
    setActiveTabByWs((a) => ({ ...a, [workspaceId]: tabId }));
  }, []);

  const addWorkspace = useCallback(
    async (name: string, path: string, cli: string) => {
      const ws = await api.addWorkspace(name, path, cli, activeOrgId);
      setWorkspaces((prev) => [...prev, ws].sort((a, b) => a.name.localeCompare(b.name)));
      openWorkspace(ws.id, cli);
      return ws;
    },
    [openWorkspace, activeOrgId],
  );

  const removeWorkspace = useCallback(async (id: number) => {
    await api.removeWorkspace(id);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    setOpenedIds((ids) => ids.filter((i) => i !== id));
    setTabsByWs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLiveSessions((prev) => {
      const next = new Set([...prev].filter((sid) => !sid.startsWith(`${id}:`)));
      return next;
    });
  }, []);

  const updateWorkspaceFields = useCallback(
    async (id: number, fields: Partial<Workspace>) => {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...fields } : w)),
      );
      const w = workspaces.find((x) => x.id === id);
      if (!w) return;
      const merged = { ...w, ...fields };
      await api.updateWorkspace(id, {
        defaultRunMode: merged.default_run_mode,
        defaultCli: merged.default_cli,
        defaultProvider: merged.default_provider,
        defaultModel: merged.default_model,
        scriptSetup: merged.script_setup,
        scriptRun: merged.script_run,
        scriptTeardown: merged.script_teardown,
        scriptAutoRun: merged.script_auto_run,
        repoUrl: merged.repo_url,
        description: merged.description,
      });
    },
    [workspaces],
  );

  const setSessionState = useCallback((sessionId: string, live: boolean) => {
    setLiveSessions((prev) => {
      const next = new Set(prev);
      if (live) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }, []);

  const setSessionInfo = useCallback((sessionId: string, info: SessionInfo) => {
    setSessionInfos((prev) => new Map(prev).set(sessionId, info));
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        organizations,
        activeOrgId,
        setActiveOrgId,
        addOrganization,
        openedIds,
        tabsByWs,
        activeTabByWs,
        liveSessions,
        sessionInfos,
        addOpen,
        setAddOpen,
        pendingAgent,
        setPendingAgent,
        pendingNewAgent,
        setPendingNewAgent,
        pendingRepoImport,
        setPendingRepoImport,
        openWorkspace,
        openTab,
        openScriptTab,
        openResumeTab,
        openChatPicker,
        openChatSession,
        newChatDraft,
        setChatTabLabel,
        bindChatDraftToSession,
        openFileTab,
        setTabState,
        closeTab,
        activateTab,
        addWorkspace,
        removeWorkspace,
        updateWorkspaceFields,
        setSessionState,
        setSessionInfo,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaces must be used within WorkspaceProvider");
  return ctx;
}
