// src/routes/dashboard/shop/units/index.tsx
//
// Shop › Units of Measurement page
// Lists shop_units grouped by unit type (Count, Weight, Volume, Length, Area, Time, Service).
// Add / Edit opens an inline SlideOver panel.
//
// IPC: shop_list_units, shop_create_unit, shop_update_unit, shop_delete_unit, shop_seed_units

import {
  component$, useSignal, useVisibleTask$, $, useComputed$,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus, LuPencil, LuTrash2, LuScale, LuLoader, LuRefreshCw, LuSearch } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";

export interface ShopUnit {
  id: string;
  profile_id: string;
  name: string;
  symbol: string;
  unit_type: string;
  is_decimal: number;
  is_default?: number;
  is_active: number;
}

const UNIT_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  count:   { label: "Count & Quantity", color: "#3B82F6", icon: "🔢" },
  weight:  { label: "Weight & Mass",   color: "#10B981", icon: "⚖️" },
  volume:  { label: "Volume & Liquids",color: "#06B6D4", icon: "🧪" },
  length:  { label: "Length & Distance",color: "#8B5CF6", icon: "📏" },
  area:    { label: "Area & Surface",  color: "#F59E0B", icon: "📐" },
  time:    { label: "Time & Duration", color: "#EC4899", icon: "⏱️" },
  service: { label: "Services & Sessions", color: "#F97316", icon: "🏷️" },
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

const inputStyle = {
  width: "100%",
  height: "2.375rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

export default component$(() => {
  const units     = useSignal<ShopUnit[]>([]);
  const loading   = useSignal(true);
  const panelOpen = useSignal(false);
  const editing   = useSignal<ShopUnit | null>(null);
  const saving    = useSignal(false);
  const seeding   = useSignal(false);
  const error     = useSignal<string | null>(null);
  const search    = useSignal("");
  const activeTab = useSignal<string>("all");

  // Form fields
  const fName       = useSignal("");
  const fSymbol     = useSignal("");
  const fUnitType   = useSignal("count");
  const fIsDecimal  = useSignal(false);
  const fIsDefault  = useSignal(false);

  const fetchUnits = $(async () => {
    try {
      units.value = await invoke<ShopUnit[]>("shop_list_units", {});
    } catch (e) {
      console.error("[units] Failed to load units:", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchUnits();
  });

  const openAdd = $(() => {
    editing.value = null;
    fName.value = "";
    fSymbol.value = "";
    fUnitType.value = activeTab.value !== "all" ? activeTab.value : "count";
    fIsDecimal.value = fUnitType.value === "weight" || fUnitType.value === "volume" || fUnitType.value === "length";
    fIsDefault.value = false;
    error.value = null;
    panelOpen.value = true;
  });

  const openEdit = $((unit: ShopUnit) => {
    editing.value = unit;
    fName.value = unit.name;
    fSymbol.value = unit.symbol;
    fUnitType.value = unit.unit_type;
    fIsDecimal.value = unit.is_decimal === 1;
    fIsDefault.value = (unit.is_default ?? 0) === 1;
    error.value = null;
    panelOpen.value = true;
  });

  const handleSave = $(async () => {
    if (!fName.value.trim()) { error.value = "Unit name is required"; return; }
    if (!fSymbol.value.trim()) { error.value = "Symbol is required"; return; }
    saving.value = true;
    error.value = null;
    try {
      const data = {
        name: fName.value.trim(),
        symbol: fSymbol.value.trim(),
        unit_type: fUnitType.value,
        is_decimal: fIsDecimal.value ? 1 : 0,
        is_default: fIsDefault.value ? 1 : 0,
      };

      if (editing.value) {
        const updated = await invoke<ShopUnit>("shop_update_unit", {
          unitId: editing.value.id,
          data,
        });
        if (fIsDefault.value) {
          units.value = units.value.map(u => u.id === updated.id ? updated : { ...u, is_default: 0 });
        } else {
          units.value = units.value.map(u => u.id === updated.id ? updated : u);
        }
      } else {
        const created = await invoke<ShopUnit>("shop_create_unit", { data });
        if (fIsDefault.value) {
          units.value = [...units.value.map(u => ({ ...u, is_default: 0 })), created];
        } else {
          units.value = [...units.value, created];
        }
      }
      panelOpen.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const handleDelete = $(async (id: string) => {
    if (!window.confirm("Delete this unit of measurement? Existing products referencing this unit will remain intact.")) return;
    try {
      await invoke("shop_delete_unit", { unitId: id });
      units.value = units.value.filter(u => u.id !== id);
    } catch (e) {
      alert(String(e));
    }
  });

  const handleSeedDefaults = $(async () => {
    if (!window.confirm("Seed standard standard measurement units (Piece, kg, Litre, Hour, etc.)?")) return;
    seeding.value = true;
    try {
      units.value = await invoke<ShopUnit[]>("shop_seed_units", {});
    } catch (e) {
      alert(String(e));
    } finally {
      seeding.value = false;
    }
  });

  const filteredUnits = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    const tab = activeTab.value;
    return units.value.filter(u => {
      const matchTab = tab === "all" || u.unit_type === tab;
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.symbol.toLowerCase().includes(q) || u.unit_type.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  });

  // Group filtered units by unit_type
  const groupedUnits = useComputed$(() => {
    const map = new Map<string, ShopUnit[]>();
    for (const u of filteredUnits.value) {
      const list = map.get(u.unit_type) || [];
      list.push(u);
      map.set(u.unit_type, list);
    }
    return map;
  });

  return (
    <>
      <SlideOver
        open={panelOpen}
        title={editing.value ? "Edit Unit" : "New Unit of Measurement"}
        subtitle="Define how quantity is counted or measured across inventory & billing."
        width="420px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          <div>
            <label style={labelStyle}>Unit Name *</label>
            <input
              type="text"
              placeholder="e.g. Kilogram, Piece, Hour"
              value={fName.value}
              onInput$={(e) => { fName.value = (e.target as HTMLInputElement).value; }}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Symbol / Abbreviation *</label>
            <input
              type="text"
              placeholder="e.g. kg, pcs, hr"
              value={fSymbol.value}
              onInput$={(e) => { fSymbol.value = (e.target as HTMLInputElement).value; }}
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.875rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Measurement Type</label>
            <select
              value={fUnitType.value}
              onChange$={(e) => {
                fUnitType.value = (e.target as HTMLSelectElement).value;
                if (fUnitType.value === "weight" || fUnitType.value === "volume" || fUnitType.value === "length") {
                  fIsDecimal.value = true;
                }
              }}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none", backgroundImage: SELECT_ARROW, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", paddingRight: "2.25rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <option value="count">Count & Quantity (pcs, box, dozen)</option>
              <option value="weight">Weight & Mass (kg, g, ton, lb)</option>
              <option value="volume">Volume & Liquids (L, mL, gal)</option>
              <option value="length">Length & Distance (m, cm, ft, in)</option>
              <option value="area">Area & Surface (sq.m, sq.ft)</option>
              <option value="time">Time & Duration (hr, day, night)</option>
              <option value="service">Services & Sessions (session, visit)</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
            <input
              type="checkbox"
              id="unit-decimal-toggle"
              checked={fIsDecimal.value}
              onChange$={(e) => { fIsDecimal.value = (e.target as HTMLInputElement).checked; }}
              style={{ width: "1.125rem", height: "1.125rem", cursor: "pointer", accentColor: "var(--accent)" }}
            />
            <label for="unit-decimal-toggle" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontWeight: "600", display: "block" }}>Allow Decimal Quantities</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Allows fractions e.g. 2.5 kg or 1.5 hr. Untick for whole numbers (e.g. 1 Piece).</span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
            <input
              type="checkbox"
              id="unit-default-toggle"
              checked={fIsDefault.value}
              onChange$={(e) => { fIsDefault.value = (e.target as HTMLInputElement).checked; }}
              style={{ width: "1.125rem", height: "1.125rem", cursor: "pointer", accentColor: "var(--accent)" }}
            />
            <label for="unit-default-toggle" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontWeight: "600", display: "block" }}>Default Unit of Measurement</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Used as the default measurement unit for newly created items (e.g. Piece).</span>
            </label>
          </div>

          {/* Sticky footer */}
          <div style={{ position: "sticky", bottom: "-1.5rem", margin: "0.5rem -1.5rem -1.5rem", padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              disabled={saving.value}
              onClick$={handleSave}
              style={{
                flex: 1, height: "2.375rem",
                background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
                border: "none", borderRadius: "0.375rem",
                fontSize: "0.9rem", fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              }}
            >
              {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving…</> : "Save Unit"}
            </button>
            <button
              type="button"
              onClick$={() => { panelOpen.value = false; }}
              style={{ height: "2.375rem", padding: "0 1.25rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-secondary)", fontSize: "0.9rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Page Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: "600", color: "var(--text-primary)", margin: 0 }}>Units of Measurement</h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>Manage measurement units for inventory stock, billing, and pricing.</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            disabled={seeding.value}
            onClick$={handleSeedDefaults}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              background: "var(--surface-2)", color: "var(--text-secondary)",
              border: "1px solid var(--border)", borderRadius: "0.375rem",
              padding: "0 0.875rem", height: "2.25rem", fontSize: "0.8125rem", fontWeight: "500", cursor: "pointer",
            }}
            title="Seed standard units (Piece, kg, Litre, Hour, etc.)"
          >
            <LuRefreshCw style={`width:0.875rem;height:0.875rem; ${seeding.value ? 'animation: spin 1s linear infinite;' : ''}`} />
            Seed Presets
          </button>

          <button
            type="button"
            onClick$={openAdd}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
              border: "none", borderRadius: "0.375rem",
              padding: "0 1rem", height: "2.25rem", fontSize: "0.875rem", fontWeight: "500", cursor: "pointer",
            }}
          >
            <LuPlus style="width:1rem;height:1rem;" /> New Unit
          </button>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {/* Category Tabs */}
        <div style={{ display: "flex", gap: "0.375rem", overflowX: "auto", paddingBottom: "2px", background: "var(--surface-3)", padding: "0.25rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick$={() => { activeTab.value = "all"; }}
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
            All ({units.value.length})
          </button>
          {Object.entries(UNIT_TYPE_LABELS).map(([key, info]) => {
            const count = units.value.filter(u => u.unit_type === key).length;
            if (count === 0 && activeTab.value !== key) return null;
            return (
              <button
                key={key}
                type="button"
                onClick$={() => { activeTab.value = key; }}
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
                }}
              >
                {info.icon} {info.label.split(" ")[0]} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ position: "relative", minWidth: "180px", maxWidth: "260px", flex: 1 }}>
          <LuSearch style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
          <input
            type="text"
            placeholder="Search units…"
            value={search.value}
            onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
            style={{
              ...inputStyle,
              height: "2.125rem",
              paddingLeft: "2rem",
              fontSize: "0.8125rem",
              background: "var(--surface-2)",
            }}
          />
        </div>
      </div>

      {/* ── Content View ──────────────────────────────────────────────────────── */}
      {loading.value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: "3.25rem", background: "var(--surface-2)", borderRadius: "0.5rem", animation: "pulse 2s infinite", animationDelay: `${(i - 1) * 150}ms` }} />
          ))}
        </div>
      ) : units.value.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", textAlign: "center", gap: "1rem", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px solid var(--border)" }}>
          <div style={{ width: "3.5rem", height: "3.5rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
            <LuScale style="width:1.75rem;height:1.75rem;" />
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-primary)" }}>No units configured yet</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Seed standard measurement units (Piece, kg, Litre, Hour, etc.) to get started.</div>
          </div>
          <button
            type="button"
            onClick$={handleSeedDefaults}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
              border: "none", borderRadius: "0.375rem",
              padding: "0 1.25rem", height: "2.375rem", fontSize: "0.875rem", fontWeight: "600", cursor: "pointer",
            }}
          >
            <LuRefreshCw style="width:1rem;height:1rem;" /> Seed Standard Presets
          </button>
        </div>
      ) : filteredUnits.value.length === 0 ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.875rem", background: "var(--surface-2)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
          No units match "{search.value}" in this filter.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {Array.from(groupedUnits.value.entries()).map(([typeKey, typeUnits]) => {
            const typeInfo = UNIT_TYPE_LABELS[typeKey] || { label: typeKey, color: "#888", icon: "📦" };
            return (
              <div key={typeKey} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", overflow: "hidden" }}>
                {/* Group Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 1rem", background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.9375rem" }}>{typeInfo.icon}</span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", letterSpacing: "0.02em" }}>{typeInfo.label}</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>{typeUnits.length} {typeUnits.length === 1 ? "unit" : "units"}</span>
                </div>

                {/* Unit items */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1px", background: "var(--border)" }}>
                  {typeUnits.map(unit => (
                    <div
                      key={unit.id}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "0.75rem 1rem", background: "var(--surface-2)",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                        <span style={{
                          padding: "0.2rem 0.5rem", background: "var(--surface-3)",
                          border: "1px solid var(--border)", borderRadius: "0.25rem",
                          fontFamily: "monospace", fontSize: "0.75rem", fontWeight: "700",
                          color: "var(--text-primary)", flexShrink: 0,
                        }}>
                          {unit.symbol}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {unit.name}
                            </div>
                            {unit.is_default === 1 && (
                              <span style={{ fontSize: "0.6875rem", fontWeight: "600", padding: "0.125rem 0.4rem", borderRadius: "0.25rem", background: "var(--accent-soft, rgba(59,130,246,0.12))", color: "var(--accent, #3b82f6)" }}>
                                Default
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                            {unit.is_decimal ? "Decimal fraction (2.5)" : "Whole number only"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick$={$(() => openEdit(unit))}
                          title="Edit unit"
                          style={{ padding: "0.3rem 0.45rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--text-secondary)" }}
                        >
                          <LuPencil style="width:0.8125rem;height:0.8125rem;" />
                        </button>
                        <button
                          type="button"
                          onClick$={$(() => handleDelete(unit.id))}
                          title="Delete unit"
                          style={{ padding: "0.3rem 0.45rem", background: "transparent", border: "1px solid transparent", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--error)" }}
                        >
                          <LuTrash2 style="width:0.8125rem;height:0.8125rem;" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});

export const head: DocumentHead = { title: "Units of Measurement — Shop" };
