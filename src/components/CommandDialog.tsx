import { useCallback, useEffect, useState } from "react";
import { SquareSlash, Pencil, Trash2, Plus } from "lucide-react";
import { api, type SlashCommand } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CommandDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type CmdEditing = {
  name: string;
  slash: string;
  description: string;
  content: string;
  isNew: boolean;
} | null;

export function CommandEditorDialog({ 
  workspaceId, 
  editing, 
  setEditing, 
  onSaved 
}: { 
  workspaceId: number; 
  editing: CmdEditing; 
  setEditing: (e: CmdEditing) => void; 
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Command name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.writeCommand(
        workspaceId,
        editing.name.trim(),
        editing.slash.trim(),
        editing.description.trim(),
        editing.content,
      );
      setEditing(null);
      if (onSaved) onSaved();
      window.dispatchEvent(new Event('refresh-commands'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-4">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <SquareSlash className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{editing.isNew ? "Add command" : "Edit command"}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="command-name"
                className="h-8 text-sm"
                disabled={!editing.isNew}
              />
              <Input
                value={editing.slash}
                onChange={(e) => setEditing({ ...editing, slash: e.target.value })}
                placeholder="/slash"
                className="h-8 text-sm"
              />
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="One-line description"
                className="col-span-2 h-8 text-sm"
              />
              <Textarea
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                placeholder="The instructions sent to the agent when this command runs."
                className="col-span-2 min-h-52 font-mono text-xs"
              />
            </div>
            <div className="flex justify-end mt-2">
              <Button size="sm" className="h-8" onClick={save} disabled={busy}>
                Save command
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CommandsView({ workspaceId, showHeader = false }: { workspaceId: number, showHeader?: boolean }) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [editing, setEditing] = useState<CmdEditing>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listCommands(workspaceId).then(setCommands).catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
    setEditing(null);
    setError(null);
  }, [refresh]);

  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener('refresh-commands', onRefresh);
    return () => window.removeEventListener('refresh-commands', onRefresh);
  }, [refresh]);

  const project = commands.filter((c) => c.source === "superconsole");
  const global = commands.filter((c) => c.source === "global");
  const claude = commands.filter((c) => c.source === "claude");

  const openEditor = async (c: SlashCommand) => {
    try {
      const content = await api.readCommand(workspaceId, c.slash);
      setEditing({
        name: c.name,
        slash: c.slash,
        description: c.description,
        content,
        isNew: false,
      });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden px-5 py-4">
      
      {showHeader && (
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div className="flex items-center gap-2">
            <SquareSlash className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Commands</h2>
          </div>
          <Button size="sm" className="h-7 gap-1" onClick={() => setEditing({ name: "", slash: "", description: "", content: "", isNew: true })}>
            <Plus className="h-3.5 w-3.5" />
            Add command
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive mb-4">{error}</p>}

      <CommandEditorDialog 
        workspaceId={workspaceId} 
        editing={editing} 
        setEditing={setEditing} 
        onSaved={refresh} 
      />

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 pr-2 pb-2">
          {project.length === 0 && global.length === 0 && claude.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No commands yet. Create one to reuse instructions across CLIs.
            </p>
          )}

          {project.map((c) => (
            <div key={c.file_path} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="truncate font-mono text-sm font-medium">{c.slash}</span>
                {c.description && (
                  <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Edit" onClick={() => openEditor(c)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Delete"
                onClick={() =>
                  api.deleteCommand(workspaceId, c.name).then(refresh).catch((e) => setError(String(e)))
                }
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}

          {global.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">
                Global (all projects)
              </p>
              {global.map((c) => (
                <div key={c.file_path} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-mono text-sm font-medium">{c.slash}</span>
                    {c.description && (
                      <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    global
                  </Badge>
                </div>
              ))}
            </>
          )}

          {claude.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">
                From .claude/commands/ (read-only)
              </p>
              {claude.map((c) => (
                <div
                  key={c.file_path}
                  className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-mono text-sm font-medium">{c.slash}</span>
                    <p className="truncate text-xs text-muted-foreground">{c.file_path}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function CommandDialog({ workspaceId, open, onOpenChange }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <CommandsView workspaceId={workspaceId} showHeader={true} />
      </DialogContent>
    </Dialog>
  );
}
