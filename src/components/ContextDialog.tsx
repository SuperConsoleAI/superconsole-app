import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileDown, FileText, Plus, Trash2 } from "lucide-react";
import { api, type ContextFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ContextDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Editing = { slug: string; isNew: boolean; content: string } | null;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ContextDialog({ workspaceId, open, onOpenChange }: ContextDialogProps) {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const refresh = useCallback(() => {
    api.listContextFiles(workspaceId).then(setFiles).catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      setEditing(null);
      setError(null);
      refresh();
    }
  }, [open, refresh]);

  const openEditor = async (slug: string) => {
    try {
      const content = await api.readContextFile(workspaceId, slug);
      setEditing({ slug, isNew: false, content });
    } catch (e) {
      setError(String(e));
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.slug.trim()) {
      setError("File name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.writeContextFile(workspaceId, editing.slug.trim(), editing.content);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" strokeWidth={1} />
            Context
          </DialogTitle>
          <DialogDescription>
            Files your agent can reference on demand. Not injected automatically — fetched when
            relevant.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {editing ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-fit px-2"
              onClick={() => setEditing(null)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Input
              value={editing.slug}
              onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
              placeholder="file-name (e.g. brand-voice)"
              className="h-8 text-sm"
              disabled={!editing.isNew}
            />
            <Textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              placeholder="Markdown content the agent can reference on demand."
              className="min-h-64 font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button size="sm" className="h-8" onClick={save} disabled={busy}>
                Save file
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8"
                onClick={() => setEditing({ slug: "", isNew: true, content: "" })}
              >
                <Plus className="h-3.5 w-3.5" />
                New file
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={busy}
                title="Copy README, CLAUDE.md, brand-voice, AGENTS.md, about.md into context"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.seedContextFiles(workspaceId);
                    refresh();
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <FileDown className="h-3.5 w-3.5" />
                Seed from workspace
              </Button>
            </div>

            <ScrollArea className="max-h-[28rem]">
              <div className="flex flex-col gap-1.5 pr-2">
                {files.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No context files yet. Add files your agent should know about.
                  </p>
                )}
                {files.map((f) => (
                  <div
                    key={f.slug}
                    className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openEditor(f.slug)}
                    >
                      <span className="truncate text-sm font-medium">{f.slug}.md</span>
                    </button>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {fmtSize(f.size_bytes)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="Delete"
                      onClick={() =>
                        api
                          .deleteContextFile(workspaceId, f.slug)
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
        )}
      </DialogContent>
    </Dialog>
  );
}
