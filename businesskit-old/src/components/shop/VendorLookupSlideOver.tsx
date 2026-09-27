// src/components/shop/VendorLookupSlideOver.tsx
//
// WHAT: Vendor search + quick-add panel used inside ReceiveStockSlideOver.
//       Opens as a second layer slide-over. User can:
//         1. Search existing vendors by name/phone
//         2. Create a new vendor inline
//         3. Pick a vendor → parent gets { id, name } back via onPicked$
//
// IPC: shop_list_vendors, shop_create_vendor

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuImage, LuBuilding2 } from "@qwikest/icons/lucide";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";

export interface VendorBasic {
  id: string;
  name: string;
  phone?: string;
  payment_terms: string;
  media_id?: string | null;
  image_url?: string | null;
}

export interface VendorLookupSlideOverProps {
  open: Signal<boolean>;
  onPicked$: PropFunction<(vendor: VendorBasic) => void>;
}

const inp = {
  width: "100%",
  height: "2.25rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

const lbl = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

const TERMS = ["immediate", "net7", "net15", "net30", "net60"];

export const VendorLookupSlideOver = component$<VendorLookupSlideOverProps>(
  ({ open, onPicked$ }) => {
    const vendors  = useSignal<VendorBasic[]>([]);
    const search   = useSignal("");
    const loading  = useSignal(false);
    const showAdd  = useSignal(false);
    const saving   = useSignal(false);
    const addError = useSignal<string | null>(null);

    // new-vendor form
    const fname     = useSignal("");
    const fphone    = useSignal("");
    const fterms    = useSignal("immediate");
    const fmedia_id = useSignal<string | null>(null);
    const fimage_url = useSignal<string | null>(null);
    const showMediaPicker = useSignal(false);

    const load = $(async () => {
      loading.value = true;
      try {
        vendors.value = await invoke<VendorBasic[]>("shop_list_vendors", {});
      } catch (e) {
        console.error("[VendorLookup] load failed:", e);
      } finally {
        loading.value = false;
      }
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      const isOpen = track(() => open.value);
      if (!isOpen) {
        search.value     = "";
        showAdd.value    = false;
        fname.value      = "";
        fphone.value     = "";
        fterms.value     = "immediate";
        fmedia_id.value  = null;
        fimage_url.value = null;
        addError.value   = null;
        return;
      }
      await load();
    });

    const filtered = useComputed$(() => {
      const q = search.value.toLowerCase().trim();
      if (!q) return vendors.value;
      return vendors.value.filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.phone ?? "").includes(q)
      );
    });

    const pick = $((vendor: VendorBasic) => {
      onPicked$(vendor);
      open.value = false;
    });

    const handleCreate = $(async () => {
      if (!fname.value.trim()) { addError.value = "Name is required"; return; }
      saving.value = true; addError.value = null;
      try {
        const created = await invoke<VendorBasic>("shop_create_vendor", {
          data: {
            name: fname.value.trim(),
            phone: fphone.value.trim() || null,
            payment_terms: fterms.value,
            media_id: fmedia_id.value || null,
            image_url: fimage_url.value || null,
          },
        });
        await load();
        showAdd.value = false;
        fname.value = ""; fphone.value = ""; fterms.value = "immediate";
        fmedia_id.value = null; fimage_url.value = null;
        // Auto-pick the newly created vendor
        await onPicked$(created);
        open.value = false;
      } catch (e) {
        addError.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    if (!open.value) return <></>;

    return (
      <>
        {/* Overlay */}
        <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 600,
          display: "flex",
          justifyContent: "flex-end",
        }}
        onClick$={(e) => {
          if ((e.target as HTMLElement).style.position === "fixed") {
            open.value = false;
          }
        }}
      >
        {/* Panel */}
        <div
          style={{
            width: "380px",
            background: "var(--surface-1)",
            height: "100%",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            boxShadow: "-8px 0 40px rgba(0,0,0,0.25)",
          }}
          onClick$={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: "1.25rem 1.25rem 0", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontWeight: "700", fontSize: "1rem", color: "var(--text-primary)" }}>Pick Vendor</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Search or add a new one</div>
            </div>
            <button type="button"
              onClick$={() => { open.value = false; }}
              style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "1.25rem", cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>

          {/* Search */}
          <div style={{ padding: "0 1.25rem", marginBottom: "0.75rem" }}>
            <div style={{ position: "relative" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="search"
                placeholder="Search by name or phone…"
                value={search.value}
                onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
                style={{ ...inp, paddingLeft: "2rem" }}
                autoFocus
              />
            </div>
          </div>

          {/* Add new inline form */}
          <div style={{ padding: "0 1.25rem", marginBottom: "0.5rem" }}>
            <button
              type="button"
              onClick$={() => { showAdd.value = !showAdd.value; addError.value = null; }}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                background: "var(--surface-2)", border: "1px dashed var(--border)",
                borderRadius: "0.375rem", padding: "0.5rem 0.75rem",
                width: "100%", fontSize: "0.8125rem", color: "var(--text-secondary)",
                cursor: "pointer", fontWeight: "500",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {showAdd.value ? "Cancel" : "Add new vendor"}
            </button>

            {showAdd.value && (
              <div style={{ marginTop: "0.625rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.875rem" }}>
                {addError.value && (
                  <div style={{ padding: "0.4rem 0.625rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.25rem", color: "var(--error)", fontSize: "0.75rem", marginBottom: "0.625rem" }}>
                    {addError.value}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <label style={lbl}>Name *</label>
                    <input type="text" value={fname.value}
                      onInput$={(e) => { fname.value = (e.target as HTMLInputElement).value; }}
                      placeholder="Vendor name" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Phone</label>
                    <input type="tel" value={fphone.value}
                      onInput$={(e) => { fphone.value = (e.target as HTMLInputElement).value; }}
                      placeholder="9876543210" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Payment Terms</label>
                    <select value={fterms.value}
                      onChange$={(e) => { fterms.value = (e.target as HTMLSelectElement).value; }}
                      style={{ ...inp, cursor: "pointer" }}>
                      {TERMS.map(t => (
                        <option key={t} value={t}>{t === "immediate" ? "Immediate" : t.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Vendor Logo / Photo</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: "2.75rem", height: "2.75rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                        {fimage_url.value ? (
                          <img src={fimage_url.value} alt="Vendor" width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <LuBuilding2 style="width:1.25rem;height:1.25rem;color:var(--text-secondary);" />
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <button
                          type="button"
                          onClick$={() => { showMediaPicker.value = true; }}
                          style={{ padding: "0.35rem 0.65rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "500", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          <LuImage style="width:0.75rem;height:0.75rem;" />
                          {fimage_url.value ? "Change Logo" : "Select Logo"}
                        </button>
                        {fimage_url.value && (
                          <button
                            type="button"
                            onClick$={() => { fmedia_id.value = null; fimage_url.value = null; }}
                            style={{ padding: "0.35rem 0.5rem", background: "transparent", border: "none", color: "var(--error)", fontSize: "0.75rem", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <button type="button"
                    disabled={saving.value}
                    onClick$={handleCreate}
                    style={{
                      height: "2.25rem", background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
                      color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem",
                      fontSize: "0.875rem", fontWeight: "600", cursor: saving.value ? "not-allowed" : "pointer",
                      marginTop: "0.25rem",
                    }}>
                    {saving.value ? "Saving…" : "Create & Pick"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Vendor list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 1.25rem 1.25rem" }}>
            {loading.value ? (
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading…</div>
            ) : filtered.value.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                {search.value ? "No vendors match your search." : "No vendors yet — add one above."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {filtered.value.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick$={$(() => pick(v))}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: "0.375rem", padding: "0.625rem 0.875rem",
                      cursor: "pointer", textAlign: "left", width: "100%",
                      transition: "border-color 0.12s, background 0.12s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
                      <div style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontWeight: "600", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                        {v.image_url ? (
                          <img src={v.image_url} alt={v.name} width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          v.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: "500", color: "var(--text-primary)", fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                        {v.phone && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>{v.phone}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.7rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", color: "var(--text-secondary)" }}>
                        {v.payment_terms}
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style={{ color: "var(--text-secondary)" }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Picker Modal for Vendor Logo */}
      <MediaPickerModal
        open={showMediaPicker}
        filterType="image"
        zIndex={700}
        onSelected$={$((media: MediaItem) => {
          fmedia_id.value = media.id;
          fimage_url.value = media.url || media.local_url || "";
        })}
      />
    </>
  );
}
);
