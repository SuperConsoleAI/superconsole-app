import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api, type FileEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FilePanelProps {
  workspaceId: number;
  onOpenFile: (relPath: string) => void;
  openedFile: string | null;
}

interface TreeNodeProps extends FilePanelProps {
  entry: FileEntry;
  depth: number;
  refreshKey: number;
  onDelete: (relPath: string) => void;
}

function TreeNode({ entry, depth, refreshKey, onDelete, ...rest }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);

  useEffect(() => {
    if (open) {
      api.listDir(rest.workspaceId, entry.rel_path).then(setChildren).catch(() => {});
    }
  }, [open, refreshKey, entry.rel_path, rest.workspaceId]);

  const isActive = rest.openedFile === entry.rel_path;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() =>
          entry.is_dir ? setOpen((o) => !o) : rest.onOpenFile(entry.rel_path)
        }
        onKeyDown={(e) =>
          e.key === "Enter" &&
          (entry.is_dir ? setOpen((o) => !o) : rest.onOpenFile(entry.rel_path))
        }
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-[13px] transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        )}
      >
        {entry.is_dir ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {entry.is_dir ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{entry.name}</span>
        <button
          className="ml-auto hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry.rel_path);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {open &&
        children?.map((child) => (
          <TreeNode
            key={child.rel_path}
            entry={child}
            depth={depth + 1}
            refreshKey={refreshKey}
            onDelete={onDelete}
            {...rest}
          />
        ))}
    </div>
  );
}

export function FilePanel({ workspaceId, onOpenFile, openedFile }: FilePanelProps) {
  const [roots, setRoots] = useState<FileEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(() => {
    api.listDir(workspaceId, "").then(setRoots).catch(() => setRoots([]));
    setRefreshKey((k) => k + 1);
  }, [workspaceId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.createEntry(workspaceId, name, creating === "folder");
      setNewName("");
      setCreating(null);
      refresh();
      if (creating === "file") onOpenFile(name);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (relPath: string) => {
    if (!confirm(`Delete ${relPath}?`)) return;
    await api.deleteEntry(workspaceId, relPath).catch(console.error);
    refresh();
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCreating("file")}
            title="New file"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCreating("folder")}
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {creating && (
        <div className="border-b p-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(null);
                setNewName("");
              }
            }}
            placeholder={creating === "file" ? "path/to/file.md" : "folder-name"}
            className="h-7 text-xs"
          />
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-1.5">
          {roots.map((entry) => (
            <TreeNode
              key={entry.rel_path}
              entry={entry}
              depth={0}
              refreshKey={refreshKey}
              workspaceId={workspaceId}
              onOpenFile={onOpenFile}
              openedFile={openedFile}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
