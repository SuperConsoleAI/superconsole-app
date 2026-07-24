import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookText, FileDown, Plus, Search, Trash2 } from "lucide-react";
import { api, type WikiPage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WikiDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Editing = {
  slug: string | null;
  title: string;
  summary: string;
  tags: string;
  body: string;
} | null;

export function WikiView({ workspaceId }: { workspaceId: number }) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const refresh = useCallback(() => {
    if (!workspaceId) return;
    api.listWiki(workspaceId).then(setPages).catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    setQuery("");
    setEditing(null);
    refresh();
  }, [workspaceId, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [pages, query]);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.writeWiki(
        workspaceId,
        editing.slug,
        editing.title.trim(),
        editing.summary.trim(),
        editing.tags.split(",").map((t) => t.trim()).filter(Boolean),
        editing.body,
      );
      setEditing(null);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 h-full">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookText className="h-5 w-5 text-primary" />
          Wiki
        </h2>
        <p className="text-sm text-muted-foreground">
          The project's permanent reference. Focused pages the agent reads on demand — what you
          want it to always know.
        </p>
      </div>

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
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Page title"
                className="h-8 text-sm"
              />
              <Input
                value={editing.tags}
                onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
                placeholder="tags, comma, separated"
                className="h-8 text-sm"
              />
              <Input
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                placeholder="One-line summary (shown in the index)"
                className="col-span-2 h-8 text-sm"
              />
              <Textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Markdown content. One topic per page; keep it focused."
                className="col-span-2 min-h-64 font-mono text-xs"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="h-8" onClick={save} disabled={busy}>
                Save page
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search wiki..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                onClick={() =>
                  setEditing({ slug: null, title: "", summary: "", tags: "", body: "## \n" })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                New page
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={busy}
                title="Create pages from README, CLAUDE.md, docs/"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.seedWikiFromFiles(workspaceId);
                    refresh();
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <FileDown className="h-3.5 w-3.5" />
                Seed
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-1.5 pr-2">
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No pages yet. Create one or seed from your project files.
                  </p>
                )}
                {filtered.map((p) => (
                  <div
                    key={p.slug}
                    className="group flex items-start gap-2 rounded-lg border bg-card px-3 py-2"
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setEditing({
                          slug: p.slug,
                          title: p.title,
                          summary: p.summary,
                          tags: p.tags.join(", "),
                          body: p.body,
                        })
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{p.title}</span>
                        {p.source === "cloud" && (
                          <Badge variant="outline" className="text-[10px]">
                            synced
                          </Badge>
                        )}
                        {p.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      {p.summary && (
                        <p className="truncate text-xs text-muted-foreground">{p.summary}</p>
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="Delete"
                      onClick={() =>
                        api
                          .deleteWiki(workspaceId, p.slug)
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
        <p className="mt-3 border-t border-border/50 pt-3 text-center text-xs text-muted-foreground">
          Wiki pages are plain Markdown — edit in any editor, committed to git automatically.
        </p>
    </div>
  );
}

export function WikiDialog({ workspaceId, open, onOpenChange }: WikiDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 overflow-hidden">
        {open && <WikiView workspaceId={workspaceId} />}
      </DialogContent>
    </Dialog>
  );
}
