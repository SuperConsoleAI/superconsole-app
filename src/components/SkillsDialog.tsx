import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileDown,
  Pencil,
  Plus,
  
  Trash2,
} from "lucide-react";
import {
  api,
  SKILL_CATEGORIES,
  type LibrarySkill,
  type Skill,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface SkillsDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Editing = { name: string; content: string } | null;

export function SkillsView({ workspaceId }: { workspaceId: number }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [detected, setDetected] = useState<Skill[]>([]);
  const [library, setLibrary] = useState<LibrarySkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listSkills(workspaceId).then(setSkills).catch((e) => setError(String(e)));
    api.scanDetectedSkills(workspaceId).then(setDetected).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    refresh();
    if (library.length === 0) {
      api.listSkillLibrary().then(setLibrary).catch(() => {});
    }
  }, [refresh, library.length]);

  const installed = new Set(skills.map((s) => s.name));

  return (
    <div className="flex h-full flex-col overflow-hidden px-5 py-4">



        {error && <p className="text-xs text-destructive">{error}</p>}

        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My Skills</TabsTrigger>
                        <TabsTrigger value="library">Browse Library</TabsTrigger>
            <TabsTrigger value="create">New / Import</TabsTrigger>
          </TabsList>

          <TabsContent value="mine">
            <MySkills
              workspaceId={workspaceId}
              skills={skills}
              detected={detected}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              refresh={refresh}
            />
          </TabsContent>

          
          <TabsContent value="library">
            <LibraryBrowser
              library={library}
              installed={installed}
              busy={busy}
              onInstall={async (name) => {
                setBusy(name);
                try {
                  await api.installLibrarySkillGlobal(name);
                  await api.materializeSkillToWorkspace(workspaceId, name);
                  refresh();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(null);
                }
              }}
            />
          </TabsContent>

          <TabsContent value="create">
            <CreateImport
              workspaceId={workspaceId}
              setError={setError}
              onDone={refresh}
            />
          </TabsContent>
        </Tabs>
      
    </div>
  );
}

export function SkillsDialog({ workspaceId, open, onOpenChange }: SkillsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <SkillsView workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  );
}

function MySkills({
  workspaceId,
  skills,
  detected,
  busy,
  setBusy,
  setError,
  refresh,
}: {
  workspaceId: number;
  skills: Skill[];
  detected: Skill[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);

  const openEditor = async (skill: Skill) => {
    try {
      const content = await api.readWorkspaceSkill(workspaceId, skill.file_path);
      setEditing({ name: skill.name, content });
    } catch (e) {
      setError(String(e));
    }
  };

  const saveEditor = async () => {
    if (!editing) return;
    setBusy(editing.name);
    try {
      await api.updateSkill(workspaceId, editing.name, editing.content);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  if (editing) {
    return (
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
        <span className="text-sm font-medium">{editing.name}</span>
        <Textarea
          value={editing.content}
          onChange={(e) => setEditing({ ...editing, content: e.target.value })}
          className="min-h-72 font-mono text-xs"
        />
        <div className="flex justify-end">
          <Button size="sm" className="h-8" onClick={saveEditor} disabled={busy === editing.name}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[420px]">
      <div className="flex flex-col gap-1.5 pb-2 pr-2">
        {skills.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No skills yet. Add one from the library or create your own.
          </p>
        )}
        {skills.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
          >
            <button
              className={cn(
                "h-4 w-7 shrink-0 rounded-full transition-colors",
                s.active ? "bg-primary" : "bg-muted",
              )}
              title={s.active ? "Active — disable" : "Inactive — enable"}
              onClick={() =>
                api
                  .setSkillActive(workspaceId, s.name, !s.active)
                  .then(refresh)
                  .catch((e) => setError(String(e)))
              }
            >
              <span
                className={cn(
                  "block h-3 w-3 rounded-full bg-background transition-transform",
                  s.active ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{s.name}</span>
                <Badge
                  variant={s.source === "superconsole" ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {s.source === "superconsole" ? "in repo" : "reference"}
                </Badge>
                {s.tags.slice(0, 2).map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
              {s.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
              )}
            </div>
            {s.source === "superconsole" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Edit"
                onClick={() => openEditor(s)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Materialize into repo (.superconsole/skills/)"
                disabled={busy === s.name}
                onClick={() => {
                  setBusy(s.name);
                  api
                    .materializeSkillToWorkspace(workspaceId, s.name)
                    .then(refresh)
                    .catch((e) => setError(String(e)))
                    .finally(() => setBusy(null));
                }}
              >
                <FileDown className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={s.source === "superconsole" ? "Delete from repo" : "Detach reference"}
              disabled={busy === s.name}
              onClick={() =>
                (s.source === "superconsole"
                  ? api.deleteSkill(workspaceId, s.name)
                  : api.detachSkillFromProject(workspaceId, s.name)
                )
                  .then(refresh)
                  .catch((e) => setError(String(e)))
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}

        {detected.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              Detected in this repo
            </p>
            {detected.map((d) => (
              <div
                key={d.file_path}
                className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <p className="truncate text-xs text-muted-foreground">{d.file_path}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0"
                  disabled={busy === d.name}
                  onClick={async () => {
                    setBusy(d.name);
                    try {
                      const content = await api.readWorkspaceSkill(workspaceId, d.file_path);
                      await api.createSkill(workspaceId, d.name, d.description, d.tags, content);
                      refresh();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Activate
                </Button>
              </div>
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function LibraryBrowser({
  library,
  installed,
  busy,
  onInstall,
}: {
  library: LibrarySkill[];
  installed: Set<string>;
  busy: string | null;
  onInstall: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const filtered = library.filter((l) => {
    const matchesCat = category === "all" || l.category === category;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      l.name.includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.tags.some((t) => t.includes(q));
    return matchesCat && matchesQuery;
  });

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search skills..."
        className="h-8 text-sm"
      />
      <div className="flex flex-wrap gap-1">
        {SKILL_CATEGORIES.map((c) => (
          <Button
            key={c.id}
            variant={category === c.id ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>
      <ScrollArea className="max-h-80">
        <div className="flex flex-col gap-1.5 pb-2 pr-2">
          {filtered.map((l) => {
            const isInstalled = installed.has(l.name);
            return (
              <div
                key={l.name}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{l.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {l.category}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{l.description}</p>
                </div>
                <Button
                  variant={isInstalled ? "ghost" : "outline"}
                  size="sm"
                  className="h-7 shrink-0"
                  disabled={isInstalled || busy === l.name}
                  onClick={() => onInstall(l.name)}
                >
                  {!isInstalled && <Download className="h-3.5 w-3.5" />}
                  {isInstalled ? "Installed" : "Install"}
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function CreateImport({
  workspaceId,
  setError,
  onDone,
}: {
  workspaceId: number;
  setError: (v: string | null) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("## Instructions\n");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      setError("Skill name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createSkill(
        workspaceId,
        name.trim(),
        description.trim(),
        tags.split(",").map((t) => t.trim()).filter(Boolean),
        body,
      );
      setName("");
      setDescription("");
      setTags("");
      setBody("## Instructions\n");
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const importUrl = async () => {
    if (!url.trim()) {
      setError("Paste a GitHub or raw .md URL.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const skill = await api.importGlobalSkillFromUrl(url.trim(), null);
      await api.materializeSkillToWorkspace(workspaceId, skill.name);
      setUrl("");
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">New skill</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="skill-name"
            className="h-8 text-sm"
          />
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags, comma, separated"
            className="h-8 text-sm"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-line description"
            className="col-span-2 h-8 text-sm"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="col-span-2 min-h-40 font-mono text-xs"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" className="h-8" onClick={create} disabled={busy}>
            <Plus className="h-3.5 w-3.5" />
            Create skill
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Import from URL</p>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/blob/main/SKILL.md"
            className="h-8 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={importUrl} disabled={busy}>
            <Download className="h-3.5 w-3.5" />
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}
