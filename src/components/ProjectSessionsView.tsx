import { useCallback, useEffect, useState } from "react";
import { History, Trash2, FileText } from "lucide-react";
import { api, type SessionLogFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function ProjectSessionsView({ workspaceId }: { workspaceId: number }) {
  const [sessions, setSessions] = useState<SessionLogFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!workspaceId) return;
    api.listSessionLogFiles(workspaceId).then(setSessions).catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [workspaceId, refresh]);

  return (
    <div className="flex flex-col gap-4 p-5 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5 text-primary" strokeWidth={1} />
          Sessions
        </h2>
        <p className="text-sm text-muted-foreground">
          Saved chat sessions in this project. Agents can read these for context.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-1.5 pr-2">
          {sessions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No saved sessions yet.
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className="group flex items-start gap-2 rounded-lg border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate text-sm font-medium">{s.id}</span>
                  {s.agentName && (
                    <Badge variant="outline" className="text-[10px]">
                      {s.agentName}
                    </Badge>
                  )}
                  {s.date && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(s.date).toLocaleString()}
                    </span>
                  )}
                </div>
                {s.summary && (
                  <p className="truncate text-xs text-muted-foreground mt-1">{s.summary}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                title="Delete"
                onClick={() =>
                  api
                    .deleteSessionLogFile(workspaceId, s.id)
                    .then(refresh)
                    .catch((err) => setError(String(err)))
                }
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
