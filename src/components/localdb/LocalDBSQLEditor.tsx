import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Database,
  Play,
  Bookmark,
  X,
  Maximize2,
  Minimize2,
  Folder,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { api, type SqlQueryResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LocalDBSQLEditorProps {
  onClose?: () => void;
  isModal?: boolean;
  defaultTarget?: "localdb" | "userdb";
  defaultQuery?: string;
}

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  target: "localdb" | "userdb";
  createdAt: number;
}

const BUILTIN_SNIPPETS = [
  {
    name: "Schema Migrations Table Info",
    sql: "PRAGMA table_info(_schema_migrations);",
    target: "localdb" as const,
  },
  {
    name: "List All SQLite Master Tables",
    sql: "SELECT name, type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    target: "localdb" as const,
  },
  {
    name: "Recent Workspaces",
    sql: "SELECT id, name, cli, tagline, details, logo_url, image_url, created_at, updated_at FROM workspaces ORDER BY updated_at DESC LIMIT 20;",
    target: "localdb" as const,
  },
  {
    name: "Inspect Projects Table",
    sql: "SELECT id, name, org_id, tagline, details, logo_url, image_url, slider, created_at FROM projects LIMIT 20;",
    target: "userdb" as const,
  },
  {
    name: "Recent Chat Sessions",
    sql: "SELECT id, title, model, provider, reasoning_effort, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC LIMIT 20;",
    target: "localdb" as const,
  },
  {
    name: "Installed Plugins",
    sql: "SELECT id, name, version, status, is_enabled FROM plugins LIMIT 20;",
    target: "localdb" as const,
  },
];

const LOCAL_STORAGE_KEY = "superconsole_sql_saved_queries";

export const LocalDBSQLEditor: React.FC<LocalDBSQLEditorProps> = ({
  onClose,
  isModal = true,
  defaultTarget = "localdb",
  defaultQuery = "PRAGMA table_info(_schema_migrations);",
}) => {
  const [target, setTarget] = useState<"localdb" | "userdb">(defaultTarget);
  const [sql, setSql] = useState<string>(defaultQuery);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [showSavedMenu, setShowSavedMenu] = useState<boolean>(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [saveName, setSaveName] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Load saved queries from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setSavedQueries(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load saved queries:", e);
    }
  }, []);

  const saveQueriesToStorage = (queries: SavedQuery[]) => {
    setSavedQueries(queries);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(queries));
    } catch (e) {
      console.error("Failed to save queries:", e);
    }
  };

  // Sync scroll between textarea and line numbers gutter
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Calculate lines for gutter
  const lineCount = useMemo(() => {
    const lines = sql.split("\n").length;
    return Math.max(lines, 6);
  }, [sql]);

  // Execute query
  const executeQuery = async () => {
    const trimmed = sql.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    try {
      const res = await api.executeLocalDbSql(trimmed, target);
      setResult(res);
    } catch (err: any) {
      setResult({
        success: false,
        columns: [],
        rows: [],
        executionTimeMs: 0,
        error: err?.message || String(err),
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Keyboard shortcut handler for textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘+Enter or Ctrl+Enter to run
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      executeQuery();
      return;
    }

    // Tab key inserts 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const targetEl = e.currentTarget;
      const start = targetEl.selectionStart;
      const end = targetEl.selectionEnd;
      const val = targetEl.value;
      const nextVal = val.substring(0, start) + "  " + val.substring(end);
      setSql(nextVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  // Clear query
  const handleClear = () => {
    setSql("");
    setResult(null);
    textareaRef.current?.focus();
  };

  // Save current query
  const handleSaveQuery = () => {
    if (!sql.trim()) return;
    const name = saveName.trim() || `Query #${savedQueries.length + 1}`;
    const newQuery: SavedQuery = {
      id: Date.now().toString(),
      name,
      sql: sql.trim(),
      target,
      createdAt: Date.now(),
    };
    saveQueriesToStorage([newQuery, ...savedQueries]);
    setSaveName("");
    setIsSaving(false);
  };

  const handleDeleteSavedQuery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveQueriesToStorage(savedQueries.filter((q) => q.id !== id));
  };

  const handleLoadQuery = (snippetSql: string, snippetTarget?: "localdb" | "userdb") => {
    setSql(snippetSql);
    if (snippetTarget) {
      setTarget(snippetTarget);
    }
    setShowSavedMenu(false);
    textareaRef.current?.focus();
  };

  // Copy results as CSV
  const handleCopyCsv = () => {
    if (!result || !result.columns.length) return;
    const header = result.columns.join(",");
    const rows = result.rows
      .map((r) =>
        r
          .map((cell) => {
            if (cell === null || cell === undefined) return "";
            const s = typeof cell === "object" ? JSON.stringify(cell) : String(cell);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");
    navigator.clipboard.writeText(`${header}\n${rows}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download results as CSV
  const handleDownloadCsv = () => {
    if (!result || !result.columns.length) return;
    const header = result.columns.join(",");
    const rows = result.rows
      .map((r) =>
        r
          .map((cell) => {
            if (cell === null || cell === undefined) return "";
            const s = typeof cell === "object" ? JSON.stringify(cell) : String(cell);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${rows}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sql_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const targetDisplayName = target === "userdb" ? "Turso UserDB" : "LocalDB";

  return (
    <div
      className={cn(
        "flex flex-col bg-[#16171b] text-foreground font-sans select-none overflow-hidden border border-border/80 shadow-2xl",
        isModal
          ? isMaximized
            ? "fixed inset-2 z-50 rounded-xl"
            : "fixed inset-6 md:inset-12 z-50 rounded-xl max-w-6xl mx-auto"
          : "h-full w-full rounded-xl",
      )}
    >
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <div className="h-12 border-b border-border/70 flex items-center justify-between px-4 bg-[#1a1b20] shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-foreground/90 shrink-0" />
          <span className="font-semibold text-sm text-foreground tracking-tight">SQL Editor</span>
          <span className="text-muted-foreground/40 mx-0.5">•</span>

          {/* Database Target Selector Badge */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => setTarget(target === "userdb" ? "localdb" : "userdb")}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Click to toggle between Turso UserDB and LocalDB"
            >
              <span>{targetDisplayName}</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
          </div>
        </div>

        {/* Right Action Icons: Folder, Maximize, Close */}
        <div className="flex items-center gap-1">
          {/* Saved Queries / Snippets Folder Icon */}
          <button
            type="button"
            onClick={() => setShowSavedMenu(!showSavedMenu)}
            className={cn(
              "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors",
              showSavedMenu && "bg-muted text-foreground",
            )}
            title="Saved Queries & Snippets"
          >
            <Folder className="w-4 h-4" />
          </button>

          {/* Maximize / Restore */}
          {isModal && (
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Close */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              title="Close SQL Editor"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Saved Queries & Snippets Dropdown Drawer ─────────────────── */}
      {showSavedMenu && (
        <div className="border-b border-border/70 bg-[#141519] p-3 text-xs max-h-64 overflow-y-auto shrink-0 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-primary" />
              Saved Queries & Snippets
            </span>
            <span className="text-[11px] text-muted-foreground">Click any query to insert into editor</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Builtin Snippets */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Quick Snippets
              </p>
              <div className="space-y-1">
                {BUILTIN_SNIPPETS.map((snippet, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleLoadQuery(snippet.sql, snippet.target)}
                    className="w-full text-left p-1.5 rounded bg-muted/30 hover:bg-muted/70 transition-colors flex items-center justify-between group"
                  >
                    <div className="truncate mr-2">
                      <span className="font-medium text-foreground block truncate">{snippet.name}</span>
                      <code className="text-[10px] text-muted-foreground font-mono block truncate">
                        {snippet.sql}
                      </code>
                    </div>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-background/60 text-muted-foreground font-mono shrink-0">
                      {snippet.target}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* User Saved Queries */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Your Saved Queries ({savedQueries.length})
              </p>
              {savedQueries.length === 0 ? (
                <p className="text-muted-foreground/60 italic text-[11px] p-2">
                  No saved queries yet. Click the "Save" button in the toolbar to save queries.
                </p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {savedQueries.map((q) => (
                    <div
                      key={q.id}
                      onClick={() => handleLoadQuery(q.sql, q.target)}
                      className="cursor-pointer p-1.5 rounded bg-muted/30 hover:bg-muted/70 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate mr-2">
                        <span className="font-medium text-foreground block truncate">{q.name}</span>
                        <code className="text-[10px] text-muted-foreground font-mono block truncate">
                          {q.sql}
                        </code>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-background/60 text-muted-foreground font-mono">
                          {q.target}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSavedQuery(q.id, e)}
                          className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete saved query"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Editor Pane with Line Numbers ─────────────────────────────── */}
      <div className="flex bg-[#16171b] border-b border-border/60 min-h-[160px] max-h-[280px] overflow-hidden relative">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-10 select-none text-right pr-3 font-mono text-xs text-muted-foreground/35 pt-3 leading-relaxed shrink-0 bg-[#141518] border-r border-border/40 overflow-hidden"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="h-5 leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* SQL Textarea */}
        <div className="flex-1 relative overflow-hidden">
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            placeholder="Enter SQL statement here (e.g. SELECT * FROM workspaces LIMIT 10;)..."
            spellCheck={false}
            autoFocus
            className="w-full h-full p-3 font-mono text-xs md:text-sm bg-transparent text-foreground outline-none resize-none leading-5 caret-primary selection:bg-primary/20"
          />
        </div>
      </div>

      {/* ── Action Toolbar: Hit ⌘↵ to run | Clear | Save | Run ⌘↵ ─────── */}
      <div className="h-11 border-b border-border/70 flex items-center justify-between px-4 bg-[#18191e] shrink-0">
        <div className="text-xs font-mono text-muted-foreground/60 select-none flex items-center gap-1.5">
          <span>Hit ⌘↵ to run</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            className="h-8 px-3 text-xs font-medium rounded-md border border-border/70 bg-card/60 hover:bg-muted/70 text-foreground transition-colors"
          >
            Clear
          </button>

          {/* Save Button */}
          {isSaving ? (
            <div className="flex items-center gap-1.5 bg-card border border-border px-2 py-0.5 rounded-md">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Query name..."
                className="h-6 w-32 bg-transparent text-xs text-foreground outline-none font-sans"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveQuery();
                  if (e.key === "Escape") setIsSaving(false);
                }}
              />
              <button
                type="button"
                onClick={handleSaveQuery}
                className="text-[11px] font-medium text-primary hover:underline px-1"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setIsSaving(false)}
                className="text-muted-foreground hover:text-foreground text-[11px]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsSaving(true)}
              className="h-8 px-3 text-xs font-medium rounded-md border border-border/70 bg-card/60 hover:bg-muted/70 text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5 opacity-70" />
              <span>Save</span>
            </button>
          )}

          {/* Run ⌘↵ Button — High Contrast Primary matching screenshot */}
          <button
            type="button"
            onClick={executeQuery}
            disabled={isRunning || !sql.trim()}
            className={cn(
              "h-8 px-3.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs",
              isRunning
                ? "bg-foreground/60 text-background cursor-not-allowed"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-95 cursor-pointer",
            )}
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin fill-current" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>Run ⌘↵</span>
          </button>
        </div>
      </div>

      {/* ── Results Area (Bottom Pane) ────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#16171b]">
        {isRunning ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">Executing query...</p>
            <p className="text-xs text-muted-foreground mt-1">Connecting to {targetDisplayName}</p>
          </div>
        ) : !result ? (
          /* Empty State — Exactly matching screenshot */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground/70" />
            </div>
            <h3 className="text-base font-semibold text-foreground tracking-tight mb-2">
              Run SQL Queries against {targetDisplayName}
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground/80 max-w-md leading-relaxed">
              Inspect table data, check table schemas, test triggers, or run custom SELECT/PRAGMA statements in real-time.
            </p>
          </div>
        ) : !result.success ? (
          /* Error State */
          <div className="p-6 flex-1 flex flex-col">
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-destructive font-semibold text-sm mb-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>SQL Execution Failed ({result.executionTimeMs}ms)</span>
              </div>
              <p className="text-destructive/90 whitespace-pre-wrap">{result.error}</p>
            </div>
          </div>
        ) : (
          /* Results Table State */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Results Metadata Bar */}
            <div className="h-9 px-4 border-b border-border/50 flex items-center justify-between bg-[#191a1f] shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-muted-foreground">
                  {result.rows.length} {result.rows.length === 1 ? "row" : "rows"}
                  {result.affectedRows !== undefined && result.affectedRows !== null && (
                    <span className="ml-1">({result.affectedRows} affected)</span>
                  )}
                  <span className="mx-1.5">•</span>
                  <span>{result.executionTimeMs}ms</span>
                </span>
              </div>

              {/* Export actions */}
              {result.columns.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCsv}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copied ? "Copied" : "Copy CSV"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </div>

            {/* Results Table */}
            {result.columns.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Statement executed successfully. No rows returned.
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead className="sticky top-0 z-10 bg-[#1b1c22] border-b border-border/70 shadow-2xs">
                    <tr>
                      <th className="py-2 px-3 w-10 text-right text-[10px] text-muted-foreground/40 font-mono select-none">
                        #
                      </th>
                      {result.columns.map((col, idx) => (
                        <th
                          key={idx}
                          className="py-2 px-3 font-semibold text-muted-foreground tracking-wider uppercase text-[11px] border-l border-border/30 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {result.rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-muted/30 transition-colors font-mono text-[11px] md:text-xs"
                      >
                        <td className="py-1.5 px-3 text-right text-[10px] text-muted-foreground/40 select-none">
                          {rowIdx + 1}
                        </td>
                        {row.map((val, colIdx) => (
                          <td
                            key={colIdx}
                            className="py-1.5 px-3 border-l border-border/20 max-w-sm truncate whitespace-nowrap"
                          >
                            {val === null || val === undefined ? (
                              <span className="text-muted-foreground/40 italic">NULL</span>
                            ) : typeof val === "boolean" ? (
                              <span className="text-amber-400 font-semibold">{String(val)}</span>
                            ) : typeof val === "number" ? (
                              <span className="text-cyan-400">{val}</span>
                            ) : typeof val === "object" ? (
                              <span className="text-muted-foreground">{JSON.stringify(val)}</span>
                            ) : (
                              <span className="text-foreground">{String(val)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
