// src/routes/dashboard/agents/commands/index.tsx
//
// Agent Commands Management & Tool Scoping Page.
// Design matches Shop › Units of Measurement.
// Clean layout using global CSS, refresh icon in filter tabs, search + [+New] grouped, surface2 cards.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  useComputed$,
  useStylesScoped$,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  LuPlus,
  LuPencil,
  LuTrash2,
  LuTerminal,
  LuRefreshCw,
  LuSearch,
  LuCheck,
  LuCopy,
  LuShieldCheck,
  LuWrench,
} from "@qwikest/icons/lucide";
import {
  AddCommand,
  DEFAULT_CATALOG_TOOLS,
  TOOL_DOMAIN_INFO,
  type ToolCatalogItem,
} from "~/components/agents";
import {
  listAgentCommands,
  listAgentTools,
  deleteAgentCommand,
} from "~/lib/ipc";
import {
  getCachedCommandsList,
  setCachedCommandsList,
  getCachedToolsList,
  setCachedToolsList,
} from "~/lib/agent-config";
import type { AgentCommand } from "~/lib/types";

const PAGE_SIZE = 30;

export default component$(() => {
  useStylesScoped$(`
    .commands-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .commands-tabs {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      overflow-x: auto;
      padding: 0.25rem;
      background: var(--surface-3);
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .commands-tabs::-webkit-scrollbar {
      display: none;
    }
    .commands-toolbar-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .commands-search-box {
      position: relative;
      min-width: 180px;
      max-width: 260px;
    }
    .command-card {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      padding: 0.875rem 1rem;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      transition: border-color 0.15s, box-shadow 0.15s;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }
    .command-card-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      min-width: 0;
    }
    .command-card-left {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      min-width: 0;
      flex: 1;
    }
    .command-card-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      flex: 1;
      overflow: hidden;
    }
    .command-desc-line {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .command-card-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    .command-card-tools {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      flex-wrap: wrap;
      width: 100%;
      padding-top: 0.625rem;
      border-top: 1px dashed var(--border);
      box-sizing: border-box;
    }
    .command-slash-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: 0.25rem;
      padding: 0.1rem 0.4rem;
      font-size: 0.75rem;
      font-family: monospace;
      color: var(--accent, #3B82F6);
      cursor: pointer;
      flex-shrink: 0;
    }
    .command-slash-text {
      display: inline;
    }

    @media (max-width: 640px) {
      .command-slash-text {
        display: none !important;
      }
      .command-slash-btn {
        padding: 0.2rem 0.35rem !important;
      }
      .commands-toolbar {
        flex-direction: column;
        align-items: stretch !important;
        gap: 0.625rem !important;
      }
      .commands-tabs {
        width: 100%;
        box-sizing: border-box;
      }
      .commands-toolbar-right {
        width: 100%;
        display: flex;
        gap: 0.5rem;
      }
      .commands-search-box {
        flex: 1 !important;
        min-width: 0 !important;
        max-width: none !important;
      }
      .command-card {
        padding: 0.75rem !important;
        gap: 0.625rem !important;
      }
      .command-card-main {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.625rem !important;
      }
      .command-card-left {
        width: 100%;
        align-items: flex-start;
      }
      .command-desc-line {
        display: -webkit-box !important;
        -webkit-line-clamp: 1 !important;
        -webkit-box-orient: vertical !important;
        white-space: normal !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        max-width: 100% !important;
      }
      .command-card-right {
        width: 100%;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-top: 0 !important;
        border-top: none !important;
      }
      .command-card-tools {
        padding-top: 0.5rem !important;
        gap: 0.375rem !important;
      }
    }
  `);

  const cachedCmds   = getCachedCommandsList();
  const cachedTools  = getCachedToolsList();

  const commands     = useSignal<AgentCommand[]>(cachedCmds || []);
  const toolsCatalog = useSignal<ToolCatalogItem[]>(cachedTools || DEFAULT_CATALOG_TOOLS);
  const loading      = useSignal(!cachedCmds || cachedCmds.length === 0);
  const panelOpen    = useSignal(false);
  const editing      = useSignal<AgentCommand | null>(null);
  const refreshing   = useSignal(false);
  const search       = useSignal("");
  const activeTab    = useSignal<string>("all");
  const copiedId     = useSignal<string | null>(null);
  const visibleLimit = useSignal(PAGE_SIZE);

  const fetchCommands = $(async () => {
    try {
      const [cmds, liveTools] = await Promise.all([
        listAgentCommands(),
        listAgentTools().catch(() => null),
      ]);
      commands.value = cmds;
      setCachedCommandsList(cmds);
      if (liveTools && Array.isArray(liveTools) && liveTools.length > 0) {
        const mappedTools = liveTools.map((lt) => {
          const fallback = DEFAULT_CATALOG_TOOLS.find((t) => t.name === lt.name);
          return {
            name: lt.name,
            label: fallback?.label || lt.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            domain: (lt.domain as any) || "shop",
            description: lt.description || fallback?.description || "",
            tokens: lt.tokenEstimate || fallback?.tokens || 100,
          };
        });
        toolsCatalog.value = mappedTools;
        setCachedToolsList(mappedTools);
      }
    } catch (e) {
      console.error("[commands] Failed to load commands:", e);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchCommands();
  });

  const openAdd = $(() => {
    editing.value = null;
    panelOpen.value = true;
  });

  const openEdit = $((cmd: AgentCommand) => {
    editing.value = cmd;
    panelOpen.value = true;
  });

  const handleCopySlash = $((slashText: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(slashText);
      copiedId.value = id;
      setTimeout(() => {
        if (copiedId.value === id) {
          copiedId.value = null;
        }
      }, 1500);
    }
  });

  const handleDelete = $(async (id: string, name: string) => {
    if (!window.confirm(`Delete custom command "${name}"? This action cannot be undone.`)) return;
    try {
      await deleteAgentCommand(id);
      commands.value = commands.value.filter((c) => c.id !== id);
      setCachedCommandsList(commands.value);
    } catch (e: any) {
      alert(typeof e === "string" ? e : e.message || String(e));
    }
  });

  const filteredCommands = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    const tab = activeTab.value;
    return commands.value.filter((cmd) => {
      const matchTab = tab === "all" || cmd.domainTags.includes(tab);
      const matchSearch =
        !q ||
        cmd.name.toLowerCase().includes(q) ||
        cmd.slash.toLowerCase().includes(q) ||
        (cmd.description && cmd.description.toLowerCase().includes(q)) ||
        cmd.requiredTools.some((t: string) => t.toLowerCase().includes(q));
      return matchTab && matchSearch;
    });
  });

  const displayedCommands = useComputed$(() => {
    return filteredCommands.value.slice(0, visibleLimit.value);
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* ── Add / Edit Command SlideOver Component ───────────────────────────── */}
      <AddCommand
        open={panelOpen}
        editingCommand={editing}
        defaultDomain={activeTab.value}
        toolsCatalog={toolsCatalog.value}
        onSaved$={$(async (savedCmd: AgentCommand) => {
          if (editing.value) {
            commands.value = commands.value.map((c) => (c.id === savedCmd.id ? savedCmd : c));
          } else {
            commands.value = [savedCmd, ...commands.value];
          }
          setCachedCommandsList(commands.value);
        })}
      />

      {/* ── Toolbar: Filter Tabs on Left, Search + Refresh + [+ New] on Right ── */}
      <div class="commands-toolbar">
        {/* Category Domain Tabs */}
        <div class="commands-tabs">
          <button
            type="button"
            onClick$={() => {
              activeTab.value = "all";
              visibleLimit.value = PAGE_SIZE;
            }}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              fontWeight: activeTab.value === "all" ? "600" : "500",
              background: activeTab.value === "all" ? "var(--surface-1)" : "transparent",
              color: activeTab.value === "all" ? "var(--text-primary)" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            All ({commands.value.length})
          </button>
          {Object.entries(TOOL_DOMAIN_INFO).map(([key, info]) => {
            const count = commands.value.filter((c) => c.domainTags.includes(key)).length;
            const Icon = info.icon;
            return (
              <button
                key={key}
                type="button"
                onClick$={() => {
                  activeTab.value = key;
                  visibleLimit.value = PAGE_SIZE;
                }}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  fontWeight: activeTab.value === key ? "600" : "500",
                  background: activeTab.value === key ? "var(--surface-1)" : "transparent",
                  color: activeTab.value === key ? "var(--text-primary)" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                <Icon style={{ width: "0.875rem", height: "0.875rem" }} />
                <span>{info.label.split(" ")[0]}</span>
                <span style={{ opacity: 0.7 }}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Right: Search + Refresh Icon + [+ New] */}
        <div class="commands-toolbar-right">
          <div class="commands-search-box">
            <LuSearch
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                width: "0.875rem",
                height: "0.875rem",
                color: "var(--text-secondary)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search commands & tools…"
              value={search.value}
              onInput$={(e) => {
                search.value = (e.target as HTMLInputElement).value;
                visibleLimit.value = PAGE_SIZE;
              }}
              style={{
                width: "100%",
                height: "2.125rem",
                paddingLeft: "2rem",
                paddingRight: "0.75rem",
                fontSize: "0.8125rem",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="button"
            disabled={refreshing.value}
            onClick$={$(async () => {
              refreshing.value = true;
              await fetchCommands();
            })}
            title="Reload commands catalog"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.125rem",
              height: "2.125rem",
              borderRadius: "0.375rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <LuRefreshCw style={`width: 0.875rem; height: 0.875rem; ${refreshing.value ? "animation: spin 1s linear infinite;" : ""}`} />
          </button>

          <button
            type="button"
            onClick$={openAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "var(--button-primary-bg, #3B82F6)",
              color: "var(--button-primary-text, #ffffff)",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0 0.875rem",
              height: "2.125rem",
              fontSize: "0.8125rem",
              fontWeight: "600",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <LuPlus style="width: 0.875rem; height: 0.875rem;" /> New
          </button>
        </div>
      </div>

      {/* ── Commands List View (Card bg = surface2) ─────────────────────────── */}
      {loading.value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                height: "4rem",
                background: "var(--surface-2)",
                borderRadius: "0.5rem",
                animation: "pulse 2s infinite",
                animationDelay: `${(i - 1) * 150}ms`,
              }}
            />
          ))}
        </div>
      ) : filteredCommands.value.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 2rem",
            textAlign: "center",
            gap: "1rem",
            background: "var(--surface-2)",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
            }}
          >
            <LuTerminal style={{ width: "1.75rem", height: "1.75rem" }} />
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-primary)" }}>
              No commands found
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              {search.value ? "Try adjusting your search query or domain filter." : "Create your first custom agent command with scoped tools."}
            </div>
          </div>
          <button
            type="button"
            onClick$={openAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "var(--button-primary-bg, #3B82F6)",
              color: "var(--button-primary-text, #ffffff)",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0 1.25rem",
              height: "2.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            <LuPlus style="width:1rem;height:1rem;" /> New Command
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {displayedCommands.value.map((cmd) => {
            const primaryDomain = cmd.domainTags[0] || "shop";
            const dInfo = TOOL_DOMAIN_INFO[primaryDomain] || TOOL_DOMAIN_INFO.shop;
            const DomainIcon = dInfo.icon;
            const isBuiltin = cmd.isBuiltin;

            // Calculate estimated tokens for the command's required tools from live toolsCatalog
            const totalTokens = cmd.requiredTools.reduce((acc: number, tName: string) => {
              const found = toolsCatalog.value.find((t) => t.name === tName);
              return acc + (found ? found.tokens : 0);
            }, 0);

            return (
              <div
                key={cmd.id}
                class="command-card"
              >
                {/* Main Row: Header Info Left + Token & Actions Right */}
                <div class="command-card-main">
                  {/* Left: Icon, Name, Slash & Badges */}
                  <div class="command-card-left">
                    <div
                      style={{
                        width: "2.25rem",
                        height: "2.25rem",
                        borderRadius: "0.375rem",
                        background: dInfo.bg,
                        color: dInfo.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <DomainIcon style={{ width: "1.125rem", height: "1.125rem" }} />
                    </div>

                    <div class="command-card-content">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
                        <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {cmd.name}
                        </span>

                        {/* Slash Command Copy Button */}
                        <button
                          type="button"
                          onClick$={() => handleCopySlash(cmd.slash, cmd.id)}
                          title={`Click to copy ${cmd.slash}`}
                          class="command-slash-btn"
                        >
                          <span class="command-slash-text">{cmd.slash}</span>
                          {copiedId.value === cmd.id ? (
                            <LuCheck style={{ width: "0.75rem", height: "0.75rem", color: "#10B981" }} />
                          ) : (
                            <LuCopy style={{ width: "0.75rem", height: "0.75rem", opacity: 0.6 }} />
                          )}
                        </button>

                        {/* Status Badges */}
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            padding: "0.1rem 0.35rem",
                            borderRadius: "0.25rem",
                            background: isBuiltin ? "rgba(100,116,139,0.12)" : "rgba(16,185,129,0.12)",
                            color: isBuiltin ? "var(--text-secondary)" : "#10B981",
                            fontWeight: 500,
                          }}
                        >
                          {isBuiltin ? "Built-in" : "Custom"}
                        </span>

                        <span
                          style={{
                            fontSize: "0.6875rem",
                            padding: "0.1rem 0.35rem",
                            borderRadius: "0.25rem",
                            background: dInfo.bg,
                            color: dInfo.color,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        >
                          {primaryDomain}
                        </span>
                      </div>

                      {cmd.description && (
                        <p
                          title={cmd.description}
                          class="command-desc-line"
                        >
                          {cmd.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Token Footprint & Actions */}
                  <div class="command-card-right">
                    {totalTokens > 0 && (
                      <div
                        title={`Estimated token footprint: ~${totalTokens.toLocaleString()} tokens`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: "2rem",
                          padding: "0 0.5rem",
                          background: "var(--surface-1)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                          boxSizing: "border-box",
                          flexShrink: 0,
                        }}
                      >
                        ~{totalTokens.toLocaleString()} tok
                      </div>
                    )}

                    {!isBuiltin ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <button
                          type="button"
                          onClick$={() => openEdit(cmd)}
                          style={{
                            width: "2rem",
                            height: "2rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "var(--surface-1)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                          }}
                          title="Edit custom command"
                        >
                          <LuPencil style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                        <button
                          type="button"
                          onClick$={() => handleDelete(cmd.id, cmd.name)}
                          style={{
                            width: "2rem",
                            height: "2rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(239,68,68,0.06)",
                            border: "1px solid rgba(239,68,68,0.2)",
                            borderRadius: "0.375rem",
                            color: "var(--error, #ef4444)",
                            cursor: "pointer",
                          }}
                          title="Delete custom command"
                        >
                          <LuTrash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          color: "var(--text-tertiary)",
                          fontSize: "0.75rem",
                        }}
                        title="System protected built-in command"
                      >
                        <LuShieldCheck style={{ width: "1rem", height: "1rem" }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Scoped Tools List inside dashed divider */}
                <div class="command-card-tools">
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 500, flexShrink: 0 }}>
                    <LuWrench style={{ width: "0.75rem", height: "0.75rem" }} />
                    Tools:
                  </span>
                  {cmd.requiredTools.length === 0 ? (
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                      All tools in {primaryDomain} domain
                    </span>
                  ) : (
                    cmd.requiredTools.map((tName: string) => (
                      <span
                        key={tName}
                        style={{
                          fontSize: "0.6875rem",
                          fontFamily: "monospace",
                          padding: "0.08rem 0.38rem",
                          borderRadius: "0.25rem",
                          background: "var(--surface-1)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                          wordBreak: "break-all",
                        }}
                      >
                        {tName}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination / Load More */}
          {filteredCommands.value.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginTop: "1.25rem",
                padding: "0.5rem 0 1.5rem",
              }}
            >
              {filteredCommands.value.length > visibleLimit.value && (
                <button
                  type="button"
                  onClick$={() => {
                    visibleLimit.value += PAGE_SIZE;
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    padding: "0.5rem 1.25rem",
                    fontSize: "0.8125rem",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Load More ({Math.min(PAGE_SIZE, filteredCommands.value.length - visibleLimit.value)} of {filteredCommands.value.length - visibleLimit.value} remaining)
                </button>
              )}
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", opacity: 0.85 }}>
                Showing {Math.min(visibleLimit.value, filteredCommands.value.length)} of {filteredCommands.value.length} commands
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Agent Commands & Tool Scoping — BusinessKit",
  meta: [
    {
      name: "description",
      content: "Configure built-in and custom AI agent commands, slash triggers, and scoped tool permissions.",
    },
  ],
};
