import { useState, useEffect } from "react";
import { Search, File, Folder, Code } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type FileEntry } from "@/lib/api";

interface FileSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  onSelect: (relPath: string) => void;
}

export function FileSearchDialog({
  open,
  onOpenChange,
  workspaceId,
  onSelect,
}: FileSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  // We'll just fetch the top level for now, as full deep search requires a backend endpoint.
  // This serves as the UI scaffold for the command palette.

  useEffect(() => {
    if (open) {
      setQuery("");
      api.listDir(workspaceId, "").then(setResults).catch(() => setResults([]));
    }
  }, [open, workspaceId]);

  const filtered = results.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden bg-popover/95 backdrop-blur shadow-2xl border-border rounded-xl">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            autoFocus
            placeholder="Search files..."
            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="p-2">
            <div className="px-2 pb-2 pt-1 text-xs font-semibold text-muted-foreground">
              {query ? "Search Results" : "Recently Viewed"}
            </div>
            {filtered.map((item) => (
              <div
                key={item.rel_path}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  if (!item.is_dir) {
                    onSelect(item.rel_path);
                    onOpenChange(false);
                  }
                }}
              >
                {item.is_dir ? (
                  <Folder className="h-4 w-4 text-primary/70 shrink-0" />
                ) : item.name.endsWith(".json") || item.name.endsWith(".ts") || item.name.endsWith(".tsx") ? (
                  <Code className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium truncate">{item.name}</span>
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[200px]">
                  {item.rel_path}
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No files found. Deep recursive search requires a backend endpoint.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
