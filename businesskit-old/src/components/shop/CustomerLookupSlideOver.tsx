// src/components/shop/CustomerLookupSlideOver.tsx
//
// WHAT: Customer search + quick-add panel used inside NewBillModal.
//
// SPEED FIX: Receives an already-loaded `customers` Signal from the parent
//   (NewBillModal loads customers alongside its items in its useVisibleTask$).
//   This panel does ZERO loading — it just filters the pre-loaded list.
//   Opening is instant; no network round-trip happens.
//
// DESIGN: Matches AddProductModal exactly —
//   - SlideOver wrapper
//   - SectionTitle dividers (uppercase, border-bottom)
//   - var(--field-fill) inputs, transition: "border-color 150ms ease"
//   - fontFamily: "inherit" on all inputs
//   - Sticky footer at bottom: "-1.5rem", margin "0 -1.5rem -1.5rem"
//   - 2.625rem primary button with LuSave / LuLoader spinner
//
// IPC: shop_create_customer (add new only; listing is done by parent)

import {
  component$,
  useSignal,
  useTask$,
  useComputed$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuSave, LuLoader, LuImage, LuUser } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomerBasic {
  id:    string;
  name:  string;
  phone: string | null;
  email: string | null;
  gstin?: string | null;
  pan?: string | null;
  dl_no?: string | null;
  billing_addr?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  credit_limit?: number;
  credit_used?: number;
  wallet_balance?: number;
  store_credit?: number;
  collect_taxes?: number;
  accepts_email_marketing?: number;
  accepts_sms_marketing?: number;
  accepts_whatsapp_marketing?: number;
  date_of_birth?: string | null;
  anniversary?: string | null;
  notes?: string | null;
  tags?: string | null;
  addresses?: string | null;
  gst_supply_type?: string;
  total_spent?: number;
  total_orders?: number;
  media_id?: string | null;
  image_url?: string | null;
  price_list_id?: string | null;
}

export interface CustomerLookupSlideOverProps {
  open:      Signal<boolean>;
  customers: Signal<CustomerBasic[]>;     // pre-loaded by parent — no loading here
  zIndex?:   number;
  onPicked$: PropFunction<(customer: CustomerBasic) => void>;
  onCreated$: PropFunction<(customer: CustomerBasic) => void>; // parent updates its cache
}

// ── Design tokens — EXACTLY from AddProductModal ──────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: "0.75rem",
      fontWeight: "600" as const,
      color: "var(--text-secondary)",
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      marginBottom: "0.875rem",
      paddingBottom: "0.5rem",
      borderBottom: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CustomerLookupSlideOver = component$<CustomerLookupSlideOverProps>(
  ({ open, customers, zIndex = 500, onPicked$, onCreated$ }) => {
    const search   = useSignal("");
    const showAdd  = useSignal(false);
    const saving   = useSignal(false);
    const error    = useSignal<string | null>(null);

    // New-customer form fields
    const fname         = useSignal("");
    const fphone        = useSignal("");
    const femail        = useSignal("");
    const fgstin        = useSignal("");
    const fdl_no        = useSignal("");
    const fpan          = useSignal("");
    const fbilling_addr = useSignal("");
    const fcity         = useSignal("");
    const fstate        = useSignal("");
    const fpincode      = useSignal("");
    const fmedia_id     = useSignal<string | null>(null);
    const fimage_url    = useSignal<string | null>(null);
    const showMediaPicker = useSignal(false);

    // Reset form on close
    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      if (!isOpen) {
        search.value        = "";
        showAdd.value       = false;
        fname.value         = "";
        fphone.value        = "";
        femail.value        = "";
        fgstin.value        = "";
        fdl_no.value        = "";
        fpan.value          = "";
        fbilling_addr.value = "";
        fcity.value         = "";
        fstate.value        = "";
        fpincode.value      = "";
        fmedia_id.value     = null;
        fimage_url.value    = null;
        error.value         = null;
      }
    });

    const filtered = useComputed$(() => {
      const q = search.value.toLowerCase().trim();
      if (!q) return customers.value;
      return customers.value.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.gstin ?? "").toLowerCase().includes(q) ||
        (c.dl_no ?? "").toLowerCase().includes(q) ||
        (c.pincode ?? "").includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
      );
    });

    const pick = $((c: CustomerBasic) => {
      onPicked$(c);
      open.value = false;
    });

    const handleCreate = $(async () => {
      if (!fname.value.trim()) { error.value = "Name is required"; return; }
      saving.value = true;
      error.value  = null;
      try {
        const created = await invoke<CustomerBasic>("shop_create_customer", {
          data: {
            name:         fname.value.trim(),
            phone:        fphone.value.trim() || null,
            email:        femail.value.trim() || null,
            gstin:        fgstin.value.trim() || null,
            dl_no:        fdl_no.value.trim() || null,
            pan:          fpan.value.trim() || null,
            billing_addr: fbilling_addr.value.trim() || null,
            city:         fcity.value.trim() || null,
            state:        fstate.value.trim() || null,
            pincode:      fpincode.value.trim() || null,
            media_id:     fmedia_id.value || null,
            image_url:    fimage_url.value || null,
          },
        });
        // Let parent update its cache (so the list is fresh)
        await onCreated$(created);
        // Auto-select and close
        await onPicked$(created);
        open.value = false;
      } catch (e) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    return (
      <>
        <SlideOver open={open} title="Pick Customer" subtitle="Search contacts or add a new one." width="420px" zIndex={zIndex}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* ── Error banner ─────────────────────────────────────────────── */}
          {error.value && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem", lineHeight: "1.5" }}>
              {error.value}
            </div>
          )}

          {/* ── Search ───────────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Search</label>
            <div style={{ position: "relative" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Name, phone or email…"
                value={search.value}
                onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
                style={{ ...inputStyle, paddingLeft: "2rem" }}
                autoFocus />
            </div>
          </div>

          {/* ── Customer list ────────────────────────────────────────────── */}
          <div>
            <SectionTitle>
              {`${filtered.value.length} customer${filtered.value.length !== 1 ? "s" : ""}`}
            </SectionTitle>

            {filtered.value.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                {search.value ? "No customers match your search." : "No customers yet — add one below."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxHeight: "300px", overflowY: "auto" }}>
                {filtered.value.map(c => (
                  <button key={c.id} type="button" onClick$={$(() => pick(c))}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.625rem 0.875rem",
                      cursor: "pointer", textAlign: "left", width: "100%",
                      transition: "border-color 150ms ease",
                      fontFamily: "inherit",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
                      <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", background: "var(--surface-3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontWeight: "600", fontSize: "0.75rem", color: "var(--text-primary)" }}>
                        {c.image_url ? (
                          <img src={c.image_url} alt={c.name} width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          c.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: "500", color: "var(--text-primary)", fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </div>
                        {(c.phone || c.email || c.city) && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[c.phone ?? c.email, [c.city, c.pincode].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                      style={{ color: "var(--text-secondary)", flexShrink: 0, marginLeft: "0.5rem" }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Add new customer ─────────────────────────────────────────── */}
          <div>
            <SectionTitle>Add New Customer</SectionTitle>

            {/* Toggle button */}
            <button type="button"
              onClick$={() => { showAdd.value = !showAdd.value; error.value = null; }}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                background: "var(--field-fill)",
                border: "1px dashed var(--border)",
                borderRadius: "0.375rem",
                padding: "0.5rem 0.75rem",
                width: "100%",
                fontSize: "0.8125rem", color: "var(--text-secondary)",
                cursor: "pointer", fontWeight: "500",
                transition: "border-color 150ms ease",
                fontFamily: "inherit",
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                {showAdd.value
                  ? <path d="M18 6 6 18M6 6l12 12"/>
                  : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
              </svg>
              {showAdd.value ? "Cancel" : "Add new customer"}
            </button>

            {showAdd.value && (
              <div style={{ marginTop: "0.875rem", display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
                <div>
                  <label style={labelStyle}>Name / Firm Name <span style="color:var(--error)">*</span></label>
                  <input type="text" value={fname.value}
                    onInput$={(e) => { fname.value = (e.target as HTMLInputElement).value; }}
                    placeholder="e.g. M/S VISHAL ENTERPRISES" style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input type="tel" value={fphone.value}
                      onInput$={(e) => { fphone.value = (e.target as HTMLInputElement).value; }}
                      placeholder="9876543210" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={femail.value}
                      onInput$={(e) => { femail.value = (e.target as HTMLInputElement).value; }}
                      placeholder="customer@email.com" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={labelStyle}>GSTIN</label>
                    <input type="text" value={fgstin.value}
                      onInput$={(e) => { fgstin.value = (e.target as HTMLInputElement).value; }}
                      placeholder="10ECBPK4595M1ZE" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>DL No. (Pharma/Medical)</label>
                    <input type="text" value={fdl_no.value}
                      onInput$={(e) => { fdl_no.value = (e.target as HTMLInputElement).value; }}
                      placeholder="BR-PAT139474/139475" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>PAN No.</label>
                  <input type="text" value={fpan.value}
                    onInput$={(e) => { fpan.value = (e.target as HTMLInputElement).value; }}
                    placeholder="AAAAA0000A" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Billing Address</label>
                  <input type="text" value={fbilling_addr.value}
                    onInput$={(e) => { fbilling_addr.value = (e.target as HTMLInputElement).value; }}
                    placeholder="RC PLACE G.M ROAD" style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={labelStyle}>City</label>
                    <input type="text" value={fcity.value}
                      onInput$={(e) => { fcity.value = (e.target as HTMLInputElement).value; }}
                      placeholder="PATNA" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>State</label>
                    <input type="text" value={fstate.value}
                      onInput$={(e) => { fstate.value = (e.target as HTMLInputElement).value; }}
                      placeholder="BIHAR" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>PIN / ZIP Code</label>
                    <input type="text" value={fpincode.value}
                      onInput$={(e) => { fpincode.value = (e.target as HTMLInputElement).value; }}
                      placeholder="800004" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Customer Photo</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "var(--surface-2)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      {fimage_url.value ? (
                        <img src={fimage_url.value} alt="Customer" width={48} height={48} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <LuUser style="width:1.25rem;height:1.25rem;color:var(--text-secondary);" />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.375rem" }}>
                      <button
                        type="button"
                        onClick$={() => { showMediaPicker.value = true; }}
                        style={{ padding: "0.35rem 0.65rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "500", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <LuImage style="width:0.75rem;height:0.75rem;" />
                        {fimage_url.value ? "Change Photo" : "Add Photo"}
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
              </div>
            )}
          </div>

        </div>

        {/* ── Pinned footer (outside scroll body — rendered in SlideOver footer slot) */}
        <div q:slot="footer">
          {showAdd.value && (
            <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <button type="button" onClick$={handleCreate} disabled={saving.value}
                style={{
                  width: "100%",
                  height: "2.625rem",
                  background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
                  color:      saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  cursor: saving.value ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  transition: "background 150ms ease, opacity 150ms ease",
                  fontFamily: "inherit",
                }}>
                {saving.value ? (
                  <>
                    <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                    Creating…
                  </>
                ) : (
                  <>
                    <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                    Create &amp; Select
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </SlideOver>

      {/* Media Picker Modal for Customer Photo */}
      <MediaPickerModal
        open={showMediaPicker}
        filterType="image"
        zIndex={zIndex ? zIndex + 50 : 650}
        onSelected$={$((media: MediaItem) => {
          fmedia_id.value = media.id;
          fimage_url.value = media.url || media.local_url || "";
        })}
      />
    </>
  );
}
);
