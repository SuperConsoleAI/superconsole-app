import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FileEditorProps {
  workspaceId: number;
  relPath: string;
  onClose: () => void;
}

export function FileEditor({ workspaceId, relPath, onClose }: FileEditorProps) {
  const [content, setContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isMarkdown = /\.(md|mdx|markdown)$/i.test(relPath);
  const dirty = content !== savedContent;

  useEffect(() => {
    setError(null);
    setPreview(false);
    api
      .readFile(workspaceId, relPath)
      .then((text) => {
        setContent(text);
        setSavedContent(text);
      })
      .catch((e) => setError(String(e)));
  }, [workspaceId, relPath]);

  const save = async () => {
    try {
      await api.writeFile(workspaceId, relPath, content);
      setSavedContent(content);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="flex h-full flex-col bg-background" onKeyDown={handleKeyDown}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card/60 px-3">
        <span className="truncate font-mono text-xs text-muted-foreground">{relPath}</span>
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />}
        <div className="ml-auto flex items-center gap-1">
          {isMarkdown && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 gap-1 text-xs", preview && "text-primary")}
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {preview ? "Edit" : "Preview"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={save}
            disabled={!dirty}
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>
      )}

      {preview ? (
        <ScrollArea className="min-h-0 flex-1">
          <article className="prose-sm mx-auto max-w-2xl px-6 py-6 [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:font-display [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        </ScrollArea>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Empty file"
        />
      )}
    </div>
  );
}
