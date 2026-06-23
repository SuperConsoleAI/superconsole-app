import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderGit2, Plus, SendHorizonal } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type SlashItem,
  filterSlashItems,
  groupSlashItems,
  loadSlashItems,
} from "@/lib/slash-items";

interface CommandInputProps {
  workspaceId: number;
  onSend: (text: string) => void;
}

export function CommandInput({ workspaceId, onSend }: CommandInputProps) {
  const [value, setValue] = useState("");
  const [projectSlashes, setProjectSlashes] = useState<Set<string>>(new Set());

  // Slash-item autocomplete state
  const [slashItems, setSlashItems] = useState<SlashItem[]>([]);
  const [selected, setSelected] = useState(0);
  const slashLoadedRef = useRef(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    // Line height 20px + 16px padding → grow from 1 up to 12 lines, then scroll.
    const max = 12 * 20 + 16;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [value]);

  // Load project slashes (for the FolderGit2 icon) once on mount.
  useEffect(() => {
    api
      .listCommands(workspaceId)
      .then((cmds) =>
        setProjectSlashes(
          new Set(cmds.filter((c) => c.source !== "claude").map((c) => c.slash)),
        ),
      )
      .catch(() => setProjectSlashes(new Set()));
  }, [workspaceId]);

  // Lazy-load slash items on first "/" keypress, then cache.
  const ensureSlashItems = () => {
    if (slashLoadedRef.current) return;
    slashLoadedRef.current = true;
    loadSlashItems(workspaceId)
      .then(setSlashItems)
      .catch(() => setSlashItems([]));
  };

  const attachPath = async () => {
    try {
      const picked = await open({ multiple: true });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const sep = value && !value.endsWith(" ") ? " " : "";
      setValue(value + sep + paths.map((p) => `"${p}"`).join(" ") + " ");
      inputRef.current?.focus();
    } catch {
      /* cancelled */
    }
  };

  // Compute suggestions: active when value starts with "/" and has no space.
  const filteredItems =
    value.startsWith("/") && !value.includes(" ")
      ? filterSlashItems(slashItems, value)
      : [];
  const groupedSuggestions = groupSlashItems(filteredItems);
  // Flat list for keyboard nav index tracking.
  const flatSuggestions = filteredItems.slice(0, 32);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    setSelected(0);
  };

  const selectItem = (item: SlashItem) => {
    if (item.source === "command") {
      // Commands: insert and immediately submit (existing behavior).
      setValue(item.value + " ");
    } else {
      // Asset tokens: insert token text into PTY input; agent fetches via MCP.
      setValue(item.value + " ");
    }
    setSelected(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (flatSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % flatSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s - 1 + flatSuggestions.length) % flatSuggestions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        selectItem(flatSuggestions[selected]);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatSuggestions[selected];
        if (item.source === "command" && item.value === value.trim()) {
          submit(value);
        } else {
          selectItem(item);
        }
        return;
      }
      if (e.key === "Escape") {
        setValue("");
        setSelected(0);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(value);
    }
  };

  return (
    <div className="relative border-t bg-card px-3 py-2">
      {flatSuggestions.length > 0 && (
        <div className="absolute bottom-full left-3 z-50 mb-1 w-80 overflow-hidden rounded-md border bg-popover shadow-md">
          {groupedSuggestions.map(([group, items]) => {
            // Calculate the base index for keyboard selection highlighting.
            const groupStartIdx = flatSuggestions.indexOf(items[0]);
            return (
              <div key={group}>
                <div className="border-b border-border/50 bg-muted/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                {items.map((item, localIdx) => {
                  const globalIdx = groupStartIdx + localIdx;
                  return (
                    <button
                      key={item.value}
                      className={cn(
                        "flex w-full items-baseline gap-2 px-3 py-1.5 text-left",
                        globalIdx === selected
                          ? "bg-accent text-accent-foreground"
                          : "text-popover-foreground hover:bg-accent/50",
                      )}
                      onMouseEnter={() => setSelected(globalIdx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectItem(item);
                      }}
                    >
                      <span className="flex shrink-0 items-center gap-1.5">
                        {item.source === "command" && projectSlashes.has(item.value) && (
                          <FolderGit2 className="h-3 w-3 shrink-0 opacity-60" />
                        )}
                        <span className="font-mono text-sm">{item.label}</span>
                      </span>
                      {item.description && (
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          title="Attach file path"
          onClick={attachPath}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setSelected(0);
            // Trigger lazy load on first "/" keystroke.
            if (next.startsWith("/")) {
              ensureSlashItems();
            }
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message or / for commands..."
          style={{ lineHeight: "20px" }}
          className="max-h-64 min-h-[2.25rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          spellCheck={false}
        />
        <Button
          size="icon"
          variant="secondary"
          className="h-9 w-9 shrink-0"
          onClick={() => submit(value)}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
