import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FileDown,
  Globe,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  api,
  type CatalogSkillEntry,
  type OrgSkillView,
  type Skill,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");

  const refresh = useCallback(() => {
    api.listGlobalSkills().then(setSkills).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
        Your personal skill library, stored on this machine and available to every project.
      </SectionIntro>
      <Err msg={error} />

      {/* Your installed global skills */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New skill
        </Button>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Import from GitHub URL or raw .md"
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
        <ScrollArea className="max-h-[280px]">
          <div className="flex flex-col gap-1.5 pb-2 pr-2">
            {skills.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No global skills yet. Create one or install from the catalog below.
              </p>
            )}
            {skills.map((s) => (
              <Row key={s.name} skill={s}>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Edit"
                  onClick={() => openEditor(s.name)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Delete"
                  disabled={busy === s.name}
                  onClick={() =>
                    api.deleteGlobalSkill(s.name).then(refresh).catch((e) => setError(String(e)))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </Row>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Skill Catalog tabs */}
      <SkillCatalogSection installedNames={new Set(skills.map((s) => s.name))} onInstall={refresh} />
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
        <ScrollArea className="max-h-[280px]">
          <div className="flex flex-col gap-1.5 pb-2 pr-2">
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
        <ScrollArea className="max-h-[280px]">
          <div className="flex flex-col gap-1.5 pb-2 pr-2">
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
        <ScrollArea className="max-h-[280px]">
          <div className="flex flex-col gap-1.5 pb-2 pr-2">
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
    <div className="flex min-w-0 items-start gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5">
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
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
        {children}
      </div>
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

// ── Skill Catalog (community, backed by Turso skill_catalog) ──────────────────

function SkillCatalogSection({
  installedNames,
  onInstall,
}: {
  installedNames: Set<string>;
  onInstall: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Skill Catalog</p>
      <Tabs defaultValue="catalog">
        <TabsList className="h-8">
          <TabsTrigger value="catalog" className="h-7 gap-1.5 text-xs">
            <Globe className="h-3.5 w-3.5" />
            Community
          </TabsTrigger>
          <TabsTrigger value="submit" className="h-7 gap-1.5 text-xs">
            <Send className="h-3.5 w-3.5" />
            Submit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <CatalogBrowser installedNames={installedNames} onInstall={onInstall} />
        </TabsContent>

        <TabsContent value="submit">
          <SubmitToCatalog />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CatalogBrowser({
  installedNames,
  onInstall,
}: {
  installedNames: Set<string>;
  onInstall: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogSkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    api.fetchSkillCatalog()
      .then(setCatalog)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = catalog.filter((e) => {
    const q = query.trim().toLowerCase();
    return (
      !q ||
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mt-2 flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search catalog..."
        className="h-8 text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {loading && <p className="py-3 text-center text-xs text-muted-foreground">Loading catalog…</p>}
      <ScrollArea className="max-h-[280px]">
        <div className="flex flex-col gap-1.5 pb-2 pr-2">
          {!loading && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {catalog.length === 0
                ? "No community skills yet. Be the first to submit one!"
                : "No results."}
            </p>
          )}
          {filtered.map((entry) => {
            const isInstalled = installedNames.has(entry.name);
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{entry.name}</span>
                    {entry.category && (
                      <Badge variant="outline" className="text-[10px]">
                        {entry.category}
                      </Badge>
                    )}
                    {entry.author && (
                      <span className="text-[10px] text-muted-foreground">by {entry.author}</span>
                    )}
                  </div>
                  {entry.description && (
                    <p className="truncate text-xs text-muted-foreground">{entry.description}</p>
                  )}
                  <a
                    href={entry.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[10px] text-blue-500 hover:underline"
                  >
                    {entry.githubUrl}
                  </a>
                </div>
                <Button
                  variant={isInstalled ? "ghost" : "outline"}
                  size="sm"
                  className="h-7 shrink-0"
                  disabled={isInstalled || busy === entry.name}
                  onClick={async () => {
                    setBusy(entry.name);
                    setError(null);
                    try {
                      await api.installSkillFromGithubUrl(entry.githubUrl, entry.name, "global");
                      onInstall();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
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

function SubmitToCatalog() {
  const [githubUrl, setGithubUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    if (!githubUrl.trim() || !name.trim()) {
      setError("GitHub URL and skill name are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.submitToSkillCatalog(
        name.trim(),
        description.trim(),
        category.trim(),
        tags.split(",").map((t) => t.trim()).filter(Boolean),
        githubUrl.trim(),
        "",
        author.trim(),
      );
      setSuccess(`'${name.trim()}' submitted to the catalog!`);
      setGithubUrl(""); setName(""); setDescription("");
      setCategory(""); setTags(""); setAuthor("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Share a skill with the community by linking a GitHub folder that contains a{" "}
        <code className="text-[11px]">SKILL.md</code> file.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-green-600">{success}</p>}
      <Input
        value={githubUrl}
        onChange={(e) => setGithubUrl(e.target.value)}
        placeholder="https://github.com/owner/repo/tree/main/my-skill"
        className="h-8 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="skill-name" className="h-8 text-sm" />
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="your-github-handle" className="h-8 text-sm" />
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One-line description" className="col-span-2 h-8 text-sm" />
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="category (e.g. dev, content, ops)" className="h-8 text-sm" />
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma, separated" className="h-8 text-sm" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" className="h-8" onClick={submit} disabled={busy}>
          <BookOpen className="h-3.5 w-3.5" />
          Submit to catalog
        </Button>
      </div>
    </div>
  );
}
