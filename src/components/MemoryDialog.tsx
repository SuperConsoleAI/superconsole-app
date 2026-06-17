import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Brain, Plus, Search, Trash2 } from "lucide-react";
import {
  api,
  MEMORY_CATEGORIES,
  type MemoryEntry,
  type OrgMemoryEntry,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MemoryDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Editing = {
  category: string;
  slug: string | null;
  title: string;
  tags: string;
  body: string;
} | null;

export function MemoryDialog({ workspaceId, open, onOpenChange }: MemoryDialogProps) {
  const { activeCloudOrg } = useAuth();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const refresh = useCallback(() => {
    api.listMemory(workspaceId).then(setEntries).catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setEditing(null);
      refresh();
    }
  }, [open, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.writeMemory(
        workspaceId,
        editing.category,
        editing.title.trim(),
        editing.body,
        editing.tags.split(",").map((t) => t.trim()).filter(Boolean),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Memory
          </DialogTitle>
          <DialogDescription>
            What this project's agent remembers. Small, focused entries — searched on demand, not
            dumped into every session.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Tabs defaultValue="project">
          <TabsList>
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="org">Org facts</TabsTrigger>
          </TabsList>

          <TabsContent value="project">
            {editing ? (
              <EntryForm
                editing={editing}
                busy={busy}
                onChange={setEditing}
                onBack={() => setEditing(null)}
                onSave={save}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search memory..."
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-destructive"
                    disabled={busy || entries.length === 0}
                    onClick={async () => {
                      if (!confirm("Wipe all memory for this project? This cannot be undone.")) return;
                      setBusy(true);
                      try {
                        await api.wipeMemory(workspaceId);
                        refresh();
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Wipe memory
                  </Button>
                </div>

                <ScrollArea className="max-h-[26rem]">
                  <div className="flex flex-col gap-3 pr-2">
                    {MEMORY_CATEGORIES.map((cat) => {
                      const items = filtered.filter((e) => e.category === cat.id);
                      return (
                        <div key={cat.id}>
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-xs font-semibold text-muted-foreground">
                              {cat.label} ({items.length})
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs"
                              onClick={() =>
                                setEditing({
                                  category: cat.id,
                                  slug: null,
                                  title: "",
                                  tags: "",
                                  body: "",
                                })
                              }
                            >
                              <Plus className="h-3 w-3" />
                              add
                            </Button>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {items.map((e) => (
                              <div
                                key={`${e.category}/${e.slug}`}
                                className="group flex items-start gap-2 rounded-lg border bg-card px-3 py-2"
                              >
                                <button
                                  className="min-w-0 flex-1 text-left"
                                  disabled={e.source === "cloud"}
                                  onClick={() =>
                                    setEditing({
                                      category: e.category,
                                      slug: e.slug,
                                      title: e.title,
                                      tags: e.tags.join(", "),
                                      body: e.body,
                                    })
                                  }
                                >
                                  <div className="flex items-center gap-2">
                                    {e.date && (
                                      <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {e.date}
                                      </span>
                                    )}
                                    <span className="truncate text-sm font-medium">{e.title}</span>
                                    {e.source === "cloud" && (
                                      <Badge variant="outline" className="text-[10px]">
                                        synced
                                      </Badge>
                                    )}
                                  </div>
                                  {e.summary && (
                                    <p className="truncate text-xs text-muted-foreground">
                                      {e.summary}
                                    </p>
                                  )}
                                </button>
                                {e.source !== "cloud" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    title="Delete"
                                    onClick={() =>
                                      api
                                        .deleteMemory(workspaceId, e.category, e.slug)
                                        .then(refresh)
                                        .catch((err) => setError(String(err)))
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="org">
            {activeCloudOrg ? (
              <OrgMemoryPanel orgId={activeCloudOrg.id} orgName={activeCloudOrg.name} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Select an organisation to view shared facts.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  editing,
  busy,
  onChange,
  onBack,
  onSave,
}: {
  editing: NonNullable<Editing>;
  busy: boolean;
  onChange: (v: Editing) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const label = MEMORY_CATEGORIES.find((c) => c.id === editing.category)?.label ?? editing.category;
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="h-7 w-fit px-2" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Button>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={editing.title}
          onChange={(e) => onChange({ ...editing, title: e.target.value })}
          placeholder="Title"
          className="h-8 text-sm"
          disabled={editing.slug !== null}
        />
        <Input
          value={editing.tags}
          onChange={(e) => onChange({ ...editing, tags: e.target.value })}
          placeholder="tags, comma, separated"
          className="h-8 text-sm"
        />
        <Textarea
          value={editing.body}
          onChange={(e) => onChange({ ...editing, body: e.target.value })}
          placeholder="One concept. Short. Searchable."
          className="col-span-2 min-h-40 text-xs"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" className="h-8" onClick={onSave} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}

function OrgMemoryPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [entries, setEntries] = useState<OrgMemoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");

  const refresh = useCallback(() => {
    api.listOrgMemory(orgId).then(setEntries).catch((e) => setError(String(e)));
  }, [orgId]);

  useEffect(refresh, [refresh]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Shared facts every project in {orgName} should know. Owners and admins can edit; everyone's
        agents can read.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="h-8 text-sm"
            />
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tags, comma, separated"
              className="h-8 text-sm"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Agency works with SMBs, always invoice net-30"
              className="col-span-2 min-h-28 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={async () => {
                if (!title.trim()) {
                  setError("Title is required.");
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  await api.writeOrgMemory(
                    orgId,
                    title.trim(),
                    body,
                    tags.split(",").map((t) => t.trim()).filter(Boolean),
                  );
                  setTitle("");
                  setTags("");
                  setBody("");
                  setAdding(false);
                  refresh();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save fact
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-8 w-fit" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add fact
        </Button>
      )}

      <ScrollArea className="max-h-80">
        <div className="flex flex-col gap-1.5 pr-2">
          {entries.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No shared facts yet.
            </p>
          )}
          {entries.map((e) => (
            <div
              key={e.slug}
              className="group flex items-start gap-2 rounded-lg border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{e.title}</span>
                  {e.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                {e.body && (
                  <p className="truncate text-xs text-muted-foreground">{e.body}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                title="Delete"
                onClick={() =>
                  api
                    .deleteOrgMemory(orgId, e.slug)
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
