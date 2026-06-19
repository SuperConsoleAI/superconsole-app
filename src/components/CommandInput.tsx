import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderGit2, Plus, SendHorizonal } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CommandInputProps {
  workspaceId: number;
  onSend: (text: string) => void;
}

export function CommandInput({ workspaceId, onSend }: CommandInputProps) {
  const [value, setValue] = useState("");
  const [commands, setCommands] = useState<string[]>([]);
  const [projectSlashes, setProjectSlashes] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    // Line height 20px + 16px padding → grow from 1 up to 12 lines, then scroll.
    const max = 12 * 20 + 16;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [value]);

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

  useEffect(() => {
    api
      .listSlashCommands(workspaceId)
      .then(setCommands)
      .catch(() => setCommands([]));
    api
      .listCommands(workspaceId)
      .then((cmds) =>
        setProjectSlashes(
          new Set(cmds.filter((c) => c.source !== "claude").map((c) => c.slash)),
        ),
      )
      .catch(() => setProjectSlashes(new Set()));
  }, [workspaceId]);

  const suggestions =
    value.startsWith("/") && !value.includes(" ")
      ? commands.filter((c) => c.startsWith(value)).slice(0, 8)
      : [];

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    setSelected(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setValue(suggestions[selected] + " ");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (suggestions[selected] === value.trim()) {
          submit(value);
        } else {
          setValue(suggestions[selected] + " ");
        }
        return;
      }
      if (e.key === "Escape") {
        setValue("");
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
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-3 z-10 mb-1 w-72 overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((cmd, i) => (
            <button
              key={cmd}
              className={cn(
                "block w-full px-3 py-1.5 text-left font-mono text-sm",
                i === selected
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-accent/50",
              )}
              onMouseEnter={() => setSelected(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(cmd + " ");
                inputRef.current?.focus();
              }}
            >
              <span className="flex items-center gap-1.5">
                {projectSlashes.has(cmd) && (
                  <FolderGit2 className="h-3 w-3 shrink-0 opacity-60" />
                )}
                {cmd}
              </span>
            </button>
          ))}
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
            setValue(e.target.value);
            setSelected(0);
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
