import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, SendHorizonal, Settings2, X } from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  type ChatMessage,
  type ChatSession,
  type Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import { useAuth } from "@/lib/auth-context";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

interface ChatViewProps {
  workspace: Workspace;
  visible: boolean;
  // The chat tab this view backs. Picker tab `{ws}:chat`, draft tab
  // `{ws}:chat:draft:{n}`, or a concrete session tab `{ws}:chat:{sessionId}`.
  tabId: string;
  // Returns true if the slash command was routed to a terminal session.
  onRouteToPty: (text: string) => boolean;
}

const CUSTOM = "__custom__";

function providerModels(provider: string): readonly string[] {
  return CHAT_PROVIDERS.find((p) => p.id === provider)?.models ?? [];
}

function snippet(s: string, max = 40): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max) + "…" : one;
}

// Tab label: the first two words of the opening message.
function tabLabel(s: string): string {
  const words = s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, 2).join(" ") || "Chat";
}

function sessionTitle(s: ChatSession): string {
  return s.name?.trim() || snippet(s.first_user ?? s.preview ?? "") || "Untitled chat";
}

function fmtWhen(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
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

export function ChatView({ workspace, visible, tabId, onRouteToPty }: ChatViewProps) {
  const { activeCloudOrgId } = useAuth();
  const { openChatSession, newChatDraft, setChatTabLabel, bindChatDraftToSession, closeTab } =
    useWorkspaces();
  const storageKey = `superconsole-chat-${workspace.id}`;

  const prefix = `${workspace.id}:chat`;
  const isPicker = tabId === prefix;
  const isDraft = tabId.startsWith(`${prefix}:draft:`);
  const fixedSessionId = !isPicker && !isDraft ? tabId.slice(prefix.length + 1) : null;

  const [projectId, setProjectId] = useState<string | null>(workspace.project_id);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [input, setInput] = useState("");

  const sessionId = isPicker ? null : isDraft ? draftSessionId : fixedSessionId;
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;
  const boundRef = useRef(false);
  const firstUserRef = useRef<string>("");

  const [provider, setProvider] = useState<string>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved).provider : CHAT_PROVIDERS[0].id;
  });
  const [model, setModel] = useState<string>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved).model : CHAT_PROVIDERS[0].models[0];
  });

  const reqRef = useRef<string | null>(null);
  const bufRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ provider, model }));
  }, [provider, model, storageKey]);

  // Resolve/create the cloud project that chat history is keyed by.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (workspace.project_id) {
        setProjectId(workspace.project_id);
        return;
      }
      if (!activeCloudOrgId) {
        setProjectId(null);
        setProjectError("Select an organization in Settings → Account first.");
        return;
      }
      try {
        const pid = await api.ensureWorkspaceProject(workspace.id, activeCloudOrgId);
        if (!cancelled) {
          setProjectId(pid);
          setProjectError(null);
        }
      } catch (e) {
        if (!cancelled) setProjectError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.id, workspace.project_id, activeCloudOrgId]);

  // The picker lists the project's sessions; refresh when it becomes visible.
  useEffect(() => {
    if (isPicker && visible && projectId) {
      api.listChatSessions(projectId).then(setSessions).catch(() => {});
    }
  }, [isPicker, visible, projectId]);

  // Load the conversation for a concrete/draft session.
  useEffect(() => {
    if (sessionId) {
      api.listChatMessages(sessionId).then(setMessages).catch(() => {});
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    const unToken = listen<{ request_id: string; content: string }>("chat-token", (e) => {
      if (e.payload.request_id !== reqRef.current) return;
      bufRef.current += e.payload.content;
      setStreaming(bufRef.current);
    });
    const unDone = listen<{ request_id: string }>("chat-done", async (e) => {
      if (e.payload.request_id !== reqRef.current) return;
      const content = bufRef.current;
      reqRef.current = null;
      setStreaming(null);
      setSending(false);
      const sid = sessionRef.current;
      if (content && sid) {
        try {
          const msg = await api.addChatMessage(sid, "assistant", content, provider, model);
          setMessages((m) => [...m, msg]);
        } catch {
          /* ignore persistence error */
        }
      }
      // First completed turn of a draft: promote the tab to a session tab so it
      // dedupes and shows the chat title.
      if (isDraft && sid && !boundRef.current) {
        boundRef.current = true;
        bindChatDraftToSession(workspace.id, tabId, sid, tabLabel(firstUserRef.current));
      }
    });
    const unError = listen<{ request_id: string; message: string }>("chat-error", (e) => {
      if (e.payload.request_id !== reqRef.current) return;
      reqRef.current = null;
      setStreaming(null);
      setSending(false);
      setError(e.payload.message);
    });
    return () => {
      unToken.then((fn) => fn());
      unDone.then((fn) => fn());
      unError.then((fn) => fn());
    };
  }, [provider, model, isDraft, tabId, workspace.id, bindChatDraftToSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  useEffect(() => {
    api
      .hasProviderKey(workspace.id, provider)
      .then((has) => setKeyMissing(!has))
      .catch(() => setKeyMissing(false));
  }, [provider, workspace.id]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith("/") && onRouteToPty(text)) {
      setInput("");
      return;
    }
    if (!projectId || sending) return;
    setError(null);
    setInput("");

    let sid = sessionRef.current;
    if (!sid) {
      try {
        const created = await api.createChatSession(projectId);
        sid = created.id;
        setDraftSessionId(sid);
        sessionRef.current = sid;
        firstUserRef.current = text;
        if (isDraft) setChatTabLabel(workspace.id, tabId, tabLabel(text));
      } catch (e) {
        setError(String(e));
        return;
      }
    }

    let userMsg: ChatMessage;
    try {
      userMsg = await api.addChatMessage(sid, "user", text, provider, model);
    } catch (e) {
      setError(String(e));
      return;
    }
    const next = [...messages, userMsg];
    setMessages(next);

    const reqId = crypto.randomUUID();
    reqRef.current = reqId;
    bufRef.current = "";
    setStreaming("");
    setSending(true);

    try {
      await api.chatSend(
        reqId,
        workspace.id,
        provider,
        model,
        next.map((m) => ({ role: m.role, content: m.content })),
      );
    } catch (e) {
      const msg = String(e);
      reqRef.current = null;
      setStreaming(null);
      setSending(false);
      if (msg.includes("NO_KEY")) setKeyMissing(true);
      else setError(msg);
    }
  };

  const models = providerModels(provider);
  const modelSelectValue = models.includes(model) ? model : CUSTOM;

  // The picker: a box of recent chats + a button to start a new session.
  if (isPicker) {
    const recent = sessions.slice(0, 10);
    return (
      <div className={visible ? "flex h-full min-h-0 flex-col" : "hidden"}>
        {projectError && (
          <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {projectError}
          </div>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-md flex-col rounded-xl border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Chats</p>
                <p className="text-xs text-muted-foreground">
                  Recent conversations in {workspace.name}
                </p>
              </div>
              <button
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => closeTab(workspace.id, tabId)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex max-h-[50vh] flex-col overflow-y-auto p-1.5">
              {recent.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No chats yet. Start a new one below.
                </p>
              ) : (
                recent.map((s) => (
                  <button
                    key={s.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50"
                    onClick={() => openChatSession(workspace.id, s.id, sessionTitle(s))}
                  >
                    <ProviderIcon provider={s.provider} className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="min-w-0 flex-1 truncate text-sm">{sessionTitle(s)}</span>
                    {s.model && (
                      <span className="hidden max-w-[40%] shrink-0 items-center gap-1 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                        <ProviderIcon model={s.model} className="h-3 w-3 shrink-0 opacity-50" />
                        {s.model}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {fmtWhen(s.last_at ?? s.updated_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t p-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={() => newChatDraft(workspace.id)}
              >
                <Plus className="h-4 w-4" />
                Start new chat session
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={visible ? "flex h-full min-h-0 flex-col" : "hidden"}>
      {keyMissing && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span>No API key for this provider. Add one in Settings → Models.</span>
        </div>
      )}
      {projectError && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {projectError}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            <div>
              <p>Chat with your project context.</p>
              <p className="mt-1 text-xs">
                CLAUDE.md, brand-voice.md and HEARTBEAT.md are auto-injected. Type{" "}
                <span className="font-mono">/</span> to run a terminal command.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) => (
              <ChatBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {streaming !== null && <ChatBubble role="assistant" content={streaming || "…"} />}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div>
      )}

      <div className="border-t bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message, or / for a terminal command…"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            spellCheck={false}
          />
          <div className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background pl-2">
            <ProviderIcon provider={provider} className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value;
                setProvider(p);
                setModel(providerModels(p)[0] ?? "");
              }}
              className="h-full bg-transparent pr-1.5 text-xs focus-visible:outline-none"
            >
              {CHAT_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {"recommended" in p && p.recommended ? " ★" : ""}
                </option>
              ))}
            </select>
          </div>
          {modelSelectValue === CUSTOM ? (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model id"
              className="h-9 w-36 rounded-md border border-input bg-background px-2 font-mono text-xs"
            />
          ) : (
            <div className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background pl-2">
              <ProviderIcon model={model} className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <select
                value={modelSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setModel(v === CUSTOM ? "" : v);
                }}
                className="h-full bg-transparent pr-1.5 text-xs focus-visible:outline-none"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={CUSTOM}>Custom…</option>
              </select>
            </div>
          )}
          <Button size="icon" variant="secondary" disabled={sending} onClick={send}>
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-2.5 text-sm",
          isUser ? "bg-primary/10 text-foreground" : "border bg-card text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
