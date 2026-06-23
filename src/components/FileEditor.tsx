import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil, Save, X, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CodeMirror from "@uiw/react-codemirror";
import { loadLanguage } from "@uiw/codemirror-extensions-langs";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { api } from "@/lib/api";
import { useWorkspaces } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FileEditorProps {
  workspaceId: number;
  relPath: string;
  tabId: string;
  onClose: () => void;
}

export function FileEditor({ workspaceId, relPath, tabId, onClose }: FileEditorProps) {
  const { setTabState, tabsByWs, workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const [content, setContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMarkdown = /\.(md|mdx|markdown)$/i.test(relPath);
  const dirty = content !== savedContent;

  const handleCloseClick = useCallback(() => {
    if (dirty) setShowCloseDialog(true);
    else onClose();
  }, [dirty, onClose]);

  const copyPath = () => {
    const absPath = workspace ? `${workspace.path}/${relPath}` : relPath;
    navigator.clipboard.writeText(absPath).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    setTabState(workspaceId, tabId, { dirty });
    if (dirty) {
      setTabState(workspaceId, tabId, { preview: false });
    }
  }, [dirty, workspaceId, tabId, setTabState]);

  const tab = tabsByWs[workspaceId]?.find((t) => t.id === tabId);
  useEffect(() => {
    if (tab?.closeRequested) {
      handleCloseClick();
      setTabState(workspaceId, tabId, { closeRequested: false });
    }
  }, [tab?.closeRequested, handleCloseClick, workspaceId, tabId, setTabState]);

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

  const getLanguageExtension = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext ? loadLanguage(ext as any) : null;
  };

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
      <div className="flex h-6 shrink-0 items-center gap-2 border-b bg-card/60 px-3">
        <span className="truncate font-mono text-[11px] text-muted-foreground">{relPath}</span>
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />}
        <div className="ml-auto flex items-center gap-0 text-muted-foreground">
          {isMarkdown && (
            <button
              className={cn("flex h-5 w-5 items-center justify-center hover:bg-accent hover:text-foreground rounded-sm transition-colors", preview && "text-primary")}
              onClick={() => setPreview((p) => !p)}
              title={preview ? "Edit" : "Preview"}
            >
              {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          )}
          <button
            className={cn("flex h-5 w-5 items-center justify-center hover:bg-accent hover:text-foreground rounded-sm transition-colors", !dirty && "opacity-50")}
            onClick={save}
            disabled={!dirty}
            title="Save"
          >
            <Save className="h-3 w-3" />
          </button>
          <button
            className="flex h-5 w-5 items-center justify-center hover:bg-accent hover:text-foreground rounded-sm transition-colors"
            onClick={copyPath}
            title="Copy path"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
          <button
            className="flex h-5 w-5 items-center justify-center hover:bg-accent hover:text-foreground rounded-sm transition-colors"
            onClick={() => {}}
            title="Split (Not Implemented)"
            style={{ display: "none" }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="1" />
              <line x1="8" y1="2" x2="8" y2="14" />
            </svg>
          </button>
          <button 
            className="flex h-5 w-5 items-center justify-center hover:bg-destructive/20 hover:text-destructive rounded-sm transition-colors ml-1" 
            onClick={handleCloseClick}
            title="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>
      )}

      {preview ? (
        <ScrollArea className="min-h-0 flex-1 bg-background [&_[data-radix-scroll-area-viewport]>div]:!block">
          <div className="w-full overflow-x-hidden">
            <article className="prose-sm mx-auto max-w-2xl px-6 py-6 w-full break-words [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:font-display [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          </div>
        </ScrollArea>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden bg-transparent [&>.cm-theme]:h-full [&>.cm-theme]:w-full [&>.cm-theme]:max-w-full [&_.cm-editor]:h-full [&_.cm-editor]:w-full [&_.cm-editor]:max-w-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[13px] [&_.cm-scroller]:leading-relaxed">
          <CodeMirror
            className="h-full w-full max-w-full overflow-hidden"
            value={content}
            height="100%"
            theme={vscodeDark}
            extensions={getLanguageExtension(relPath) ? [getLanguageExtension(relPath)!] : []}
            onChange={(value) => setContent(value)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
          />
        </div>
      )}

      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes in <code className="text-xs bg-muted p-0.5 rounded">{relPath}</code>. Do you want to save before closing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onClose}>
              Don't Save
            </Button>
            <Button onClick={async () => {
              await save();
              onClose();
            }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
