import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, MessageSquare, Pencil, Plus, RefreshCw, Settings2, X } from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  modelDisplayName,
  type ChatMessage,
  type ChatSession,
  type Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import { ChatComposer, type Attachment } from "@/components/ChatComposer";
import { StatusFooter } from "@/components/StatusFooter";
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
  // Opens the workspace files panel (same as the top bar folder icon).
  onOpenFiles: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Quick-insert prompt chips above the composer. They prefill the input (the user
// edits/sends); the model writes any file itself via its tools.
const STARTER_PROMPTS: { label: string; build: () => string }[] = [
  { label: "Explain this project", build: () => "Explain this project's structure and how the pieces fit together." },
  { label: "Plan a feature", build: () => "Help me plan a new feature. Ask clarifying questions first, then propose an approach." },
  { label: "Find a bug", build: () => "Help me track down a bug. Walk me through likely causes and how to verify each." },
];

const SESSION_PROMPTS: { label: string; build: () => string }[] = [
  {
    label: "Session log",
    build: () =>
      `Create a comprehensive session log capturing:
- The original problem and how it evolved
- Key insights and solutions we developed
- My working style and preferences you observed
- Our collaboration approaches that worked well
- Any clarifications or corrections I made
- Project context and examples we used
- Templates or processes we established
- Next steps we identified
Make it detailed enough that a new conversation can pick up exactly where we left off. Save it in the session-log/ folder as session-log/SESSION_LOG_${today()}.md`,
  },
  {
    label: "Summarize",
    build: () =>
      "Summarize this conversation so far into a concise handoff: the goal, key decisions, current state, and open next steps.",
  },
  {
    label: "Next steps",
    build: () => "List the concrete next steps and open items from this conversation as a checklist.",
  },
];

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

export function ChatView({
  workspace,
  visible,
  tabId,
  onRouteToPty,
  onOpenFiles,
}: ChatViewProps) {
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sessionStats, setSessionStats] = useState({ tokens: 0, cost: 0 });
  const [contextTokens, setContextTokens] = useState(0);
  const [commandSlashes, setCommandSlashes] = useState<Set<string>>(new Set());
  const [toolMode, setToolMode] = useState<"auto" | "direct">(() =>
    localStorage.getItem(`superconsole-toolmode-${workspace.id}`) === "direct"
      ? "direct"
      : "auto",
  );
  const [reasoning, setReasoning] = useState<string>(
    () => localStorage.getItem(`superconsole-reasoning-${workspace.id}`) || "low",
  );
  const [agentMode, setAgentMode] = useState<"auto" | "semi" | "manual">(() => {
    const v = localStorage.getItem(`superconsole-agentmode-${workspace.id}`);
    return v === "semi" || v === "manual" ? v : "auto";
  });

  useEffect(() => {
    localStorage.setItem(`superconsole-toolmode-${workspace.id}`, toolMode);
  }, [toolMode, workspace.id]);
  useEffect(() => {
    localStorage.setItem(`superconsole-reasoning-${workspace.id}`, reasoning);
  }, [reasoning, workspace.id]);
  useEffect(() => {
    localStorage.setItem(`superconsole-agentmode-${workspace.id}`, agentMode);
  }, [agentMode, workspace.id]);


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
  const stickRef = useRef(true);

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
    const unDone = listen<{
      request_id: string;
      tokens_prompt: number;
      tokens_completion: number;
      cost_usd: number;
    }>("chat-done", async (e) => {
      if (e.payload.request_id !== reqRef.current) return;
      const content = bufRef.current;
      reqRef.current = null;
      setStreaming(null);
      setSending(false);
      setSessionStats((s) => ({
        tokens: s.tokens + e.payload.tokens_prompt + e.payload.tokens_completion,
        cost: s.cost + e.payload.cost_usd,
      }));
      // The prompt size of the latest turn is the current context window usage.
      setContextTokens(e.payload.tokens_prompt + e.payload.tokens_completion);
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
    if (stickRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, streaming]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    api
      .hasProviderKey(workspace.id, provider)
      .then((has) => setKeyMissing(!has))
      .catch(() => setKeyMissing(false));
  }, [provider, workspace.id]);

  // Project + global commands expand into a chat message (resolved server-side);
  // other slash inputs fall through to the terminal.
  useEffect(() => {
    api
      .listCommands(workspace.id)
      .then((cmds) =>
        setCommandSlashes(
          new Set(cmds.filter((c) => c.source !== "claude").map((c) => c.slash)),
        ),
      )
      .catch(() => setCommandSlashes(new Set()));
  }, [workspace.id]);

  const streamAssistant = async (modelMessages: { role: string; content: string }[]) => {
    const reqId = crypto.randomUUID();
    reqRef.current = reqId;
    bufRef.current = "";
    stickRef.current = true;
    setStreaming("");
    setSending(true);
    setError(null);
    try {
      await api.chatSend(reqId, workspace.id, provider, model, modelMessages, toolMode, reasoning);
    } catch (e) {
      const msg = String(e);
      reqRef.current = null;
      setStreaming(null);
      setSending(false);
      if (msg.includes("NO_KEY")) setKeyMissing(true);
      else setError(msg);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    // A `/slash` that matches a project/global command is expanded server-side
    // and sent as a chat message; anything else is routed to the terminal.
    const slashHead = text.split(/\s/)[0];
    if (text.startsWith("/") && !commandSlashes.has(slashHead) && onRouteToPty(text)) {
      setInput("");
      return;
    }
    if (!projectId || sending) return;
    setError(null);
    setInput("");
    const atts = attachments;
    setAttachments([]);

    let sid = sessionRef.current;
    if (!sid) {
      try {
        const created = await api.createChatSession(projectId);
        sid = created.id;
        setDraftSessionId(sid);
        sessionRef.current = sid;
        firstUserRef.current = text;
        if (isDraft) setChatTabLabel(workspace.id, tabId, tabLabel(text || atts[0]?.name || "Chat"));
      } catch (e) {
        setError(String(e));
        return;
      }
    }

    // Persisted/displayed bubble stays short (attachment names only); the model
    // receives the full file contents appended to the message.
    const displayText = atts.length
      ? `${text}${text ? "\n\n" : ""}📎 ${atts.map((a) => a.name).join(", ")}`
      : text;

    let userMsg: ChatMessage;
    try {
      userMsg = await api.addChatMessage(sid, "user", displayText, provider, model);
    } catch (e) {
      setError(String(e));
      return;
    }
    const next = [...messages, userMsg];
    setMessages(next);

    const attBlocks = atts
      .map((a) => `\n\n--- ${a.name} ---\n\`\`\`\n${a.content}\n\`\`\``)
      .join("");
    const modelMessages = next.map((m, i) =>
      i === next.length - 1
        ? { role: m.role, content: text + attBlocks }
        : { role: m.role, content: m.content },
    );
    streamAssistant(modelMessages);
  };

  const stop = async () => {
    const reqId = reqRef.current;
    if (!reqId) return;
    try {
      await api.stopChat(reqId);
    } catch {
      /* ignore */
    }
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
        /* ignore */
      }
    }
  };

  const regenerate = async () => {
    if (sending) return;
    const revIdx = [...messages].reverse().findIndex((m) => m.role === "assistant");
    if (revIdx === -1) return;
    const idx = messages.length - 1 - revIdx;
    const target = messages[idx];
    const remaining = messages.filter((_, i) => i !== idx);
    setMessages(remaining);
    try {
      await api.deleteChatMessage(target.id);
    } catch {
      /* ignore */
    }
    streamAssistant(remaining.map((m) => ({ role: m.role, content: m.content })));
  };

  // Edit a previous user message: drop it and everything after, then resend the
  // edited text as a fresh turn (forks the conversation from that point).
  const editAndResend = async (idx: number, newText: string) => {
    const text = newText.trim();
    if (!text || sending) return;
    const sid = sessionRef.current;
    if (!sid) return;
    const toDelete = messages.slice(idx);
    const kept = messages.slice(0, idx);
    setMessages(kept);
    setError(null);
    for (const m of toDelete) {
      try {
        await api.deleteChatMessage(m.id);
      } catch {
        /* ignore */
      }
    }
    let userMsg: ChatMessage;
    try {
      userMsg = await api.addChatMessage(sid, "user", text, provider, model);
    } catch (e) {
      setError(String(e));
      return;
    }
    const next = [...kept, userMsg];
    setMessages(next);
    streamAssistant(next.map((m) => ({ role: m.role, content: m.content })));
  };

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
                        {modelDisplayName(s.model, s.provider)}
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !streaming ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <MessageSquare className="h-9 w-9 text-primary/70" strokeWidth={1} />
              <p className="text-base font-medium">How can I help with {workspace.name}?</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m, i) => (
              <ChatBubble
                key={m.id}
                role={m.role}
                content={m.content}
                time={m.created_at}
                onCopy={() => navigator.clipboard.writeText(m.content)}
                onRegenerate={
                  m.role === "assistant" && i === messages.length - 1 && !sending
                    ? regenerate
                    : undefined
                }
                onEdit={
                  m.role === "user" && !sending
                    ? (t: string) => editAndResend(i, t)
                    : undefined
                }
              />
            ))}
            {streaming !== null && <ChatBubble role="assistant" content={streaming || "…"} />}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div>
      )}

      {!streaming && (
        <div className="flex w-full flex-wrap gap-1.5 px-4 py-2">
          {(messages.length === 0 ? STARTER_PROMPTS : SESSION_PROMPTS).map((p) => (
            <button
              key={p.label}
              className="rounded border border-dashed bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              onClick={() => setInput(p.build())}
              title="Insert prompt (editable before sending)"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <ChatComposer
        workspaceId={workspace.id}
        projectId={projectId}
        input={input}
        setInput={setInput}
        onSend={send}
        sending={sending}
        onStop={stop}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        attachments={attachments}
        setAttachments={setAttachments}
        toolMode={toolMode}
        setToolMode={setToolMode}
        reasoning={reasoning}
        setReasoning={setReasoning}
        agentMode={agentMode}
        setAgentMode={setAgentMode}
      />

      <StatusFooter
        workspace={workspace}
        onOpenFiles={onOpenFiles}
        refreshKey={messages.length}
        context={contextTokens}
        tokens={sessionStats.tokens}
        cost={sessionStats.cost}
      />
    </div>
  );
}

function ChatBubble({
  role,
  content,
  time,
  onCopy,
  onRegenerate,
  onEdit,
}: {
  role: "user" | "assistant";
  content: string;
  time?: string;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  if (editing) {
    return (
      <div className="flex w-full flex-col items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) onEdit?.(draft);
              setEditing(false);
            } else if (e.key === "Escape") {
              setDraft(content);
              setEditing(false);
            }
          }}
          autoFocus
          rows={Math.min(draft.split("\n").length + 1, 12)}
          className="w-[85%] resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex gap-2 text-xs">
          <button
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setDraft(content);
              setEditing(false);
            }}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
            disabled={!draft.trim()}
            onClick={() => {
              onEdit?.(draft);
              setEditing(false);
            }}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
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
      <div className="flex h-4 items-center gap-2 px-1 opacity-0 transition-opacity group-hover:opacity-100">
        {time && <span className="text-[10px] text-muted-foreground">{fmtWhen(time)}</span>}
        {onEdit && (
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            title="Edit"
            onClick={() => {
              setDraft(content);
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        {onCopy && (
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            title="Copy"
            onClick={() => {
              onCopy();
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <span className="text-[10px]">Copied</span> : <Copy className="h-3 w-3" />}
          </button>
        )}
        {onRegenerate && (
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            title="Regenerate"
            onClick={onRegenerate}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
