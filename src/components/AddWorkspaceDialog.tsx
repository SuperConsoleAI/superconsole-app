import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
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
import { CLI_PRESETS } from "@/lib/api";
import { PresetIcon } from "@/components/PresetIcon";

interface AddWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, path: string, cli: string) => Promise<void>;
}

export function AddWorkspaceDialog({
  open: isOpen,
  onOpenChange,
  onAdd,
}: AddWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [cli, setCli] = useState("claude");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setPath(selected);
      if (!name) {
        const base = selected.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "";
        setName(base);
      }
    }
  };

  const submit = async () => {
    if (!name.trim() || !path.trim()) {
      setError("Name and folder are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(name.trim(), path.trim(), cli);
      setName("");
      setPath("");
      setCli("claude");
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add workspace</DialogTitle>
          <DialogDescription>
            Point to any repo or folder. Dockyard runs your chosen CLI inside it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Folder</label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/workspace"
              />
              <Button variant="outline" size="icon" onClick={pickFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="acme-dental"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">CLI</label>
            <div className="flex gap-2">
              {CLI_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant={cli === preset.id ? "secondary" : "outline"}
                  size="sm"
                  className={cli === preset.id ? "ring-1 ring-primary" : ""}
                  onClick={() => setCli(preset.id)}
                >
                  <PresetIcon preset={preset.id} className="h-3.5 w-3.5" />
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Adding..." : "Add workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
