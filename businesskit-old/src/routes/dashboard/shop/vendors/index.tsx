// src/routes/dashboard/shop/vendors/index.tsx
//
// Phase 3 — Vendor list + Add Vendor slide-over + Vendor detail / edit slide-over
//
// IPC: shop_list_vendors, shop_create_vendor, shop_get_vendor_detail, shop_update_vendor

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuImage, LuBuilding2 } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  payment_terms: string;
  lead_time_days: number;
  credit_used: number;
  gst_compliance_rating?: number;
  is_active: number;
  created_at: number;
  media_id?: string | null;
  image_url?: string | null;
}

interface VendorDetail extends Vendor {
  supplied_items: Array<{ item_id: string; item_name: string; purchase_price: number; is_preferred: number }>;
  recent_receipts: Array<{ id: string; doc_number: string; doc_date: number; notes?: string }>;
}

const TERMS = ["immediate", "net7", "net15", "net30", "net60"];

const inp = {
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
  fontFamily: "inherit",
};

const lbl = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export default component$(() => {
  const vendors = useSignal<Vendor[]>([]);
  const loading = useSignal(true);
  const search = useSignal("");

  // Add Vendor SlideOver
  const showAdd = useSignal(false);
  const addName = useSignal("");
  const addPhone = useSignal("");
  const addEmail = useSignal("");
  const addGstin = useSignal("");
  const addTerms = useSignal("immediate");
  const addGstRating = useSignal("");
  const addMediaId = useSignal<string | null>(null);
  const addImageUrl = useSignal<string | null>(null);
  const showAddMediaPicker = useSignal(false);
  const addSaving = useSignal(false);
  const addError = useSignal<string | null>(null);

  // Vendor Detail / Edit SlideOver
  const showDetail = useSignal(false);
  const isEditing = useSignal(false);
  const detail = useSignal<VendorDetail | null>(null);
  const detailBasic = useSignal<Vendor | null>(null);
  const detailLoading = useSignal(false);

  // Edit fields
  const editName = useSignal("");
  const editPhone = useSignal("");
  const editEmail = useSignal("");
  const editGstin = useSignal("");
  const editTerms = useSignal("immediate");
  const editGstRating = useSignal("");
  const editMediaId = useSignal<string | null>(null);
  const editImageUrl = useSignal<string | null>(null);
  const showEditMediaPicker = useSignal(false);
  const editSaving = useSignal(false);
  const editError = useSignal<string | null>(null);

  const load = $(async () => {
    loading.value = true;
    try {
      vendors.value = await invoke<Vendor[]>("shop_list_vendors", {});
    } catch (e) {
      console.error("[Vendors]", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await load();
  });

  const filtered = useComputed$(() => {
    const q = search.value.toLowerCase();
    if (!q) return vendors.value;
    return vendors.value.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.phone ?? "").includes(q) ||
        (v.gstin ?? "").toLowerCase().includes(q)
    );
  });

  // Open instantly from row data, load full detail in background
  const openDetail = $((v: Vendor) => {
    detailBasic.value = v;
    detail.value = null;
    showDetail.value = true;
    isEditing.value = false;
    editError.value = null;

    // Pre-populate edit fields
    editName.value = v.name || "";
    editPhone.value = v.phone || "";
    editEmail.value = v.email || "";
    editGstin.value = v.gstin || "";
    editTerms.value = v.payment_terms || "immediate";
    editGstRating.value = v.gst_compliance_rating != null ? String(v.gst_compliance_rating) : "";
    editMediaId.value = v.media_id ?? null;
    editImageUrl.value = v.image_url ?? null;

    detailLoading.value = true;
    invoke<VendorDetail>("shop_get_vendor_detail", { vendorId: v.id })
      .then((d) => {
        detail.value = d;
        if (d.media_id) editMediaId.value = d.media_id;
        if (d.image_url) editImageUrl.value = d.image_url;
      })
      .catch((e) => console.error("[VendorDetail]", e))
      .finally(() => {
        detailLoading.value = false;
      });
  });

  const handleCreate = $(async () => {
    if (!addName.value.trim()) {
      addError.value = "Vendor name is required";
      return;
    }
    addSaving.value = true;
    addError.value = null;
    try {
      await invoke("shop_create_vendor", {
        data: {
          name: addName.value.trim(),
          phone: addPhone.value.trim() || null,
          email: addEmail.value.trim() || null,
          gstin: addGstin.value.trim() || null,
          payment_terms: addTerms.value,
          gst_compliance_rating: addGstRating.value ? parseInt(addGstRating.value, 10) : null,
          media_id: addMediaId.value || null,
          image_url: addImageUrl.value || null,
        },
      });
      showAdd.value = false;
      addName.value = "";
      addPhone.value = "";
      addEmail.value = "";
      addGstin.value = "";
      addTerms.value = "immediate";
      addGstRating.value = "";
      addMediaId.value = null;
      addImageUrl.value = null;
      await load();
    } catch (e) {
      addError.value = String(e);
    } finally {
      addSaving.value = false;
    }
  });

  const handleUpdate = $(async () => {
    if (!detailBasic.value) return;
    if (!editName.value.trim()) {
      editError.value = "Vendor name is required";
      return;
    }
    editSaving.value = true;
    editError.value = null;
    try {
      const rating = editGstRating.value ? parseInt(editGstRating.value, 10) : null;
      await invoke("shop_update_vendor", {
        data: {
          id: detailBasic.value.id,
          name: editName.value.trim(),
          phone: editPhone.value.trim() || null,
          email: editEmail.value.trim() || null,
          gstin: editGstin.value.trim() || null,
          payment_terms: editTerms.value,
          gst_compliance_rating: rating,
          media_id: editMediaId.value || null,
          image_url: editImageUrl.value || null,
        },
      });

      const updatedVendor: Vendor = {
        ...detailBasic.value,
        name: editName.value.trim(),
        phone: editPhone.value.trim() || undefined,
        email: editEmail.value.trim() || undefined,
        gstin: editGstin.value.trim() || undefined,
        payment_terms: editTerms.value,
        gst_compliance_rating: rating ?? undefined,
        media_id: editMediaId.value || null,
        image_url: editImageUrl.value || null,
      };

      detailBasic.value = updatedVendor;
      if (detail.value) {
        detail.value = {
          ...detail.value,
          ...updatedVendor,
        };
      }

      // Update in main list
      vendors.value = vendors.value.map((v) => (v.id === updatedVendor.id ? updatedVendor : v));
      isEditing.value = false;
    } catch (e) {
      editError.value = String(e);
    } finally {
      editSaving.value = false;
    }
  });

  const fmtDate = (ts: number) =>
    ts
      ? new Date(ts * 1000).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  const fmtMoney = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "22rem" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style={{
              position: "absolute",
              left: "0.65rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-secondary)",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search vendors…"
            value={search.value}
            onInput$={(e) => {
              search.value = (e.target as HTMLInputElement).value;
            }}
            style={{ ...inp, paddingLeft: "2rem" }}
          />
        </div>
        <button
          type="button"
          onClick$={() => {
            showAdd.value = true;
            addError.value = null;
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0 1rem",
            height: "2.375rem",
            fontSize: "0.875rem",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Vendor
        </button>
      </div>

      {/* ── Vendor List Table ── */}
      {loading.value ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Loading vendors…
        </div>
      ) : filtered.value.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏪</div>
          <div style={{ fontWeight: "500", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            No vendors yet
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Add a vendor to start tracking purchases and stock receipts.
          </div>
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                {["Name", "Phone", "GSTIN", "Payment Terms", "GST Rating"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.625rem 0.875rem",
                      textAlign: "left",
                      fontWeight: "600",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.value.map((v) => (
                <tr
                  key={v.id}
                  onClick$={$(() => openDetail(v))}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "background 120ms",
                  }}
                >
                  <td style={{ padding: "0.625rem 0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      <div style={{ width: "2rem", height: "2rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontWeight: "600", fontSize: "0.75rem", color: "var(--text-primary)" }}>
                        {v.image_url ? (
                          <img src={v.image_url} alt={v.name} width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          v.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span>{v.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)" }}>
                    {v.phone ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.625rem 0.875rem",
                      color: "var(--text-secondary)",
                      fontFamily: "monospace",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {v.gstin ?? "—"}
                  </td>
                  <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)" }}>
                    {v.payment_terms}
                  </td>
                  <td
                    style={{
                      padding: "0.625rem 0.875rem",
                      color: v.gst_compliance_rating != null ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    {v.gst_compliance_rating != null ? (
                      <span
                        style={{
                          padding: "0.15rem 0.45rem",
                          borderRadius: "0.25rem",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          background:
                            v.gst_compliance_rating >= 80
                              ? "rgba(34,197,94,0.15)"
                              : v.gst_compliance_rating >= 50
                              ? "rgba(234,179,8,0.15)"
                              : "rgba(239,68,68,0.15)",
                          color:
                            v.gst_compliance_rating >= 80
                              ? "rgb(34,197,94)"
                              : v.gst_compliance_rating >= 50
                              ? "rgb(234,179,8)"
                              : "rgb(239,68,68)",
                        }}
                      >
                        {v.gst_compliance_rating}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Vendor SlideOver ── */}
      <SlideOver
        open={showAdd}
        title="Add Vendor"
        subtitle="Create a new vendor or supplier"
        width="440px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "1.5rem" }}>
          {addError.value && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "0.375rem",
                color: "var(--error)",
                fontSize: "0.8125rem",
              }}
            >
              {addError.value}
            </div>
          )}

          <div>
            <label style={lbl}>Vendor Name *</label>
            <input
              type="text"
              value={addName.value}
              onInput$={(e) => {
                addName.value = (e.target as HTMLInputElement).value;
              }}
              placeholder="e.g. Medico Supplies"
              style={inp}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={lbl}>Phone</label>
              <input
                type="tel"
                value={addPhone.value}
                onInput$={(e) => {
                  addPhone.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="9876543210"
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input
                type="email"
                value={addEmail.value}
                onInput$={(e) => {
                  addEmail.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="vendor@email.com"
                style={inp}
              />
            </div>
          </div>

          <div>
            <label style={lbl}>GSTIN</label>
            <input
              type="text"
              value={addGstin.value}
              onInput$={(e) => {
                addGstin.value = (e.target as HTMLInputElement).value;
              }}
              placeholder="22AAAAA0000A1Z5"
              style={inp}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={lbl}>Payment Terms</label>
              <select
                value={addTerms.value}
                onChange$={(e) => {
                  addTerms.value = (e.target as HTMLSelectElement).value;
                }}
                style={{ ...inp, cursor: "pointer" }}
              >
                {TERMS.map((t) => (
                  <option key={t} value={t}>
                    {t === "immediate" ? "Immediate" : t.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>GST Rating (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={addGstRating.value}
                onInput$={(e) => {
                  addGstRating.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="e.g. 95"
                style={inp}
              />
            </div>
          </div>

          <div>
            <label style={lbl}>Vendor Logo / Photo</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: "3.25rem", height: "3.25rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                {addImageUrl.value ? (
                  <img src={addImageUrl.value} alt="Vendor" width={52} height={52} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <LuBuilding2 style="width:1.5rem;height:1.5rem;color:var(--text-secondary);" />
                )}
              </div>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <button
                  type="button"
                  onClick$={() => { showAddMediaPicker.value = true; }}
                  style={{ padding: "0.35rem 0.65rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "500", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                >
                  <LuImage style="width:0.75rem;height:0.75rem;" />
                  {addImageUrl.value ? "Change Logo" : "Select Logo"}
                </button>
                {addImageUrl.value && (
                  <button
                    type="button"
                    onClick$={() => { addMediaId.value = null; addImageUrl.value = null; }}
                    style={{ padding: "0.35rem 0.5rem", background: "transparent", border: "none", color: "var(--error)", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              type="button"
              onClick$={() => {
                showAdd.value = false;
                addError.value = null;
              }}
              style={{
                padding: "0 1rem",
                height: "2.375rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={addSaving.value}
              onClick$={handleCreate}
              style={{
                padding: "0 1.25rem",
                height: "2.375rem",
                background: addSaving.value ? "var(--muted)" : "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: addSaving.value ? "not-allowed" : "pointer",
              }}
            >
              {addSaving.value ? "Saving…" : "Save Vendor"}
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Vendor Detail / Edit SlideOver ── */}
      <SlideOver
        open={showDetail}
        title={detailBasic.value?.name ?? "Vendor"}
        subtitle={detailBasic.value?.phone ?? detailBasic.value?.email ?? ""}
        width="440px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "1.5rem" }}>
          {/* Action bar (Edit / Done) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              {isEditing.value ? "Editing Vendor" : "Vendor Details"}
            </span>
            <button
              type="button"
              onClick$={() => {
                isEditing.value = !isEditing.value;
                editError.value = null;
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {isEditing.value ? "Cancel Edit" : "Edit Vendor"}
            </button>
          </div>

          {/* Edit Form */}
          {isEditing.value ? (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {editError.value && (
                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: "0.375rem",
                    color: "var(--error)",
                    fontSize: "0.8125rem",
                  }}
                >
                  {editError.value}
                </div>
              )}

              <div>
                <label style={lbl}>Vendor Name *</label>
                <input
                  type="text"
                  value={editName.value}
                  onInput$={(e) => {
                    editName.value = (e.target as HTMLInputElement).value;
                  }}
                  style={inp}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input
                    type="tel"
                    value={editPhone.value}
                    onInput$={(e) => {
                      editPhone.value = (e.target as HTMLInputElement).value;
                    }}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input
                    type="email"
                    value={editEmail.value}
                    onInput$={(e) => {
                      editEmail.value = (e.target as HTMLInputElement).value;
                    }}
                    style={inp}
                  />
                </div>
              </div>

              <div>
                <label style={lbl}>GSTIN</label>
                <input
                  type="text"
                  value={editGstin.value}
                  onInput$={(e) => {
                    editGstin.value = (e.target as HTMLInputElement).value;
                  }}
                  style={inp}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                <div>
                  <label style={lbl}>Payment Terms</label>
                  <select
                    value={editTerms.value}
                    onChange$={(e) => {
                      editTerms.value = (e.target as HTMLSelectElement).value;
                    }}
                    style={{ ...inp, cursor: "pointer" }}
                  >
                    {TERMS.map((t) => (
                      <option key={t} value={t}>
                        {t === "immediate" ? "Immediate" : t.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>GST Rating (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editGstRating.value}
                    onInput$={(e) => {
                      editGstRating.value = (e.target as HTMLInputElement).value;
                    }}
                    style={inp}
                  />
                </div>
              </div>

              <div>
                <label style={lbl}>Vendor Logo / Photo</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "3.25rem", height: "3.25rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                    {editImageUrl.value ? (
                      <img src={editImageUrl.value} alt="Vendor" width={52} height={52} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <LuBuilding2 style="width:1.5rem;height:1.5rem;color:var(--text-secondary);" />
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button
                      type="button"
                      onClick$={() => { showEditMediaPicker.value = true; }}
                      style={{ padding: "0.35rem 0.65rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "500", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <LuImage style="width:0.75rem;height:0.75rem;" />
                      {editImageUrl.value ? "Change Logo" : "Select Logo"}
                    </button>
                    {editImageUrl.value && (
                      <button
                        type="button"
                        onClick$={() => { editMediaId.value = null; editImageUrl.value = null; }}
                        style={{ padding: "0.35rem 0.5rem", background: "transparent", border: "none", color: "var(--error)", fontSize: "0.75rem", cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick$={() => {
                    isEditing.value = false;
                    editError.value = null;
                  }}
                  style={{
                    padding: "0 0.875rem",
                    height: "2.25rem",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={editSaving.value}
                  onClick$={handleUpdate}
                  style={{
                    padding: "0 1rem",
                    height: "2.25rem",
                    background: editSaving.value ? "var(--muted)" : "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: "600",
                    cursor: editSaving.value ? "not-allowed" : "pointer",
                  }}
                >
                  {editSaving.value ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Vendor Profile & Logo Header */}
              {detailBasic.value && (
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontWeight: "700", fontSize: "1.25rem", color: "var(--text-primary)" }}>
                    {editImageUrl.value ? (
                      <img src={editImageUrl.value} alt={detailBasic.value.name} width={56} height={56} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      detailBasic.value.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "700", fontSize: "1rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {detailBasic.value.name}
                    </div>
                    {(detailBasic.value.phone || detailBasic.value.email) && (
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                        {detailBasic.value.phone ? `${detailBasic.value.phone}${detailBasic.value.email ? ` • ${detailBasic.value.email}` : ""}` : detailBasic.value.email}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.375rem" }}>
                      <button
                        type="button"
                        onClick$={() => { showEditMediaPicker.value = true; }}
                        style={{ padding: "0.25rem 0.6rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.25rem", fontSize: "0.72rem", fontWeight: "500", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <LuImage style="width:0.75rem;height:0.75rem;" />
                        {editImageUrl.value ? "Change Logo" : "Add Logo"}
                      </button>
                      {editImageUrl.value && (
                        <button
                          type="button"
                          onClick$={$(async () => {
                            if (!detailBasic.value) return;
                            editMediaId.value = null;
                            editImageUrl.value = null;
                            await invoke("shop_update_vendor", {
                              data: {
                                id: detailBasic.value.id,
                                media_id: null,
                                image_url: null,
                              },
                            });
                            await load();
                          })}
                          style={{ padding: "0.25rem 0.5rem", background: "transparent", border: "none", color: "var(--error)", fontSize: "0.72rem", cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Basic stats cards */}
              {detailBasic.value && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                  {[
                    { label: "Payment Terms", value: detailBasic.value.payment_terms },
                    { label: "GSTIN", value: detailBasic.value.gstin ?? "—" },
                    {
                      label: "GST Rating",
                      value:
                        detailBasic.value.gst_compliance_rating != null
                          ? `${detailBasic.value.gst_compliance_rating}%`
                          : "Not Rated",
                    },
                    { label: "Credit Used", value: fmtMoney(detailBasic.value.credit_used || 0) },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: "var(--field-fill)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        padding: "0.625rem 0.75rem",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{s.label}</div>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                          marginTop: "0.2rem",
                        }}
                      >
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Items supplied and receipts */}
              {detailLoading.value ? (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Loading details…</div>
              ) : (
                detail.value && (
                  <>
                    {/* Items supplied */}
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "0.625rem",
                          paddingBottom: "0.5rem",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        Items Supplied ({detail.value.supplied_items.length})
                      </div>
                      {detail.value.supplied_items.length === 0 ? (
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                          No items linked yet.
                        </div>
                      ) : (
                        detail.value.supplied_items.map((item) => (
                          <div
                            key={item.item_id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "0.5rem 0",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <span style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>
                              {item.item_name}
                              {item.is_preferred ? " ⭐" : ""}
                            </span>
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                              {fmtMoney(item.purchase_price)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Recent receipts */}
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "0.625rem",
                          paddingBottom: "0.5rem",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        Recent Receipts ({detail.value.recent_receipts.length})
                      </div>
                      {detail.value.recent_receipts.length === 0 ? (
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                          No stock received yet.
                        </div>
                      ) : (
                        detail.value.recent_receipts.map((r) => (
                          <div
                            key={r.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "0.5rem 0",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <span style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>
                              {r.doc_number}
                            </span>
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                              {fmtDate(r.doc_date)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )
              )}
            </>
          )}
        </div>
      </SlideOver>

      {/* Media Picker for Adding Vendor Logo */}
      <MediaPickerModal
        open={showAddMediaPicker}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          addMediaId.value = media.id;
          addImageUrl.value = media.url || media.local_url || "";
        })}
      />

      {/* Media Picker for Editing Vendor Logo */}
      <MediaPickerModal
        open={showEditMediaPicker}
        filterType="image"
        onSelected$={$(async (media: MediaItem) => {
          const url = media.url || media.local_url || "";
          editMediaId.value = media.id;
          editImageUrl.value = url;
          if (detailBasic.value) {
            await invoke("shop_update_vendor", {
              data: {
                id: detailBasic.value.id,
                media_id: media.id,
                image_url: url,
              },
            });
            await load();
          }
        })}
      />
    </>
  );
});
