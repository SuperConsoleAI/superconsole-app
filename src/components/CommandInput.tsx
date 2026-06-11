import { useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
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
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listSlashCommands(workspaceId)
      .then(setCommands)
      .catch(() => setCommands([]));
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (e.key === "Enter") {
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
              {cmd}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSelected(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or / for commands..."
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          spellCheck={false}
        />
        <Button size="icon" variant="secondary" onClick={() => submit(value)}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
