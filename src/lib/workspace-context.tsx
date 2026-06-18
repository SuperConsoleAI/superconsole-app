import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  api,
  CLI_PRESETS,
  type Organization,
  type SessionInfo,
  type SessionTab,
  type Workspace,
} from "@/lib/api";

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
  openWorkspace: (id: number, defaultCli: string) => void;
  openTab: (workspaceId: number, cli: string) => void;
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
  closeTab: (workspaceId: number, tabId: string) => void;
  activateTab: (workspaceId: number, tabId: string) => void;
  addWorkspace: (name: string, path: string, cli: string) => Promise<Workspace>;
  removeWorkspace: (id: number) => Promise<void>;
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
    setTabsByWs((prev) => {
      const tabs = prev[workspaceId] ?? [];
      if (cli === "chat") {
        const pickerId = `${workspaceId}:chat`;
        const existing = tabs.find((t) => t.id === pickerId);
        if (existing) {
          setActiveTabByWs((a) => ({ ...a, [workspaceId]: existing.id }));
          return prev;
        }
        const tab: SessionTab = {
          id: pickerId,
          cli: "chat",
          label: "Chats",
        };
        setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
        return { ...prev, [workspaceId]: [...tabs, tab] };
      }
      if (cli !== "shell") {
        const existing = tabs.find((t) => t.cli === cli);
        if (existing) {
          setActiveTabByWs((a) => ({ ...a, [workspaceId]: existing.id }));
          return prev;
        }
        const tab: SessionTab = {
          id: `${workspaceId}:${cli}`,
          cli,
          label: cliLabel(cli),
        };
        setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
        api.updateWorkspaceCli(workspaceId, cli).catch(() => {});
        setWorkspaces((ws) =>
          ws.map((w) => (w.id === workspaceId ? { ...w, cli } : w)),
        );
        return { ...prev, [workspaceId]: [...tabs, tab] };
      }
      const shellCount = tabs.filter((t) => t.cli === "shell").length;
      const n = shellCount + 1;
      const tab: SessionTab = {
        id: `${workspaceId}:shell-${Date.now()}`,
        cli: "shell",
        label: n === 1 ? "Terminal" : `Terminal ${n}`,
      };
      setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
      return { ...prev, [workspaceId]: [...tabs, tab] };
    });
  }, []);

  const openResumeTab = useCallback(
    (workspaceId: number, cli: string, resumeId: string) => {
      const id = `${workspaceId}:${cli}:resume:${resumeId}`;
      setTabsByWs((prev) => {
        const tabs = prev[workspaceId] ?? [];
        if (tabs.some((t) => t.id === id)) {
          setActiveTabByWs((a) => ({ ...a, [workspaceId]: id }));
          return prev;
        }
        const tab: SessionTab = {
          id,
          cli,
          label: `${cliLabel(cli)} (resumed)`,
          resumeId,
        };
        setActiveTabByWs((a) => ({ ...a, [workspaceId]: id }));
        return { ...prev, [workspaceId]: [...tabs, tab] };
      });
    },
    [],
  );

  // The picker tab is the plain `{ws}:chat` tab handled by openTab.
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
          setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
          return prev;
        }
        setActiveTabByWs((a) => ({ ...a, [workspaceId]: tab.id }));
        return { ...prev, [workspaceId]: [...tabs, tab] };
      });
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

  const openWorkspace = useCallback(
    (id: number, defaultCli: string) => {
      setOpenedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      setTabsByWs((prev) => {
        if ((prev[id] ?? []).length === 0) {
          queueMicrotask(() => openTab(id, defaultCli));
        }
        return prev;
      });
    },
    [openTab],
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
        openWorkspace,
        openTab,
        openResumeTab,
        openChatPicker,
        openChatSession,
        newChatDraft,
        setChatTabLabel,
        bindChatDraftToSession,
        closeTab,
        activateTab,
        addWorkspace,
        removeWorkspace,
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
