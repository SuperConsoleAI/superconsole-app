/**
 * Environment Settings — Manages Account & Project environment variables and .env files.
 * Handles encrypted/masked keys, local variables, file paths, and Tauri dialog picking.
 */
import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2, Lock, Unlock } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, type EnvEntry } from "@/lib/api";
import { useWorkspaces } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";

export interface EnvVar {
  key: string;
  value: string;
  is_secret: boolean;
}

export function keyIsSecret(key: string): boolean {
  const u = key.toUpperCase();
  return ["PASSWORD", "SECRET", "KEY", "TOKEN", "API"].some((p) => u.includes(p));
}

export function parseFiles(json: string | undefined): string[] {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
}

export function EnvVarEditor({
  title,
  hint,
  entries,
  onUpsert,
  onDelete,
  onToggleSecret,
}: {
  title: string;
  hint: string;
  entries: EnvVar[];
  onUpsert: (key: string, value: string, isSecret: boolean) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onToggleSecret?: (key: string, currentSecret: boolean) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [userToggledSecret, setUserToggledSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleKeyChange = (val: string) => {
    setNewKey(val);
    if (!userToggledSecret) {
      setNewIsSecret(keyIsSecret(val));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>

      {entries.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No variables yet.</p>
      )}

      {entries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entries.map((e) => {
            const masked = e.is_secret && !revealed.has(e.key);
            return (
              <div
                key={e.key}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-1.5 w-44 shrink-0">
                  <span className="truncate font-mono text-[12px] font-medium text-foreground">
                    {e.key}
                  </span>
                  {e.is_secret && (
                    <span className="rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-medium text-amber-500 shrink-0">
                      SEC
                    </span>
                  )}
                </div>
                {editing === e.key ? (
                  <Input
                    value={editValue}
                    autoFocus
                    onChange={(ev) => setEditValue(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        run(() => onUpsert(e.key, editValue, e.is_secret));
                        setEditing(null);
                      }
                      if (ev.key === "Escape") setEditing(null);
                    }}
                    onBlur={() => {
                      run(() => onUpsert(e.key, editValue, e.is_secret));
                      setEditing(null);
                    }}
                    className="h-7 flex-1 font-mono text-xs"
                  />
                ) : (
                  <button
                    className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      setEditing(e.key);
                      setEditValue(e.value);
                    }}
                  >
                    {masked ? "••••••••••" : e.value || <span className="italic opacity-60">(empty)</span>}
                  </button>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  {onToggleSecret && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-7 w-7 cursor-pointer",
                        e.is_secret
                          ? "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                          : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/40",
                      )}
                      onClick={() => run(() => onToggleSecret(e.key, e.is_secret))}
                      title={e.is_secret ? "Marked as secret (click to make plain)" : "Plaintext (click to mark as secret)"}
                    >
                      {e.is_secret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  {e.is_secret && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 cursor-pointer"
                      onClick={() => toggleReveal(e.key)}
                      title={masked ? "Reveal" : "Hide"}
                    >
                      {masked ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer"
                    onClick={() => run(() => onDelete(e.key))}
                    title="Delete variable"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            value={newKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="KEY"
            className="h-8 w-44 shrink-0 font-mono text-xs uppercase"
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            type={newIsSecret ? "password" : "text"}
            className="h-8 flex-1 font-mono text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newKey.trim()) {
                run(() => onUpsert(newKey.trim(), newValue, newIsSecret));
                setNewKey("");
                setNewValue("");
                setNewIsSecret(false);
                setUserToggledSecret(false);
                setAdding(false);
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              setUserToggledSecret(true);
              setNewIsSecret(!newIsSecret);
            }}
            className={cn(
              "flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors shrink-0 cursor-pointer",
              newIsSecret
                ? "bg-amber-500/15 border-amber-500/30 text-amber-500 dark:text-amber-400"
                : "bg-muted/40 border-border text-muted-foreground hover:text-foreground",
            )}
            title={newIsSecret ? "Marked as Secret (will be masked)" : "Plaintext (visible)"}
          >
            {newIsSecret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            <span>{newIsSecret ? "Secret" : "Plain"}</span>
          </button>
          <Button
            size="sm"
            disabled={!newKey.trim()}
            className="cursor-pointer"
            onClick={() => {
              run(() => onUpsert(newKey.trim(), newValue, newIsSecret));
              setNewKey("");
              setNewValue("");
              setNewIsSecret(false);
              setUserToggledSecret(false);
              setAdding(false);
            }}
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={() => {
              setAdding(false);
              setNewKey("");
              setNewValue("");
              setNewIsSecret(false);
              setUserToggledSecret(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-fit gap-1 text-xs cursor-pointer" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add variable
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EnvFilesList({
  files,
  onChange,
  scopeNote,
}: {
  files: string[];
  onChange: (next: string[]) => Promise<void>;
  scopeNote: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  const persist = async (next: string[]) => {
    setError(null);
    try {
      await onChange(next);
    } catch (e) {
      setError(String(e));
    }
  };

  const add = async () => {
    try {
      const picked = await open({ multiple: true });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const next = [...files];
      for (const p of paths) if (!next.includes(p)) next.push(p);
      await persist(next);
    } catch {
      /* cancelled */
    }
  };

  const addPath = async () => {
    const p = pasted.trim();
    if (!p || files.includes(p)) {
      setPasted("");
      return;
    }
    await persist([...files, p]);
    setPasted("");
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">Env files</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {scopeNote} In the native file picker, press Cmd+Shift+. to show hidden
        files.
      </p>
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <div
              key={f}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={f}>
                {f}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => persist(files.filter((x) => x !== f))}
                title="Remove env file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={add} className="gap-1 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add env file
        </Button>
        <span className="text-[11px] text-muted-foreground">or paste a path</span>
      </div>
      <div className="flex gap-2">
        <Input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPath()}
          placeholder="/absolute/path/to/.env"
          className="h-8 flex-1 font-mono text-xs"
        />
        <Button size="sm" variant="outline" disabled={!pasted.trim()} onClick={addPath}>
          Add path
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EnvFilesBlock({ workspaceId }: { workspaceId: number }) {
  const { workspaces, updateWorkspaceFields } = useWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  return (
    <EnvFilesList
      files={parseFiles(ws?.env_files)}
      scopeNote="Load environment variables into every CLI session for this project."
      onChange={async (next) => {
        await api.setWorkspaceEnvFiles(workspaceId, next);
        await updateWorkspaceFields(workspaceId, { env_files: JSON.stringify(next) });
      }}
    />
  );
}

export function AccountEnvironmentSection() {
  const { auth } = useAuth();
  const currentUserId = auth?.user?.id || "local";
  const [files, setFiles] = useState<string[]>([]);
  const [vars, setVars] = useState<EnvVar[]>([]);

  const loadVars = async () => {
    try {
      const records = await api.getEnvVars("account", currentUserId);
      const filtered = records
        .filter(
          (r) =>
            ![
              "account_env_files",
              "account_env_vars",
              "default_chat_provider",
              "default_chat_model",
              "telegram_token",
              "telegram_chat_id",
              "http_enabled",
              "http_port",
              "api_token",
            ].includes(r.key),
        )
        .map((r) => ({
          key: r.key,
          value: r.value,
          is_secret: r.is_secret ?? keyIsSecret(r.key),
        }));
      setVars(filtered);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setFiles(parseFiles(s.account_env_files));
      })
      .catch(console.error);

    loadVars();
  }, [currentUserId]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <EnvVarEditor
        title="Account variables"
        hint="Loaded into every CLI session across all projects on this machine. Stored in env_vars table."
        entries={vars}
        onUpsert={async (key, value, isSecret) => {
          await api.setEnvVar("account", currentUserId, key, value, isSecret, currentUserId);
          await loadVars();
        }}
        onDelete={async (key) => {
          await api.deleteEnvVar("account", currentUserId, key);
          await loadVars();
        }}
        onToggleSecret={async (key, currentSecret) => {
          const item = vars.find((v) => v.key === key);
          if (item) {
            await api.setEnvVar("account", currentUserId, key, item.value, !currentSecret, currentUserId);
            await loadVars();
          }
        }}
      />
      <EnvFilesList
        files={files}
        scopeNote="Load environment variables into every CLI session, across all projects on this machine."
        onChange={async (next) => {
          await api.setSetting("account_env_files", JSON.stringify(next));
          setFiles(next);
        }}
      />
    </div>
  );
}

export function EnvironmentSection({ workspaceId }: { workspaceId: number }) {
  const [entries, setEntries] = useState<EnvEntry[]>([]);

  const load = async () => {
    try {
      setEntries(await api.readEnvFile(workspaceId));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setEntries([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <EnvVarEditor
        title="Workspace .env"
        hint="Variables loaded into every CLI session for this project. Stored in the workspace .env file."
        entries={entries.map((e) => ({ key: e.key, value: e.value, is_secret: e.is_secret }))}
        onUpsert={async (key, value, _isSecret) => {
          await api.setEnvEntry(workspaceId, key, value);
          await load();
        }}
        onDelete={async (key) => {
          await api.deleteEnvEntry(workspaceId, key);
          await load();
        }}
      />
      <EnvFilesBlock workspaceId={workspaceId} />
    </div>
  );
}
