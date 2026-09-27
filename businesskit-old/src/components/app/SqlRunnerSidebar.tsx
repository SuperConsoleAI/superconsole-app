// src/components/app/SqlRunnerSidebar.tsx
// Supabase-inspired SQL Runner & Schema Inspector Sidebar for BusinessKit.
// Uses shared SlideOver component for smooth animations, backdrops, and auto-placement.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  useStylesScoped$,
} from "@builder.io/qwik";
import {
  LuPlay,
  LuFolder,
  LuMaximize2,
  LuMinimize2,
  LuTrash2,
  LuCopy,
  LuCheck,
  LuDownload,
  LuClock,
  LuAlertCircle,
  LuCheckCircle2,
  LuBookmark,
  LuCode,
  LuSparkles,
} from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import { executeRawSql, type RawSqlResult } from "~/lib/ipc";
import { SlideOver } from "~/components/SlideOver";

interface SavedSnippet {
  id: string;
  name: string;
  sql: string;
}

const DEFAULT_SNIPPETS: { title: string; category: string; sql: string }[] = [
  {
    title: "Table Info (_schema_migrations)",
    category: "System",
    sql: "PRAGMA table_info(_schema_migrations);",
  },
  {
    title: "Check Applied Migrations",
    category: "System",
    sql: "SELECT id, datetime(applied_at, 'unixepoch') AS applied_time, duration_ms, error FROM _schema_migrations ORDER BY applied_at DESC;",
  },
  {
    title: "Check All Tables",
    category: "Schema",
    sql: "SELECT name, type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  },
  {
    title: "Check Installed Apps",
    category: "System",
    sql: "SELECT id, profile_id, installed, updated_at FROM profile_apps;",
  },
  {
    title: "Check E-Commerce & Store Tables",
    category: "Apps",
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('stores', 'products', 'inventory', 'store_orders', 'links', 'pages') ORDER BY name;",
  },
  {
    title: "Check All Triggers",
    category: "Schema",
    sql: "SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name;",
  },
  {
    title: "Check All Indexes",
    category: "Schema",
    sql: "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name;",
  },
  {
    title: "Check Table Columns (users)",
    category: "Schema",
    sql: "SELECT cid, name, type, \"notnull\", dflt_value, pk FROM pragma_table_info('users');",
  },
  {
    title: "Inspect Table DDL Definitions",
    category: "Schema",
    sql: "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  },
  {
    title: "Query Users (First 10)",
    category: "Data",
    sql: "SELECT id, email, first_name, last_name, datetime(created_at, 'unixepoch') AS created FROM users LIMIT 10;",
  },
  {
    title: "Query Profiles (Projects)",
    category: "Data",
    sql: "SELECT id, user_id, title, slug, datetime(created_at, 'unixepoch') AS created FROM profiles;",
  },
  {
    title: "Check Turso / SQLite Integrity",
    category: "Health",
    sql: "PRAGMA integrity_check;",
  },
  {
    title: "Check Foreign Keys Setting",
    category: "Health",
    sql: "PRAGMA foreign_keys;",
  },
];

export const SqlRunnerSidebar = component$(() => {
  useStylesScoped$(`
    .sql-runner-wrapper {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
      background: var(--surface-1, #0f1117);
      box-sizing: border-box;
      overflow: hidden;
    }
    .sql-editor-gutter {
      user-select: none;
      text-align: right;
      padding: 0.5rem 0.5rem 0.5rem 0.75rem;
      color: var(--text-tertiary, #565b6d);
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
      font-size: 0.82rem;
      line-height: 1.45rem;
      border-right: 1px solid var(--border, #222533);
      background: rgba(0, 0, 0, 0.25);
    }
    .sql-textarea {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary, #f1f5f9);
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
      font-size: 0.82rem;
      line-height: 1.45rem;
      padding: 0.5rem 0.75rem;
      resize: none;
      white-space: pre;
      overflow-x: auto;
      tab-size: 2;
    }
    .sql-result-table th {
      position: sticky;
      top: 0;
      background: var(--surface-2, #181b24);
      color: var(--text-secondary, #94a3b8);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--border, #262936);
      text-align: left;
      white-space: nowrap;
      z-index: 2;
    }
    .sql-result-table td {
      padding: 0.45rem 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
      font-size: 0.78rem;
      color: var(--text-primary, #e2e8f0);
      white-space: nowrap;
      max-width: 20rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sql-result-table tr:hover td {
      background: rgba(255, 255, 255, 0.03);
    }
    .sql-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.55rem;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 500;
      border: 1px solid var(--border, #2a2e3d);
      background: var(--surface-2, #161922);
      color: var(--text-secondary, #94a3b8);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .sql-pill-btn:hover {
      background: var(--surface-3, #1e222d);
      color: var(--text-primary, #f8fafc);
      border-color: var(--border-hover, #3d4356);
    }
    @media (max-width: 640px) {
      .sql-runner-wrapper {
        margin: -1.25rem;
      }
    }
  `);

  const ctx = useAppContext();
  const sqlInput = useSignal("PRAGMA table_info(_schema_migrations);");
  const isWide = useSignal(false);
  const running = useSignal(false);
  const result = useSignal<RawSqlResult | null>(null);
  const error = useSignal<string | null>(null);
  const snippetsOpen = useSignal(false);
  const savedSnippets = useSignal<SavedSnippet[]>([]);
  const copied = useSignal(false);

  // Sync initial query if opened from another page (like Status page)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const init = track(() => ctx.sqlRunnerInitialQuery?.value);
    if (init && init.trim()) {
      sqlInput.value = init;
      if (ctx.sqlRunnerInitialQuery) {
        ctx.sqlRunnerInitialQuery.value = "";
      }
    }
  });

  // Load custom snippets from localStorage
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    try {
      const raw = localStorage.getItem("bk-custom-sql-snippets");
      if (raw) {
        savedSnippets.value = JSON.parse(raw);
      }
    } catch {
      /* ignore */
    }
  });

  // Keyboard shortcut: Cmd+Enter / Ctrl+Enter to execute
  const runQuery = $(async () => {
    const trimmed = sqlInput.value.trim();
    if (!trimmed) return;

    running.value = true;
    error.value = null;
    result.value = null;

    try {
      const res = await executeRawSql(trimmed);
      result.value = res;
    } catch (e: any) {
      error.value = String(e?.message || e || "Query failed");
    } finally {
      running.value = false;
    }
  });

  const saveSnippet = $(() => {
    const name = window.prompt("Snippet Name:", "My Query");
    if (!name || !name.trim()) return;
    const item: SavedSnippet = {
      id: "snip-" + Date.now(),
      name: name.trim(),
      sql: sqlInput.value,
    };
    const updated = [item, ...savedSnippets.value];
    savedSnippets.value = updated;
    localStorage.setItem("bk-custom-sql-snippets", JSON.stringify(updated));
  });

  const deleteSnippet = $((id: string) => {
    const updated = savedSnippets.value.filter((s) => s.id !== id);
    savedSnippets.value = updated;
    localStorage.setItem("bk-custom-sql-snippets", JSON.stringify(updated));
  });

  const copyResultJson = $(() => {
    if (!result.value) return;
    const formatted = JSON.stringify(result.value.rows, null, 2);
    navigator.clipboard.writeText(formatted);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  });

  const downloadCsv = $(() => {
    if (!result.value || !result.value.columns.length) return;
    const cols = result.value.columns;
    const rows = result.value.rows;

    const csvLines = [
      cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return '""';
            if (typeof cell === "object") return `"${JSON.stringify(cell).replace(/"/g, '""')}"`;
            return `"${String(cell).replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `query_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Calculate line count for gutter
  const lineCount = sqlInput.value.split("\n").length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 6) }, (_, i) => i + 1);

  const panelWidth = isWide.value ? "min(860px, 95vw)" : "min(560px, 95vw)";

  return (
    <SlideOver
      open={ctx.sqlRunnerOpen}
      title="SQL Editor"
      subtitle="Turso UserDB"
      icon="database"
      width={panelWidth}
      zIndex={450}
      placement="auto"
      noPadding={true}
    >
      {/* Header Actions Slot */}
      <div q:slot="header-actions" style="display:flex;align-items:center;gap:0.375rem;">
        {/* Snippets / Templates Dropdown Toggle */}
        <button
          type="button"
          title="Query Templates & Saved Snippets"
          onClick$={() => {
            snippetsOpen.value = !snippetsOpen.value;
          }}
          style={`display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:0.375rem;border:1px solid ${snippetsOpen.value ? "var(--accent,#10b981)" : "var(--border)"};background:${snippetsOpen.value ? "rgba(16,185,129,0.15)" : "transparent"};color:${snippetsOpen.value ? "#10b981" : "var(--text-secondary)"};cursor:pointer;transition:all 150ms ease;`}
        >
          <LuFolder style="width:0.95rem;height:0.95rem;" />
        </button>

        {/* Width / Expand toggle */}
        <button
          type="button"
          title={isWide.value ? "Standard Width" : "Expand Width"}
          onClick$={() => {
            isWide.value = !isWide.value;
          }}
          style="display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:0.375rem;border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;transition:all 150ms ease;"
        >
          {isWide.value ? (
            <LuMinimize2 style="width:0.95rem;height:0.95rem;" />
          ) : (
            <LuMaximize2 style="width:0.95rem;height:0.95rem;" />
          )}
        </button>
      </div>

      {/* Main SlideOver Body */}
      <div class="sql-runner-wrapper">
        {/* ── Snippets / Templates Drawer Popover ───────────────── */}
        {snippetsOpen.value && (
          <div
            style="background:var(--surface-2,#141721);border-bottom:1px solid var(--border,#262936);padding:0.75rem 1rem;max-height:16rem;overflow-y:auto;flex-shrink:0;"
          >
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
              <span style="font-size:0.75rem;font-weight:600;text-transform:uppercase;color:var(--text-secondary,#94a3b8);letter-spacing:0.04em;">
                Query Presets & Checks
              </span>
              <button
                onClick$={() => {
                  snippetsOpen.value = false;
                }}
                style="background:none;border:none;color:var(--text-tertiary,#64748b);font-size:0.72rem;cursor:pointer;"
              >
                Done
              </button>
            </div>

            <div style="display:grid;grid-template-columns:1fr;gap:0.35rem;">
              {DEFAULT_SNIPPETS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick$={() => {
                    sqlInput.value = s.sql;
                    snippetsOpen.value = false;
                  }}
                  style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.6rem;background:var(--surface-1,#0f1117);border:1px solid var(--border,#222533);border-radius:4px;color:var(--text-primary,#f1f5f9);font-size:0.78rem;cursor:pointer;text-align:left;transition:all 0.15s;"
                >
                  <div style="display:flex;align-items:center;gap:0.4rem;">
                    <span style="color:var(--accent,#10b981);font-size:0.7rem;font-weight:600;">
                      [{s.category}]
                    </span>
                    <span>{s.title}</span>
                  </div>
                  <LuPlay style="width:0.75rem;height:0.75rem;color:var(--text-tertiary,#64748b);flex-shrink:0;" />
                </button>
              ))}

              {savedSnippets.value.length > 0 && (
                <>
                  <div style="margin-top:0.5rem;font-size:0.72rem;font-weight:600;color:var(--text-secondary,#94a3b8);text-transform:uppercase;">
                    My Saved Snippets
                  </div>
                  {savedSnippets.value.map((snip) => (
                    <div
                      key={snip.id}
                      style="display:flex;align-items:center;justify-content:space-between;padding:0.35rem 0.6rem;background:var(--surface-1,#0f1117);border:1px solid var(--border,#222533);border-radius:4px;"
                    >
                      <button
                        type="button"
                        onClick$={() => {
                          sqlInput.value = snip.sql;
                          snippetsOpen.value = false;
                        }}
                        style="background:none;border:none;color:var(--text-primary,#f1f5f9);font-size:0.78rem;cursor:pointer;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                      >
                        {snip.name}
                      </button>
                      <button
                        type="button"
                        onClick$={() => deleteSnippet(snip.id)}
                        title="Delete Snippet"
                        style="background:none;border:none;color:var(--error,#ef4444);cursor:pointer;padding:0.2rem;"
                      >
                        <LuTrash2 style="width:0.8rem;height:0.8rem;" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Code Editor Area ──────────────────────────────────── */}
        <div
          style="display:flex;min-height:9rem;max-height:16rem;background:rgba(0,0,0,0.35);border-bottom:1px solid var(--border,#262936);position:relative;flex-shrink:0;"
        >
          {/* Line Numbers */}
          <div class="sql-editor-gutter">
            {lineNumbers.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            class="sql-textarea"
            value={sqlInput.value}
            onInput$={(e, el) => {
              sqlInput.value = el.value;
            }}
            onKeyDown$={(e, el) => {
              // Cmd+Enter or Ctrl+Enter to Run
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                runQuery();
              }
              // Tab key support (insert 2 spaces)
              if (e.key === "Tab") {
                e.preventDefault();
                const start = el.selectionStart;
                const end = el.selectionEnd;
                el.value = el.value.substring(0, start) + "  " + el.value.substring(end);
                el.selectionStart = el.selectionEnd = start + 2;
                sqlInput.value = el.value;
              }
            }}
            placeholder="-- Enter SQL query here (e.g. SELECT * FROM users LIMIT 10;)"
            spellcheck={false}
            autocomplete="off"
          />
        </div>

        {/* ── Action Bar Below Editor ───────────────────────────── */}
        <div
          style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--surface-2,#141721);border-bottom:1px solid var(--border,#262936);flex-shrink:0;"
        >
          <span
            style="font-family:monospace;font-size:0.72rem;color:var(--text-tertiary,#64748b);"
          >
            Hit ⌘↵ to run
          </span>

          <div style="display:flex;align-items:center;gap:0.4rem;">
            <button
              type="button"
              class="sql-pill-btn"
              onClick$={() => {
                sqlInput.value = "";
                result.value = null;
                error.value = null;
              }}
              title="Clear Editor"
            >
              Clear
            </button>

            <button
              type="button"
              class="sql-pill-btn"
              onClick$={saveSnippet}
              title="Save Current Query as Snippet"
            >
              <LuBookmark style="width:0.75rem;height:0.75rem;" />
              <span>Save</span>
            </button>

            <button
              type="button"
              disabled={running.value}
              onClick$={runQuery}
              style={`display:inline-flex;align-items:center;gap:0.35rem;padding:0.32rem 0.85rem;border-radius:4px;border:none;background:var(--accent,#10b981);color:#062d1f;font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.15s ease;opacity:${running.value ? 0.7 : 1};`}
            >
              <LuPlay style="width:0.8rem;height:0.8rem;fill:currentColor;" />
              <span>{running.value ? "Running…" : "Run ⌘↵"}</span>
            </button>
          </div>
        </div>

        {/* ── Query Execution Results Panel ─────────────────────── */}
        <div
          style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--surface-1,#0f1117);"
        >
          {/* Loading Bar */}
          {running.value && (
            <div
              style="padding:1.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5rem;color:var(--text-secondary,#94a3b8);font-size:0.82rem;"
            >
              <div class="spinner" style="width:1.25rem;height:1.25rem;border:2px solid var(--border);border-top-color:#10b981;border-radius:50%;animation:spin 1s linear infinite;" />
              <span>Executing SQL query against UserDB…</span>
            </div>
          )}

          {/* Error Alert Box */}
          {error.value && !running.value && (
            <div style="padding:1rem;margin:0.75rem;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:0.8rem;">
              <div style="display:flex;align-items:flex-start;gap:0.4rem;font-weight:600;margin-bottom:0.25rem;">
                <LuAlertCircle style="width:1rem;height:1rem;flex-shrink:0;margin-top:0.1rem;" />
                <span>Query Execution Error</span>
              </div>
              <pre style="margin:0;font-family:monospace;font-size:0.76rem;white-space:pre-wrap;word-break:break-word;color:#fca5a5;">
                {error.value}
              </pre>
            </div>
          )}

          {/* Success Results View */}
          {result.value && !running.value && (
            <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
              {/* Results Status Header */}
              <div
                style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.75rem;background:var(--surface-2,#141721);border-bottom:1px solid var(--border,#262936);flex-shrink:0;"
              >
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <span
                    style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.72rem;font-weight:600;color:#10b981;"
                  >
                    <LuCheckCircle2 style="width:0.85rem;height:0.85rem;" />
                    {result.value.rows.length} row{result.value.rows.length === 1 ? "" : "s"}
                  </span>

                  <span
                    style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.7rem;color:var(--text-tertiary,#64748b);"
                  >
                    <LuClock style="width:0.75rem;height:0.75rem;" />
                    {result.value.execution_time_ms} ms
                  </span>

                  {result.value.rows_affected > 0 && (
                    <span
                      style="font-size:0.7rem;color:var(--text-secondary,#94a3b8);"
                    >
                      ({result.value.rows_affected} affected)
                    </span>
                  )}
                </div>

                {result.value.rows.length > 0 && (
                  <div style="display:flex;align-items:center;gap:0.3rem;">
                    <button
                      type="button"
                      class="sql-pill-btn"
                      onClick$={copyResultJson}
                      title="Copy Rows as JSON"
                    >
                      {copied.value ? (
                        <LuCheck style="width:0.75rem;height:0.75rem;color:#10b981;" />
                      ) : (
                        <LuCopy style="width:0.75rem;height:0.75rem;" />
                      )}
                      <span>{copied.value ? "Copied" : "JSON"}</span>
                    </button>

                    <button
                      type="button"
                      class="sql-pill-btn"
                      onClick$={downloadCsv}
                      title="Export Results to CSV"
                    >
                      <LuDownload style="width:0.75rem;height:0.75rem;" />
                      <span>CSV</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Table or Empty Result */}
              {result.value.rows.length === 0 ? (
                <div
                  style="padding:2rem 1rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4rem;color:var(--text-secondary,#94a3b8);font-size:0.82rem;"
                >
                  <LuCode style="width:1.5rem;height:1.5rem;color:var(--text-tertiary,#64748b);" />
                  <span>Statement executed successfully.</span>
                  <span style="font-size:0.74rem;color:var(--text-tertiary,#64748b);">
                    0 rows returned. (Affected: {result.value.rows_affected})
                  </span>
                </div>
              ) : (
                <div style="flex:1;overflow:auto;">
                  <table class="sql-result-table" style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr>
                        <th style="width:2.5rem;text-align:center;color:var(--text-tertiary);">#</th>
                        {result.value.columns.map((col, cIdx) => (
                          <th key={cIdx}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.value.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td
                            style="text-align:center;color:var(--text-tertiary,#565b6d);font-size:0.7rem;user-select:none;"
                          >
                            {rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => {
                            const isNull = cell === null || cell === undefined;
                            const displayStr = isNull
                              ? "NULL"
                              : typeof cell === "object"
                              ? JSON.stringify(cell)
                              : String(cell);
                            return (
                              <td
                                key={cIdx}
                                title={displayStr}
                                style={isNull ? "color:var(--text-tertiary,#64748b);font-style:italic;" : ""}
                              >
                                {displayStr}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Initial Empty State / Helper */}
          {!result.value && !error.value && !running.value && (
            <div
              style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1.5rem;text-align:center;gap:0.6rem;color:var(--text-secondary,#94a3b8);"
            >
              <LuSparkles style="width:2rem;height:2rem;color:var(--accent,#10b981);opacity:0.8;" />
              <div style="font-size:0.875rem;font-weight:600;color:var(--text-primary,#f8fafc);">
                Run SQL Queries against Turso UserDB
              </div>
              <p
                style="margin:0;font-size:0.78rem;color:var(--text-tertiary,#64748b);max-width:22rem;"
              >
                Inspect table data, check table schemas, test triggers, or run custom SELECT/PRAGMA statements in real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    </SlideOver>
  );
});
