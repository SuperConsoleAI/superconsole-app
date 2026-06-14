import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SendHorizonal, Settings2, Trash2 } from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  type ChatMessage,
  type Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface ChatViewProps {
  workspace: Workspace;
  visible: boolean;
  // Returns true if the slash command was routed to a terminal session.
  onRouteToPty: (text: string) => boolean;
}

const CUSTOM = "__custom__";

function providerModels(provider: string): readonly string[] {
  return CHAT_PROVIDERS.find((p) => p.id === provider)?.models ?? [];
}

export function ChatView({ workspace, visible, onRouteToPty }: ChatViewProps) {
  const { activeCloudOrgId } = useAuth();
  const storageKey = `superconsole-chat-${workspace.id}`;

  const [projectId, setProjectId] = useState<string | null>(workspace.project_id);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [input, setInput] = useState("");

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

  // Chat history is keyed by project_id; resolve/create one for the workspace.
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

  useEffect(() => {
    if (projectId) api.listChatMessages(projectId).then(setMessages).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    api
      .hasProviderKey(workspace.id, provider)
      .then((has) => setKeyMissing(!has))
      .catch(() => setKeyMissing(false));
  }, [provider, workspace.id, projectId]);

  useEffect(() => {
    const unToken = listen<{ request_id: string; content: string }>(
      "chat-token",
      (e) => {
        if (e.payload.request_id !== reqRef.current) return;
        bufRef.current += e.payload.content;
        setStreaming(bufRef.current);
      },
    );
    const unDone = listen<{ request_id: string }>("chat-done", async (e) => {
      if (e.payload.request_id !== reqRef.current) return;
      const content = bufRef.current;
      reqRef.current = null;
      setStreaming(null);
      setSending(false);
      if (content && projectId) {
        try {
          const msg = await api.addChatMessage(
            projectId,
            "assistant",
            content,
            provider,
            model,
          );
          setMessages((m) => [...m, msg]);
        } catch {
          /* ignore persistence error */
        }
      }
    });
    const unError = listen<{ request_id: string; message: string }>(
      "chat-error",
      (e) => {
        if (e.payload.request_id !== reqRef.current) return;
        reqRef.current = null;
        setStreaming(null);
        setSending(false);
        setError(e.payload.message);
      },
    );
    return () => {
      unToken.then((fn) => fn());
      unDone.then((fn) => fn());
      unError.then((fn) => fn());
    };
  }, [projectId, provider, model]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

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

    let userMsg: ChatMessage;
    try {
      userMsg = await api.addChatMessage(projectId, "user", text, null, null);
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

  const clearChat = async () => {
    if (!projectId) return;
    await api.clearChatMessages(projectId).catch(() => {});
    setMessages([]);
  };

  const models = providerModels(provider);
  const modelSelectValue = models.includes(model) ? model : CUSTOM;

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
                CLAUDE.md, brand-voice.md and HEARTBEAT.md are auto-injected.
                Type <span className="font-mono">/</span> to run a terminal
                command.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground"
                  onClick={clearChat}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </div>
            )}
            {messages.map((m) => (
              <ChatBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {streaming !== null && (
              <ChatBubble role="assistant" content={streaming || "…"} />
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
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
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value;
              setProvider(p);
              setModel(providerModels(p)[0] ?? "");
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            {CHAT_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {"recommended" in p && p.recommended ? " ★" : ""}
              </option>
            ))}
          </select>
          {modelSelectValue === CUSTOM ? (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model id"
              className="h-9 w-36 rounded-md border border-input bg-background px-2 font-mono text-xs"
            />
          ) : (
            <select
              value={modelSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                setModel(v === CUSTOM ? "" : v);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={CUSTOM}>Custom…</option>
            </select>
          )}
          <Button
            size="icon"
            variant="secondary"
            disabled={sending}
            onClick={send}
          >
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
