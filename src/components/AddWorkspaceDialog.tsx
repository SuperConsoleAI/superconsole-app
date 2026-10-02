import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, CLI_PRESETS, type Workspace } from "@/lib/api";
import { PresetIcon } from "@/components/PresetIcon";
import { cn } from "@/lib/utils";

interface AddWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (
    name: string,
    path: string,
    cli: string,
    orgId?: string | null,
    projectId?: string | null,
  ) => Promise<Workspace>;
  orgId?: string | null;
  projectId?: string | null;
}

export function AddWorkspaceDialog({
  open: isOpen,
  onOpenChange,
  onAdd,
  orgId,
  projectId,
}: AddWorkspaceDialogProps) {
  const [mode, setMode] = useState<"folder" | "repo">("folder");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [repo, setRepo] = useState("");
  const [gitRef, setGitRef] = useState("main");
  const [cli, setCli] = useState("claude");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setPath(selected);
      if (mode === "folder" && !name) {
        const base = selected.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "";
        setName(base);
      }
    }
  };

  const reset = () => {
    setName("");
    setPath("");
    setRepo("");
    setGitRef("main");
    setCli("claude");
    setMode("folder");
    setSuccessMsg(null);
  };

  const showScaffoldToast = async (workspaceId: number) => {
    try {
      const created = await api.scaffoldSuperconsoleDir(workspaceId);
      if (created.length > 0) {
        setSuccessMsg(
          `✓ Project initialized — ${created.length} default files created (memory, rules, hooks & router agent).`,
        );
      }
    } catch {
      // Best-effort — non-blocking.
    }
  };

  const submit = async () => {
    if (mode === "repo") {
      if (!repo.trim() || !path.trim()) {
        setError("Repository and a folder to clone into are required.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        // Clone into the chosen parent folder + scaffold .superconsole/.
        const projectPath = await api.scaffoldProjectFromRepo(
          path.trim(),
          repo.trim(),
          gitRef.trim() || "main",
        );
        const repoName =
          repo
            .trim()
            .replace(/\.git$/, "")
            .replace(/[/\\]+$/, "")
            .split(/[/\\/]/)
            .pop() ?? "project";
        const ws = await onAdd(name.trim() || repoName, projectPath, cli, orgId, projectId);
        reset();
        onOpenChange(false);
        void showScaffoldToast(ws.id);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!name.trim() || !path.trim()) {
      setError("Name and folder are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ws = await onAdd(name.trim(), path.trim(), cli, orgId, projectId);
      reset();
      onOpenChange(false);
      void showScaffoldToast(ws.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg min-w-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add workspace</DialogTitle>
          <DialogDescription>
            Start from an existing folder, or clone a repo and start fresh. SuperConsole runs your
            chosen CLI inside it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 w-full flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 min-w-0 w-full">
            <Button
              type="button"
              variant={mode === "folder" ? "secondary" : "outline"}
              size="sm"
              className={cn("h-8", mode === "folder" && "ring-1 ring-primary")}
              onClick={() => setMode("folder")}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Existing folder
            </Button>
            <Button
              type="button"
              variant={mode === "repo" ? "secondary" : "outline"}
              size="sm"
              className={cn("h-8", mode === "repo" && "ring-1 ring-primary")}
              onClick={() => setMode("repo")}
            >
              <Download className="h-3.5 w-3.5" />
              Import from repo
            </Button>
          </div>

          {mode === "repo" && (
            <div className="flex min-w-0 w-full flex-col gap-1.5">
              <label className="text-sm font-medium">Repository</label>
              <Input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/name or https://github.com/owner/name"
                className="font-mono text-sm"
              />
              <Input
                value={gitRef}
                onChange={(e) => setGitRef(e.target.value)}
                placeholder="branch / tag / commit (default: main)"
                className="font-mono text-sm"
              />
            </div>
          )}

          <div className="flex min-w-0 w-full flex-col gap-1.5">
            <label className="text-sm font-medium">
              {mode === "repo" ? "Clone into folder" : "Folder"}
            </label>
            <div className="flex min-w-0 w-full gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={mode === "repo" ? "/path/to/parent-folder" : "/path/to/workspace"}
              />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={pickFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            {mode === "repo" && (
              <p className="text-[11px] text-muted-foreground">
                The repo is cloned into a subfolder here, then scaffolded with{" "}
                <span className="font-mono">.superconsole/</span>.
              </p>
            )}
          </div>

          <div className="flex min-w-0 w-full flex-col gap-1.5">
            <label className="text-sm font-medium">
              Name{mode === "repo" && " (optional)"}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "repo" ? "defaults to the repo name" : "acme-dental"}
            />
          </div>

          <div className="flex min-w-0 w-full flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Start with</label>
              <span className="text-[11px] text-muted-foreground">Scroll to see all</span>
            </div>
            <div className="relative min-w-0 w-full">
              <div
                className="flex min-w-0 w-full items-center gap-2 overflow-x-auto py-1 no-scrollbar"
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
              >
                <Button
                  type="button"
                  variant={cli === "chat" ? "secondary" : "outline"}
                  size="sm"
                  className={cn("h-8 shrink-0 gap-1.5", cli === "chat" && "ring-1 ring-primary")}
                  onClick={() => setCli("chat")}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  Chat
                </Button>
                {CLI_PRESETS.map((preset) => (
                  <Button
                    type="button"
                    key={preset.id}
                    variant={cli === preset.id ? "secondary" : "outline"}
                    size="sm"
                    className={cn("h-8 shrink-0 gap-1.5", cli === preset.id && "ring-1 ring-primary")}
                    onClick={() => setCli(preset.id)}
                  >
                    <PresetIcon preset={preset.id} className="h-3.5 w-3.5" />
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {successMsg && <p className="text-sm text-green-600 dark:text-green-400">{successMsg}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy
              ? mode === "repo"
                ? "Cloning..."
                : "Adding..."
              : mode === "repo"
                ? "Clone & add"
                : "Add workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
