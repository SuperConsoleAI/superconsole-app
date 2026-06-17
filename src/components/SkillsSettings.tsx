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
  type OrgSkillView,
  type Skill,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// --- account scope: machine-global personal library ---

export function AccountSkillsSection() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [library, setLibrary] = useState<LibrarySkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");

  const refresh = useCallback(() => {
    api.listGlobalSkills().then(setSkills).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    api.listSkillLibrary().then(setLibrary).catch(() => {});
  }, [refresh]);

  const installed = new Set(skills.map((s) => s.name));

  const openEditor = async (name: string) => {
    try {
      setEditing({ name, content: await api.getGlobalSkill(name) });
    } catch (e) {
      setError(String(e));
    }
  };

  if (editing) {
    return (
      <Editor
        title={editing.name}
        content={editing.content}
        busy={busy === editing.name}
        onChange={(content) => setEditing({ ...editing, content })}
        onBack={() => setEditing(null)}
        onSave={async () => {
          setBusy(editing.name);
          try {
            await api.updateGlobalSkill(editing.name, editing.content);
            setEditing(null);
            refresh();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(null);
          }
        }}
      />
    );
  }

  if (creating) {
    return (
      <CreateForm
        onCancel={() => setCreating(false)}
        onCreate={async (name, description, tags, body) => {
          await api.createGlobalSkill(name, description, tags, body);
          setCreating(false);
          refresh();
        }}
        setError={setError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionIntro>
        Your personal skill library, stored on this machine and available to every project. Org and
        project scopes reference these skills by name.
      </SectionIntro>
      <Err msg={error} />

      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New skill
        </Button>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Import from GitHub or raw .md URL"
          className="h-8 flex-1 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!url.trim() || busy === "__import"}
          onClick={async () => {
            setBusy("__import");
            setError(null);
            try {
              await api.importGlobalSkillFromUrl(url.trim(), null);
              setUrl("");
              refresh();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Import
        </Button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Your skills</p>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-1.5 pr-2">
            {skills.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No global skills yet. Create one or install from the library below.
              </p>
            )}
            {skills.map((s) => (
              <Row key={s.name} skill={s}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="Edit"
                  onClick={() => openEditor(s.name)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="Delete"
                  disabled={busy === s.name}
                  onClick={() =>
                    api
                      .deleteGlobalSkill(s.name)
                      .then(refresh)
                      .catch((e) => setError(String(e)))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </Row>
            ))}
          </div>
        </ScrollArea>
      </div>

      <LibraryGrid
        library={library}
        installed={installed}
        busy={busy}
        actionLabel="Install"
        onAction={async (name) => {
          setBusy(name);
          try {
            await api.installLibrarySkillGlobal(name);
            refresh();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}

// --- org scope: references to global-library skills ---

export function OrgSkillsSection({ orgId }: { orgId: string }) {
  const [refs, setRefs] = useState<OrgSkillView[]>([]);
  const [global, setGlobal] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listOrgSkills(orgId).then(setRefs).catch((e) => setError(String(e)));
    api.listGlobalSkills().then(setGlobal).catch(() => {});
  }, [orgId]);

  useEffect(refresh, [refresh]);

  const attached = new Set(refs.map((r) => r.name));

  return (
    <div className="flex flex-col gap-4">
      <SectionIntro>
        Skills shared across this organisation. These reference your machine-global skills by name
        (no content is copied). Members see them in projects under this org.
      </SectionIntro>
      <Err msg={error} />

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Attached to org</p>
        <div className="flex flex-col gap-1.5">
          {refs.length === 0 && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              No skills attached yet. Pick from your library below.
            </p>
          )}
          {refs.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  {!r.in_library && (
                    <Badge variant="outline" className="text-[10px] text-amber-600">
                      not on this machine
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Detach"
                disabled={busy === r.name}
                onClick={() => {
                  setBusy(r.name);
                  api
                    .detachOrgSkill(orgId, r.name)
                    .then(refresh)
                    .catch((e) => setError(String(e)))
                    .finally(() => setBusy(null));
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">From your library</p>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-1.5 pr-2">
            {global.map((s) => {
              const isAttached = attached.has(s.name);
              return (
                <Row key={s.name} skill={s}>
                  <Button
                    variant={isAttached ? "ghost" : "outline"}
                    size="sm"
                    className="h-7 shrink-0"
                    disabled={isAttached || busy === s.name}
                    onClick={() => {
                      setBusy(s.name);
                      api
                        .attachOrgSkill(orgId, s.name)
                        .then(refresh)
                        .catch((e) => setError(String(e)))
                        .finally(() => setBusy(null));
                    }}
                  >
                    {isAttached ? "Attached" : "Attach"}
                  </Button>
                </Row>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// --- project scope: hybrid (workspace files + references) ---

export function ProjectSkillsSection({ workspaceId }: { workspaceId: number }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [global, setGlobal] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    api.listSkills(workspaceId).then(setSkills).catch((e) => setError(String(e)));
    api.listGlobalSkills().then(setGlobal).catch(() => {});
  }, [workspaceId]);

  useEffect(refresh, [refresh]);

  const present = new Set(skills.map((s) => s.name));

  if (editing) {
    return (
      <Editor
        title={editing.name}
        content={editing.content}
        busy={busy === editing.name}
        onChange={(content) => setEditing({ ...editing, content })}
        onBack={() => setEditing(null)}
        onSave={async () => {
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
        }}
      />
    );
  }

  if (creating) {
    return (
      <CreateForm
        onCancel={() => setCreating(false)}
        onCreate={async (name, description, tags, body) => {
          await api.createSkill(workspaceId, name, description, tags, body);
          setCreating(false);
          refresh();
        }}
        setError={setError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionIntro>
        Project skills live in <code>.superconsole/skills/</code> (CLI-native, committed to the
        repo). Adding one from your library copies it here so you or the agent can edit and improve
        it per-project without changing the shared library copy.
      </SectionIntro>
      <Err msg={error} />

      <Button size="sm" className="h-8 w-fit" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" />
        New skill in repo
      </Button>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">This project</p>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-1.5 pr-2">
            {skills.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No skills yet. Create one or attach from your library below.
              </p>
            )}
            {skills.map((s) => {
              const inRepo = s.source === "superconsole";
              return (
                <Row key={s.name} skill={s} badge={inRepo ? "in repo" : "reference"}>
                  {inRepo ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Edit"
                      onClick={async () => {
                        try {
                          setEditing({
                            name: s.name,
                            content: await api.readWorkspaceSkill(workspaceId, s.file_path),
                          });
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Materialize into repo"
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
                    title={inRepo ? "Delete from repo" : "Detach reference"}
                    disabled={busy === s.name}
                    onClick={() =>
                      (inRepo
                        ? api.deleteSkill(workspaceId, s.name)
                        : api.detachSkillFromProject(workspaceId, s.name)
                      )
                        .then(refresh)
                        .catch((e) => setError(String(e)))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </Row>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">From your library</p>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-1.5 pr-2">
            {global.map((s) => {
              const isPresent = present.has(s.name);
              return (
                <Row key={s.name} skill={s}>
                  <Button
                    variant={isPresent ? "ghost" : "outline"}
                    size="sm"
                    className="h-7 shrink-0"
                    disabled={isPresent || busy === s.name}
                    onClick={() => {
                      setBusy(s.name);
                      api
                        .attachSkillToProject(workspaceId, s.name)
                        .then(refresh)
                        .catch((e) => setError(String(e)))
                        .finally(() => setBusy(null));
                    }}
                  >
                    {isPresent ? "Added" : "Add to repo"}
                  </Button>
                </Row>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// --- shared bits ---

function Row({
  skill,
  badge,
  children,
}: {
  skill: Skill;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{skill.name}</span>
          {badge && (
            <Badge
              variant={badge === "in repo" ? "secondary" : "outline"}
              className="text-[10px]"
            >
              {badge}
            </Badge>
          )}
          {skill.tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
        {skill.description && (
          <p className="truncate text-xs text-muted-foreground">{skill.description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function LibraryGrid({
  library,
  installed,
  busy,
  actionLabel,
  onAction,
}: {
  library: LibrarySkill[];
  installed: Set<string>;
  busy: string | null;
  actionLabel: string;
  onAction: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const filtered = library.filter((l) => {
    const matchesCat = category === "all" || l.category === category;
    const q = query.trim().toLowerCase();
    return (
      matchesCat &&
      (!q ||
        l.name.includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some((t) => t.includes(q)))
    );
  });

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Built-in library</p>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the library..."
        className="mb-2 h-8 text-sm"
      />
      <div className="mb-2 flex flex-wrap gap-1">
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
      <ScrollArea className="max-h-72">
        <div className="flex flex-col gap-1.5 pr-2">
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
                  <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                </div>
                <Button
                  variant={isInstalled ? "ghost" : "outline"}
                  size="sm"
                  className="h-7 shrink-0"
                  disabled={isInstalled || busy === l.name}
                  onClick={() => onAction(l.name)}
                >
                  {!isInstalled && <Download className="h-3.5 w-3.5" />}
                  {isInstalled ? "Installed" : actionLabel}
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function Editor({
  title,
  content,
  busy,
  onChange,
  onBack,
  onSave,
}: {
  title: string;
  content: string;
  busy: boolean;
  onChange: (v: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="h-7 w-fit px-2" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Button>
      <span className="text-sm font-medium">{title}</span>
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-72 font-mono text-xs"
      />
      <div className="flex justify-end">
        <Button size="sm" className="h-8" onClick={onSave} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}

function CreateForm({
  onCancel,
  onCreate,
  setError,
}: {
  onCancel: () => void;
  onCreate: (name: string, description: string, tags: string[], body: string) => Promise<void>;
  setError: (v: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("## Instructions\n");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="h-7 w-fit px-2" onClick={onCancel}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Button>
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
          className="col-span-2 min-h-48 font-mono text-xs"
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={async () => {
            if (!name.trim()) {
              setError("Skill name is required.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await onCreate(
                name.trim(),
                description.trim(),
                tags.split(",").map((t) => t.trim()).filter(Boolean),
                body,
              );
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create skill
        </Button>
      </div>
    </div>
  );
}
