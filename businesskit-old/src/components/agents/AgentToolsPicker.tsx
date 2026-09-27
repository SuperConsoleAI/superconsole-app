// src/components/agents/AgentToolsPicker.tsx
//
// Reusable Tool Picker & Catalog Viewer component for AI agent tools.
// Used in:
//   1. AddCommand.tsx (SlideOver tool multi-select with live token budget meter)
//   2. /dashboard/agents/tools/ (Full tools catalog and schema inspector)

import {
  component$,
  useSignal,
  useComputed$,
  $,
  useStylesScoped$,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuPackage,
  LuUsers,
  LuFileText,
  LuCpu,
  LuLaptop,
  LuZap,
  LuSearch,
  LuChevronDown,
  LuChevronUp,
  LuCode,
} from "@qwikest/icons/lucide";

export interface ToolCatalogItem {
  name: string;
  label: string;
  domain: "shop" | "crm" | "content" | "system" | "pages";
  description: string;
  tokens: number;
  inputSchema?: any;
}

export const DEFAULT_CATALOG_TOOLS: ToolCatalogItem[] = [
  // Shop tools
  {
    name: "inventory_receive_purchase_invoice",
    label: "Receive Stock from Invoice",
    domain: "shop",
    description: "Parse vendor invoice PDF/bill and auto-restock inventory into shop",
    tokens: 185,
  },
  {
    name: "product_update_pricing",
    label: "Update Product Pricing",
    domain: "shop",
    description: "Update selling price, cost price, and default margins for products",
    tokens: 95,
  },
  {
    name: "inventory_add_stock",
    label: "Adjust Stock Quantity",
    domain: "shop",
    description: "Record inventory adjustments, damages, audits, and manual restocks",
    tokens: 90,
  },
  {
    name: "inventory_get_levels",
    label: "Check Inventory Levels",
    domain: "shop",
    description: "Query current stock quantities, batches, and reorder levels",
    tokens: 82,
  },
  {
    name: "invoice_create",
    label: "Create Customer Invoice",
    domain: "shop",
    description: "Draft customer invoices, POS receipts, and wholesale bills",
    tokens: 110,
  },
  {
    name: "invoice_send",
    label: "Send Customer Invoice",
    domain: "shop",
    description: "Dispatch finalized invoice to client via email or download link",
    tokens: 86,
  },
  // CRM tools
  {
    name: "contact_create",
    label: "Create CRM Contact",
    domain: "crm",
    description: "Add new leads, clients, vendors, and business contacts",
    tokens: 84,
  },
  {
    name: "contact_update",
    label: "Update CRM Contact",
    domain: "crm",
    description: "Update client details, phone, tags, and lifecycle stages",
    tokens: 87,
  },
  // Content tools
  {
    name: "blog_post_create",
    label: "Draft Blog Post",
    domain: "content",
    description: "Draft markdown blog posts, articles, and CMS documentation",
    tokens: 92,
  },
  // Pages tools
  {
    name: "page_create",
    label: "Create Website Page",
    domain: "pages",
    description: "Draft or create a new landing page or website page with title and slug",
    tokens: 88,
  },
  {
    name: "page_publish",
    label: "Publish Website Page",
    domain: "pages",
    description: "Toggle published or draft status for a website page",
    tokens: 72,
  },
  {
    name: "page_list",
    label: "List Website Pages",
    domain: "pages",
    description: "List all website pages, URLs, slugs, and publication statuses",
    tokens: 76,
  },
  // System tools
  {
    name: "system_get_capabilities",
    label: "Platform Capabilities",
    domain: "system",
    description: "Query and inspect active BusinessKit platform capabilities",
    tokens: 75,
  },
];

export const TOOL_DOMAIN_INFO: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  shop:    { label: "Shop & Stock", color: "#3B82F6", bg: "rgba(59,130,246,0.1)", icon: LuPackage },
  crm:     { label: "CRM & Leads", color: "#10B981", bg: "rgba(16,185,129,0.1)", icon: LuUsers },
  content: { label: "Content & CMS", color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", icon: LuFileText },
  pages:   { label: "Website & Pages", color: "#0EA5E9", bg: "rgba(14,165,233,0.1)", icon: LuLaptop },
  system:  { label: "System", color: "#64748B", bg: "rgba(100,116,139,0.1)", icon: LuCpu },
};

export interface AgentToolsPickerProps {
  tools?: ToolCatalogItem[];
  selectedTools?: Signal<string[]>;
  domainContext?: "shop" | "crm" | "content" | "system";
  mode?: "picker" | "viewer";
  onSelectionChange$?: PropFunction<(tools: string[]) => void>;
}

export const AgentToolsPicker = component$<AgentToolsPickerProps>(({
  mode = "picker",
  selectedTools,
  tools,
  domainContext = "shop",
  onSelectionChange$,
}) => {
  useStylesScoped$(`
    .tool-search-bar {
      position: relative;
      width: 100%;
      max-width: 320px;
    }
    .tool-viewer-card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.875rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .tool-viewer-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .tool-viewer-card-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 1;
      min-width: 0;
      max-width: 100%;
    }
    .tool-viewer-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      max-width: 100%;
      flex: 1;
      overflow: hidden;
    }
    .tool-command-chip {
      font-size: 0.75rem;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: 0.25rem;
      padding: 0.1rem 0.4rem;
      color: var(--text-secondary);
      font-family: monospace;
      box-sizing: border-box;
    }
    .tool-desc-line {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .tool-desc-line.collapsed {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .tool-desc-line.expanded {
      white-space: normal;
      overflow: visible;
      display: block;
    }
    .tool-viewer-card-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    @media (max-width: 640px) {
      .tool-search-bar {
        max-width: 100% !important;
      }
      .tool-viewer-card {
        padding: 0.75rem !important;
        max-width: 100% !important;
        overflow: hidden !important;
      }
      .tool-viewer-card-top {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.625rem !important;
      }
      .tool-viewer-card-left {
        align-items: flex-start !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .tool-viewer-card-body {
        width: 100% !important;
        max-width: 100% !important;
      }
      .tool-command-chip.chip-collapsed {
        display: none !important;
      }
      .tool-command-chip.chip-expanded {
        display: inline-block !important;
        max-width: 100% !important;
        word-break: break-all !important;
        overflow-wrap: anywhere !important;
        margin-top: 0.125rem !important;
      }
      .tool-desc-line.collapsed {
        display: -webkit-box !important;
        -webkit-line-clamp: 1 !important;
        -webkit-box-orient: vertical !important;
        white-space: normal !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 100% !important;
      }
      .tool-desc-line.expanded {
        display: block !important;
        white-space: normal !important;
        overflow: visible !important;
        max-width: 100% !important;
      }
      .tool-viewer-card-actions {
        width: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-top: 0 !important;
        border-top: none !important;
      }
    }
  `);

  const catalog = tools && tools.length > 0 ? tools : DEFAULT_CATALOG_TOOLS;
  const searchQuery = useSignal("");
  const expandedSchemaTool = useSignal<string | null>(null);

  const toggleTool = $((toolName: string) => {
    if (!selectedTools) return;
    let next: string[];
    if (selectedTools.value.includes(toolName)) {
      next = selectedTools.value.filter((t) => t !== toolName);
    } else {
      next = [...selectedTools.value, toolName];
    }
    selectedTools.value = next;
    if (onSelectionChange$) {
      onSelectionChange$(next);
    }
  });

  const selectDomainTools = $(() => {
    if (!selectedTools) return;
    const domainTools = catalog.filter((t) => t.domain === domainContext).map((t) => t.name);
    const combined = Array.from(new Set([...selectedTools.value, ...domainTools]));
    selectedTools.value = combined;
    if (onSelectionChange$) {
      onSelectionChange$(combined);
    }
  });

  const clearAll = $(() => {
    if (!selectedTools) return;
    selectedTools.value = [];
    if (onSelectionChange$) {
      onSelectionChange$([]);
    }
  });

  const estimatedTokens = useComputed$(() => {
    if (!selectedTools) return 0;
    return selectedTools.value.reduce((acc, name) => {
      const found = catalog.find((t) => t.name === name);
      return acc + (found ? found.tokens : 0);
    }, 0);
  });

  const filteredTools = useComputed$(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return catalog;
    return catalog.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        t.domain.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  });

  // ── PICKER MODE (Used inside AddCommand slideover) ──
  if (mode === "picker") {
    const isNoneSelected = !selectedTools || selectedTools.value.length === 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {/* Header with Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", margin: 0 }}>
            Scoped Required Tools
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
            <button
              type="button"
              onClick$={selectDomainTools}
              style={{ background: "none", border: "none", color: "var(--accent, #3b82f6)", cursor: "pointer", padding: 0, fontWeight: 500 }}
            >
              Select Domain Tools
            </button>
            <span style={{ color: "var(--border)" }}>•</span>
            <button
              type="button"
              onClick$={clearAll}
              style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 0 }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Token Budget Meter */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.5rem 0.75rem",
            background: "var(--surface-3)",
            borderRadius: "0.375rem",
            fontSize: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <LuZap style={{ width: "0.875rem", height: "0.875rem", color: "#F59E0B" }} />
            Payload Budget:
          </span>
          <span style={{ fontWeight: 600, color: isNoneSelected ? "var(--text-secondary)" : "var(--text-primary)" }}>
            {isNoneSelected
              ? "All tools in domain (default)"
              : `~${estimatedTokens.value.toLocaleString()} tokens (${selectedTools!.value.length} tool${selectedTools!.value.length > 1 ? "s" : ""})`}
          </span>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.125rem 0 0.25rem", lineHeight: 1.35 }}>
          {isNoneSelected
            ? "By default no specific tool is selected. All tools in the chosen domain will be available."
            : "Only checked tool schemas will be injected when this command runs, saving token context."}
        </p>

        {/* Checkbox List */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            maxHeight: "260px",
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            padding: "0.375rem",
            background: "var(--surface-1)",
          }}
        >
          {catalog.map((tool) => {
            const isSelected = selectedTools ? selectedTools.value.includes(tool.name) : false;
            const dInfo = TOOL_DOMAIN_INFO[tool.domain] || TOOL_DOMAIN_INFO.shop;

            return (
              <div
                key={tool.name}
                onClick$={() => toggleTool(tool.name)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.625rem",
                  padding: "0.5rem",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  background: isSelected ? "var(--surface-2)" : "transparent",
                  border: isSelected ? "1px solid var(--border)" : "1px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  style={{ marginTop: "0.2rem", cursor: "pointer", accentColor: "var(--accent, #3B82F6)" }}
                  onClick$={(e) => e.stopPropagation()}
                  onChange$={() => toggleTool(tool.name)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {tool.label}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "0.25rem",
                          background: dInfo.bg,
                          color: dInfo.color,
                          fontWeight: 500,
                          textTransform: "uppercase",
                        }}
                      >
                        {tool.domain}
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        ~{tool.tokens} tok
                      </span>
                    </div>
                  </div>
                  <div
                    title={tool.description}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      marginTop: "0.125rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {tool.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── VIEWER MODE (Used on /dashboard/agents/tools/) ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Search toolbar */}
      <div class="tool-search-bar">
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
          placeholder="Filter tools by name, domain, description…"
          value={searchQuery.value}
          onInput$={(e) => {
            searchQuery.value = (e.target as HTMLInputElement).value;
          }}
          style={{
            width: "100%",
            height: "2.125rem",
            padding: "0 0.75rem 0 2rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            color: "var(--text-primary)",
            fontSize: "0.8125rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Tools Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", width: "100%", maxWidth: "100%", minWidth: 0 }}>
        {filteredTools.value.map((tool) => {
          const dInfo = TOOL_DOMAIN_INFO[tool.domain] || TOOL_DOMAIN_INFO.shop;
          const DomainIcon = dInfo.icon;
          const isExpanded = expandedSchemaTool.value === tool.name;

          return (
            <div
              key={tool.name}
              class="tool-viewer-card"
            >
              <div class="tool-viewer-card-top">
                <div class="tool-viewer-card-left" style={{ alignItems: isExpanded ? "flex-start" : "center" }}>
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

                  <div class="tool-viewer-card-body">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
                      <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" }}>
                        {tool.label}
                      </span>
                      <code class={`tool-command-chip ${isExpanded ? "chip-expanded" : "chip-collapsed"}`}>
                        {tool.name}
                      </code>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "0.25rem",
                          background: dInfo.bg,
                          color: dInfo.color,
                          fontWeight: 500,
                          textTransform: "capitalize",
                          flexShrink: 0,
                        }}
                      >
                        {tool.domain}
                      </span>
                    </div>

                    <p
                      title={tool.description}
                      class={`tool-desc-line ${isExpanded ? "expanded" : "collapsed"}`}
                    >
                      {tool.description}
                    </p>
                  </div>
                </div>

                <div class="tool-viewer-card-actions">
                  <div
                    title={`Schema cost: ~${tool.tokens.toLocaleString()} tokens`}
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
                    ~{tool.tokens.toLocaleString()} tok
                  </div>

                  <button
                    type="button"
                    onClick$={() => {
                      expandedSchemaTool.value = isExpanded ? null : tool.name;
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0 0.625rem",
                      height: "2rem",
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      boxSizing: "border-box",
                      flexShrink: 0,
                    }}
                  >
                    <LuCode style={{ width: "0.875rem", height: "0.875rem" }} />
                    <span>Schema</span>
                    {isExpanded ? (
                      <LuChevronUp style={{ width: "0.75rem", height: "0.75rem" }} />
                    ) : (
                      <LuChevronDown style={{ width: "0.75rem", height: "0.75rem" }} />
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Schema Preview */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.75rem",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    overflowX: "auto",
                    color: "var(--text-primary)",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: "var(--text-secondary)" }}>
                    Function Signature ({tool.name}):
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      overflowWrap: "anywhere",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    {JSON.stringify(
                      {
                        name: tool.name,
                        description: tool.description,
                        domain: tool.domain,
                        estimatedTokens: tool.tokens,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
