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
        const existing = tabs.find((t) => t.cli === "chat");
        if (existing) {
          setActiveTabByWs((a) => ({ ...a, [workspaceId]: existing.id }));
          return prev;
        }
        const tab: SessionTab = {
          id: `${workspaceId}:chat`,
          cli: "chat",
          label: "Chat",
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
