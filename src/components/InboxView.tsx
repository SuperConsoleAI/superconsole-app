import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronDown, ChevronRight, Inbox, Trash2, X } from "lucide-react";
import { api, type InboxItem, type Workspace } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const MD_CLASSES =
  "[&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5";

export function InboxView({ workspaces }: { workspaces: Workspace[] }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.listInbox().then(setItems).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("inbox-new", refresh);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const toggle = (item: InboxItem) => {
    const next = expanded === item.id ? null : item.id;
    setExpanded(next);
    if (next !== null && item.status === "unread") {
      api.markInboxRead(item.id).then(refresh).catch(console.error);
    }
  };

  const wsName = (id: number) => workspaces.find((w) => w.id === id)?.name ?? "unknown";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/60 px-5">
        <Inbox className="h-4 w-4 text-primary" />
        <h1 className="font-display text-base font-semibold">Inbox</h1>
        <span className="text-xs text-muted-foreground">
          Output from scheduled jobs across all workspaces
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-4">
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <Inbox className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing here yet. Schedule a job and its output will land here.
              </p>
            </div>
          )}
          {items.map((item) => {
            const isOpen = expanded === item.id;
            const unread = item.status === "unread";
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-lg border bg-card transition-colors",
                  unread && "border-primary/40",
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(item)}
                  onKeyDown={(e) => e.key === "Enter" && toggle(item)}
                  className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <span className={cn("min-w-0 flex-1 truncate text-sm", unread && "font-medium")}>
                    {item.title}
                  </span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {wsName(item.workspace_id)}
                  </Badge>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {item.created_at}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      api.deleteInboxItem(item.id).then(refresh).catch(console.error);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
                {isOpen && (
                  <>
                    <div className={cn("border-t px-5 py-4 text-sm", MD_CLASSES)}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.output}</ReactMarkdown>
                    </div>
                    <div className="flex items-center gap-2 border-t bg-muted/30 px-5 py-2.5">
                      {item.job_id && (
                        <button
                          className="shrink-0 text-xs text-muted-foreground hover:text-primary hover:underline"
                          onClick={() =>
                            api.getInboxSession(item.id).then((session) => {
                              if (session) {
                                window.dispatchEvent(new CustomEvent('resume-session', {
                                  detail: { workspaceId: session.workspace_id, cli: session.cli, sessionId: session.resume_id, sessionType: session.session_type }
                                }));
                              }
                            }).catch(console.error)
                          }
                        >
                          View session →
                        </button>
                      )}
                      {item.status === "approved" ? (
                        <Badge className="gap-1 bg-emerald-600 text-white">
                          <Check className="h-3 w-3" /> Approved
                        </Badge>
                      ) : item.status === "rejected" ? (
                        <Badge variant="destructive" className="gap-1">
                          <X className="h-3 w-3" /> Rejected
                        </Badge>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">
                            Review before the agent publishes or commits:
                          </span>
                          <div className="ml-auto flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                api.setInboxStatus(item.id, "rejected").then(refresh)
                              }
                            >
                              <X className="h-3 w-3" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 gap-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                              onClick={() =>
                                api.setInboxStatus(item.id, "approved").then(refresh)
                              }
                            >
                              <Check className="h-3 w-3" /> Approve
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
