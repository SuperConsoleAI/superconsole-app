// src/components/shop/BillShortcutsModal.tsx
//
// WHAT: Interactive Keyboard Shortcuts Cheatsheet Modal for Wholesale POS & Custom Billing.
//       Provides categorized reference for high-speed mouse-free operation across Mac, Windows, and Linux.

import {
  component$,
  useSignal,
  useComputed$,
  useVisibleTask$,
  useStylesScoped$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuX,
  LuSearch,
  LuKeyboard,
  LuSlidersHorizontal,
  LuShoppingCart,
  LuUserCheck,
  LuCheck,
} from "@qwikest/icons/lucide";

export interface ShortcutItem {
  key: string;
  macKey?: string;
  winKey?: string;
  label: string;
  description: string;
  category: "navigation" | "search" | "table" | "checkout";
}

export interface BillShortcutsModalProps {
  open: Signal<boolean>;
  onClose$?: PropFunction<() => void>;
}

const SHORTCUT_CATEGORIES = [
  { id: "navigation", name: "Navigation & Modal", icon: LuSlidersHorizontal },
  { id: "search", name: "Search & Catalog", icon: LuSearch },
  { id: "table", name: "Table Row & Cell Editing", icon: LuShoppingCart },
  { id: "checkout", name: "Customer & Checkout", icon: LuUserCheck },
];

const ALL_SHORTCUTS: ShortcutItem[] = [
  // Navigation & Modal
  {
    key: "F2",
    macKey: "F2 / ⌘+B / ⌥+C",
    winKey: "F2 / Ctrl+B / Alt+C",
    label: "Open Custom Bill",
    description: "Launch wholesale custom billing modal from billing dashboard",
    category: "navigation",
  },
  {
    key: "F1",
    macKey: "F1 / ⌘+N / ⌥+N",
    winKey: "F1 / Ctrl+N / Alt+N",
    label: "Open Standard POS Bill",
    description: "Launch fast cash counter POS billing modal",
    category: "navigation",
  },
  {
    key: "F4",
    macKey: "F4 / ⌥+T",
    winKey: "F4 / Alt+T",
    label: "Toggle Search ⟷ Table",
    description: "Switch active cursor focus between product search and billing table",
    category: "navigation",
  },
  {
    key: "Esc",
    macKey: "Esc",
    winKey: "Esc",
    label: "Close / Clear / Back",
    description: "Clear search query, close sub-popovers, or exit custom bill",
    category: "navigation",
  },

  // Search & Catalog
  {
    key: "F3",
    macKey: "F3 / / / ⌘+K",
    winKey: "F3 / / / Ctrl+K",
    label: "Focus Search Bar",
    description: "Jump straight to product search bar and highlight search text",
    category: "search",
  },
  {
    key: "Enter",
    macKey: "Enter (Return)",
    winKey: "Enter",
    label: "Add Top / Scanned Match",
    description: "Add top search result or scanned barcode directly to running bill",
    category: "search",
  },
  {
    key: "↓ ↑ ← →",
    macKey: "Arrow Keys",
    winKey: "Arrow Keys",
    label: "Navigate Catalog Cards",
    description: "Browse matching catalog cards in the grid with highlight border",
    category: "search",
  },
  {
    key: "↓ ↑ + Enter",
    macKey: "↓ ↑ + Return",
    winKey: "↓ ↑ + Enter",
    label: "Pick Stock Batch",
    description: "Navigate and choose stock batch when multiple batches exist",
    category: "search",
  },

  // Table Row & Cell Editing
  {
    key: "Tab / Enter",
    macKey: "Tab / Return",
    winKey: "Tab / Enter",
    label: "Next Table Cell",
    description: "Step horizontally: Qty ➔ Free Qty ➔ Rate (₹) ➔ Disc 1 % ➔ Dis 2 %",
    category: "table",
  },
  {
    key: "Shift+Tab",
    macKey: "⇧ + Tab",
    winKey: "Shift + Tab",
    label: "Previous Table Cell",
    description: "Step backwards to previous input in row with text pre-selected",
    category: "table",
  },
  {
    key: "↑ / ↓",
    macKey: "Arrow Up / Down",
    winKey: "Arrow Up / Down",
    label: "Navigate Rows Vertically",
    description: "Jump to corresponding column in row above or below",
    category: "table",
  },
  {
    key: "Enter (on Dis 2%)",
    macKey: "Return (on Dis 2%)",
    winKey: "Enter (on Dis 2%)",
    label: "Return to Search",
    description: "Pressing Enter on last row field loops cursor straight to Search Bar",
    category: "table",
  },
  {
    key: "Delete",
    macKey: "⌥+⌫ / ⌘+⌫",
    winKey: "Delete / Alt+⌫",
    label: "Remove Item Line",
    description: "Delete current line item from table and refocus adjacent row",
    category: "table",
  },

  // Customer & Checkout
  {
    key: "F6",
    macKey: "F6 / ⌥+K / ⌘+U",
    winKey: "F6 / Alt+K / Ctrl+U",
    label: "Customer Lookup (Mouse-Free)",
    description: "Open customer search with auto-focus; use ↓ ↑ to browse and Enter to select",
    category: "checkout",
  },
  {
    key: "F9",
    macKey: "F9 / ⌘+Enter",
    winKey: "F9 / Ctrl+Enter",
    label: "Instant Mark as Paid",
    description: "Complete checkout, record payment, and generate final invoice",
    category: "checkout",
  },
  {
    key: "F8",
    macKey: "F8 / ⌥+U",
    winKey: "F8 / Alt+U",
    label: "Save as Unpaid / Credit",
    description: "Generate invoice on credit terms without recording full payment",
    category: "checkout",
  },
  {
    key: "F7",
    macKey: "F7 / ⌥+D",
    winKey: "F7 / Alt+D",
    label: "Save as Draft",
    description: "Save invoice draft to finish or edit later",
    category: "checkout",
  },
];

const STYLES = `
  .bsm-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(3px);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
    animation: bsmFadeIn 120ms ease-out;
  }
  @keyframes bsmFadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }
  .bsm-dialog {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    width: 100%;
    max-width: 680px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  }
  .bsm-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-shrink: 0;
  }
  .bsm-body {
    padding: 1rem 1.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    flex: 1;
    min-height: 0;
  }
  .bsm-search-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--field-fill);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0 0.75rem;
    height: 2.25rem;
    flex-shrink: 0;
  }
  .bsm-search-input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 0.8125rem;
    width: 100%;
  }
  .bsm-category-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  .bsm-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
  .bsm-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    gap: 1rem;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .bsm-row:hover {
    background: var(--surface-3);
    border-color: var(--accent, #3b82f6);
  }
  .bsm-key-badge {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text-primary);
    white-space: nowrap;
    line-height: 1;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    flex-shrink: 0;
  }
  .bsm-mac-badge {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 0.25rem;
    background: rgba(59,130,246,0.08);
    border: 1px solid rgba(59,130,246,0.25);
    color: #3b82f6;
    white-space: nowrap;
    line-height: 1;
    flex-shrink: 0;
  }
`;

export const BillShortcutsModal = component$<BillShortcutsModalProps>((props) => {
  useStylesScoped$(STYLES);

  const filterQuery = useSignal("");

  const filteredShortcuts = useComputed$(() => {
    const q = filterQuery.value.trim().toLowerCase();
    if (!q) return ALL_SHORTCUTS;
    return ALL_SHORTCUTS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        (s.macKey && s.macKey.toLowerCase().includes(q)) ||
        (s.winKey && s.winKey.toLowerCase().includes(q))
    );
  });

  // Focus search inside modal on open
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const isOpen = track(() => props.open.value);
    if (isOpen) {
      filterQuery.value = "";
      setTimeout(() => {
        const input = document.getElementById("bsm-filter-input") as HTMLInputElement;
        input?.focus();
      }, 50);
    }
  });

  const handleClose = $(() => {
    props.open.value = false;
    if (props.onClose$) props.onClose$();
  });

  if (!props.open.value) return null;

  return (
    <div class="bsm-backdrop" onClick$={handleClose}>
      <div class="bsm-dialog" onClick$={$((e: Event) => e.stopPropagation())}>
        {/* Modal Header */}
        <div class="bsm-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "0.375rem",
                background: "rgba(59,130,246,0.12)",
                border: "1px solid rgba(59,130,246,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#3b82f6",
              }}
            >
              <LuKeyboard style="width:1.125rem;height:1.125rem;" />
            </div>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: "700", color: "var(--text-primary)" }}>
                Keyboard Shortcuts Cheatsheet
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                High-speed mouse-free wholesale & POS billing (Mac + Windows + Linux)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick$={handleClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "0.25rem",
              borderRadius: "0.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Close [Esc]"
          >
            <LuX style="width:1.125rem;height:1.125rem;" />
          </button>
        </div>

        {/* Search filter */}
        <div style={{ padding: "0.75rem 1.25rem 0", background: "var(--surface-2)" }}>
          <div class="bsm-search-wrap">
            <LuSearch style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
            <input
              id="bsm-filter-input"
              type="text"
              class="bsm-search-input"
              placeholder="Filter shortcuts by key or action…"
              value={filterQuery.value}
              onInput$={(e) => {
                filterQuery.value = (e.target as HTMLInputElement).value;
              }}
            />
            {filterQuery.value && (
              <button
                type="button"
                onClick$={$(() => { filterQuery.value = ""; })}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts List */}
        <div class="bsm-body">
          {filteredShortcuts.value.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              No shortcuts matching "{filterQuery.value}"
            </div>
          ) : (
            SHORTCUT_CATEGORIES.map((cat) => {
              const catShortcuts = filteredShortcuts.value.filter((s) => s.category === cat.id);
              if (catShortcuts.length === 0) return null;
              const IconComp = cat.icon;
              return (
                <div key={cat.id}>
                  <div class="bsm-category-title">
                    <IconComp style="width:0.875rem;height:0.875rem;" />
                    <span>{cat.name}</span>
                  </div>
                  <div class="bsm-grid">
                    {catShortcuts.map((item) => (
                      <div key={item.label} class="bsm-row">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)" }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                            {item.description}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                          <span class="bsm-key-badge">{item.key}</span>
                          {item.macKey && item.macKey !== item.key && (
                            <span class="bsm-mac-badge" title="Mac shortcut">{item.macKey}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Tip: Press <kbd style={{ fontFamily: "monospace", padding: "0.1rem 0.3rem", borderRadius: "0.2rem", background: "var(--surface-3)", border: "1px solid var(--border)" }}>?</kbd> or <kbd style={{ fontFamily: "monospace", padding: "0.1rem 0.3rem", borderRadius: "0.2rem", background: "var(--surface-3)", border: "1px solid var(--border)" }}>F1</kbd> anywhere to open this cheatsheet.
          </div>
          <button
            type="button"
            onClick$={handleClose}
            style={{
              padding: "0.35rem 0.875rem",
              borderRadius: "0.375rem",
              background: "var(--button-primary-bg, #3b82f6)",
              color: "var(--button-primary-text, #ffffff)",
              border: "none",
              fontSize: "0.75rem",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            <LuCheck style="width:0.75rem;height:0.75rem;" />
            Got it
          </button>
        </div>
      </div>
    </div>
  );
});
