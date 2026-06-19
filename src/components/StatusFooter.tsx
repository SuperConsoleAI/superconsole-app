import { type ReactNode, useEffect, useState } from "react";
import { FileDiff, Folder, GitBranch } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, type Workspace } from "@/lib/api";

function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n}`;
}

interface StatusFooterProps {
  workspace: Workspace;
  onOpenFiles: () => void;
  // Re-fetch git stats when this changes (e.g. message count).
  refreshKey?: number | string;
  context?: number;
  tokens?: number;
  cost?: number;
  leftExtra?: ReactNode;
}

export function StatusFooter({
  workspace,
  onOpenFiles,
  refreshKey,
  context = 0,
  tokens = 0,
  cost = 0,
  leftExtra,
}: StatusFooterProps) {
  const [git, setGit] = useState<{
    branch: string | null;
    insertions: number;
    deletions: number;
  }>({ branch: null, insertions: 0, deletions: 0 });

  useEffect(() => {
    api
      .gitInfo(workspace.id)
      .then(setGit)
      .catch(() => setGit({ branch: null, insertions: 0, deletions: 0 }));
  }, [workspace.id, refreshKey]);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pb-2 pt-1.5 text-[10px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-1.5">
        {leftExtra}
        <span
          className="flex items-center gap-1.5 rounded border px-1.5 py-0.5"
          title="Uncommitted changes vs HEAD"
        >
          <FileDiff className="h-3 w-3" />
          <span className="text-emerald-500">+{git.insertions}</span>
          <span className="text-red-500">-{git.deletions}</span>
        </span>
        <button
          className="flex items-center gap-1 rounded border px-1.5 py-0.5 hover:text-foreground"
          title="Toggle files panel"
          onClick={onOpenFiles}
        >
          <Folder className="h-3 w-3" />
          File explorer
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {context > 0 && (
          <span className="rounded border px-1.5 py-0.5" title="Current context window usage">
            ctx {fmtK(context)}
          </span>
        )}
        {tokens > 0 && (
          <span
            className="rounded border px-1.5 py-0.5"
            title="Session total tokens and estimated cost"
          >
            {fmtK(tokens)} tok · ${cost.toFixed(4)}
          </span>
        )}
        <button
          className="flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 hover:text-foreground"
          title={workspace.path}
          onClick={() => revealItemInDir(workspace.path).catch(() => {})}
        >
          <Folder className="h-3 w-3 shrink-0" />
          <span className="truncate">~/{workspace.name}</span>
        </button>
        <span className="flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5">
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{git.branch ?? "no branch"}</span>
        </span>
      </div>
    </div>
  );
}
