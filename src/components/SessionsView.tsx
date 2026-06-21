import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FolderInput,
  History,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  api,
  CLI_PRESETS,
  modelDisplayName,
  type ChatSession,
  type CliSession,
  type Organization,
  type SessionLog,
  type Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function parseUtc(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}

function fmtWhen(s: string | null): string {
  const d = parseUtc(s);
  if (!d) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(s: string | null): string {
  const d = parseUtc(s);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function duration(start: string, end: string | null): string {
  const a = parseUtc(start);
  const b = parseUtc(end);
  if (!a || !b) return "";
  const secs = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`;
}

interface CliRow extends SessionLog {
  wsName: string;
}

interface ChatRow extends ChatSession {
  workspaceId: number;
  wsName: string;
}

function snippet(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 64 ? one.slice(0, 64) + "..." : one || "Untitled chat";
}

// Display name for a chat session: custom name, else first user message.
function chatTitle(s: ChatSession): string {
  return s.name?.trim() || snippet(s.first_user ?? s.preview ?? "");
}

const cliLabel = (id: string) => CLI_PRESETS.find((p) => p.id === id)?.label ?? id;

// Default display name for a CLI session when the user hasn't renamed it.
function cliName(s: SessionLog): string {
  return s.label?.trim() || `${cliLabel(s.cli)} session`;
}

export function SessionsView({
  workspaces,
  organizations,
  activeOrgId,
  lastProjectId,
  onOpenChat,
  onResume,
}: {
  workspaces: Workspace[];
  organizations: Organization[];
  activeOrgId: number;
  lastProjectId: number | null;
  onOpenChat: (workspaceId: number, sessionId?: string) => void;
  onResume: (workspaceId: number, cli: string, sessionId: string) => void;
}) {
  const [tab, setTab] = useState<"cli" | "chat">("cli");
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState<number | "all">(activeOrgId);
  const [projFilter, setProjFilter] = useState<number | "all">(lastProjectId ?? "all");
  const [cli, setCli] = useState<CliRow[]>([]);
  const [threads, setThreads] = useState<ChatRow[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [native, setNative] = useState<Record<number, CliSession[] | "loading">>({});

  const wsName = useCallback(
    (id: number) => workspaces.find((w) => w.id === id)?.name ?? "unknown",
    [workspaces],
  );

  const toggleRow = (row: CliRow) => {
    if (expanded === row.id) {
      setExpanded(null);
      return;
    }
    setExpanded(row.id);
    if (native[row.id] === undefined) {
      const ws = workspaces.find((w) => w.id === row.workspace_id);
      if (!ws) return;
      setNative((p) => ({ ...p, [row.id]: "loading" }));
      api
        .listCliSessions(ws.path, row.cli)
        .then((list) => setNative((p) => ({ ...p, [row.id]: list })))
        .catch(() => setNative((p) => ({ ...p, [row.id]: [] })));
    }
  };
  const orgName = (id: number) => organizations.find((o) => o.id === id)?.name ?? "Org";

  // Workspaces under the current org filter drive the project list.
  const orgWorkspaces = useMemo(
    () =>
      orgFilter === "all"
        ? workspaces
        : workspaces.filter((w) => w.organization_id === orgFilter),
    [workspaces, orgFilter],
  );

  const setOrg = (id: number | "all") => {
    setOrgFilter(id);
    setProjFilter("all");
  };

  const load = useCallback(() => {
    Promise.all(
      workspaces.map((w) =>
        api
          .listSessionHistory(w.id)
          .then((rows) => rows.map((r) => ({ ...r, wsName: w.name })))
          .catch(() => [] as CliRow[]),
      ),
    ).then((lists) => {
      const flat = lists.flat();
      flat.sort((a, b) => b.started_at.localeCompare(a.started_at));
      setCli(flat);
    });

    Promise.all(
      workspaces
        .filter((w) => w.project_id)
        .map(async (w): Promise<ChatRow[]> => {
          try {
            const list = await api.listChatSessions(w.project_id as string);
            return list
              .filter((s) => s.message_count > 0)
              .map((s) => ({ ...s, workspaceId: w.id, wsName: w.name }));
          } catch {
            return [];
          }
        }),
    ).then((lists) => {
      const flat = lists.flat();
      flat.sort(
        (a, b) =>
          Number(b.is_star) - Number(a.is_star) ||
          (b.last_at ?? b.updated_at).localeCompare(a.last_at ?? a.updated_at),
      );
      setThreads(flat);
    });
  }, [workspaces]);

  useEffect(() => {
    load();
  }, [load]);

  const [renameTarget, setRenameTarget] = useState<ChatRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState<ChatRow | null>(null);
  const [cliRenameTarget, setCliRenameTarget] = useState<CliRow | null>(null);
  const [cliRenameValue, setCliRenameValue] = useState("");

  const deleteCli = (id: number) => {
    api.deleteCliSession(id).then(load).catch(console.error);
  };
  const submitCliRename = () => {
    if (!cliRenameTarget) return;
    api
      .renameCliSession(cliRenameTarget.id, cliRenameValue.trim() || null)
      .then(() => {
        setCliRenameTarget(null);
        load();
      })
      .catch(console.error);
  };
  const toggleStar = (t: ChatRow) => {
    api.starChatSession(t.id, !t.is_star).then(load).catch(console.error);
  };
  const deleteChat = (t: ChatRow) => {
    api.deleteChatSession(t.id).then(load).catch(console.error);
  };
  const submitRename = () => {
    if (!renameTarget) return;
    api
      .renameChatSession(renameTarget.id, renameValue.trim())
      .then(() => {
        setRenameTarget(null);
        load();
      })
      .catch(console.error);
  };
  const submitMove = (toWorkspaceId: number) => {
    const dest = workspaces.find((w) => w.id === toWorkspaceId);
    if (!moveTarget || !dest?.project_id) return;
    api
      .moveChatSession(moveTarget.id, dest.project_id)
      .then(() => {
        setMoveTarget(null);
        load();
      })
      .catch(console.error);
  };

  const allowedWs = useMemo(() => new Set(orgWorkspaces.map((w) => w.id)), [orgWorkspaces]);
  const matches = (wsId: number) =>
    allowedWs.has(wsId) && (projFilter === "all" || wsId === projFilter);
  const q = query.trim().toLowerCase();

  const filteredCli = useMemo(
    () =>
      cli.filter(
        (r) =>
          matches(r.workspace_id) &&
          (!q ||
            r.wsName.toLowerCase().includes(q) ||
            r.cli.toLowerCase().includes(q) ||
            (r.label ?? "").toLowerCase().includes(q)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cli, allowedWs, projFilter, q],
  );
  const filteredThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          matches(t.workspaceId) &&
          (!q ||
            chatTitle(t).toLowerCase().includes(q) ||
            t.wsName.toLowerCase().includes(q) ||
            (t.preview ?? "").toLowerCase().includes(q) ||
            (t.provider ?? "").toLowerCase().includes(q)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, allowedWs, projFilter, q],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-card/60 px-5">
        <History className="h-4 w-4 text-primary" strokeWidth={1} />
        <h1 className="font-display text-base font-semibold">Sessions</h1>
        <span className="text-xs text-muted-foreground">CLI runs and chat history</span>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {orgFilter === "all" ? "All orgs" : orgName(orgFilter)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOrg("all")}>All orgs</DropdownMenuItem>
              {organizations.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => setOrg(o.id)}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {projFilter === "all" ? "All projects" : wsName(projFilter)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProjFilter("all")}>All projects</DropdownMenuItem>
              {orgWorkspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => setProjFilter(w.id)}>
                  {w.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex gap-0.5 rounded-lg border bg-background p-0.5">
            <Button
              variant={tab === "cli" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => setTab("cli")}
            >
              <Terminal className="h-3.5 w-3.5" strokeWidth={1} />
              CLI
            </Button>
            <Button
              variant={tab === "chat" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => setTab("chat")}
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={1} />
              Chat
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full px-5 pt-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "cli" ? "Search CLI sessions..." : "Search chat history..."}
            className="h-8 w-full pl-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col px-5 py-3">
          {tab === "cli" ? (
            filteredCli.length === 0 ? (
              <Empty icon={<Terminal />} text="No CLI sessions recorded yet." />
            ) : (
              <div className="divide-y divide-border">
                {filteredCli.map((s) => (
                  <div key={s.id}>
                    <div className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent/50">
                      <button
                        onClick={() => toggleRow(s)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2.5 text-left"
                      >
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                            expanded === s.id && "rotate-90",
                          )}
                          strokeWidth={1.5}
                        />
                        <PresetIcon preset={s.cli} className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {cliName(s)}
                        </span>
                        {!s.ended_at && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        )}
                        <span className="hidden max-w-[26%] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                          {s.wsName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtWhen(s.started_at)}
                          {s.ended_at && ` · ${duration(s.started_at, s.ended_at)}`}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setCliRenameTarget(s);
                              setCliRenameValue(s.label ?? "");
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteCli(s.id)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {expanded === s.id && (
                      <NativePanel
                        sessions={native[s.id]}
                        onOpen={(_file, cli, id) => onResume(s.workspace_id, cli, id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )
          ) : filteredThreads.length === 0 ? (
            <Empty icon={<MessageSquare />} text="No chat history yet." />
          ) : (
            <div className="divide-y divide-border">
              {filteredThreads.map((t) => {
                return (
                  <div
                    key={t.id}
                    className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent/50"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2.5 text-left"
                      onClick={() => onOpenChat(t.workspaceId, t.id)}
                    >
                      <ProviderIcon
                        provider={t.provider}
                        className="h-4 w-4 shrink-0 opacity-80"
                      />
                      {t.is_star && (
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {chatTitle(t)}
                      </span>
                      {t.model && (
                        <span className="hidden max-w-[28%] shrink-0 items-center gap-1 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-flex">
                          <ProviderIcon model={t.model} className="h-3 w-3 shrink-0 opacity-50" />
                          {modelDisplayName(t.model, t.provider)}
                        </span>
                      )}
                      <span className="hidden max-w-[26%] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                        {t.wsName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fmtRelative(t.last_at ?? t.updated_at)}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toggleStar(t)}>
                          <Star className="mr-2 h-3.5 w-3.5" />
                          {t.is_star ? "Unstar" : "Star"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameValue(t.name ?? "");
                            setRenameTarget(t);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMoveTarget(t)}>
                          <FolderInput className="mr-2 h-3.5 w-3.5" /> Change project
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteChat(t)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chat name"
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cliRenameTarget} onOpenChange={(o) => !o && setCliRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <Input
            value={cliRenameValue}
            onChange={(e) => setCliRenameValue(e.target.value)}
            placeholder="Session name (leave blank to clear)"
            onKeyDown={(e) => e.key === "Enter" && submitCliRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCliRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitCliRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move chat to project</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {workspaces
              .filter((w) => w.project_id && w.id !== moveTarget?.workspaceId)
              .map((w) => (
                <button
                  key={w.id}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => submitMove(w.id)}
                >
                  <PresetIcon preset={w.cli} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{w.name}</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function NativePanel({
  sessions,
  onOpen,
}: {
  sessions: CliSession[] | "loading" | undefined;
  onOpen: (file: string, cli: string, id: string) => void;
}) {
  return (
    <div className="mb-2 ml-[1.6rem] border-l border-border pl-3">
      {sessions === "loading" || sessions === undefined ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">No native sessions found</p>
      ) : (
        <div className="flex flex-col">
          {sessions.map((ns) => (
            <button
              key={ns.file_path}
              onClick={() => onOpen(ns.file_path, ns.cli, ns.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
            >
              <span className="flex-1 truncate text-muted-foreground">
                {fmtWhen(ns.modified_at)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {ns.message_count} msg{ns.message_count === 1 ? "" : "s"} · {fmtBytes(ns.size_bytes)}
              </span>
              <span className="shrink-0 font-medium text-primary">Open</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto flex h-8 w-8 items-center justify-center text-muted-foreground/40 [&_svg]:h-8 [&_svg]:w-8">
        {icon}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
