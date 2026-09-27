import { component$, useSignal, useContext, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { QRCodeView } from "~/components/QRCode";
import { TaxCtx } from "../layout";

const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const MODES = ["road", "rail", "air", "ship"];

export default component$(() => {
  const store        = useContext(TaxCtx);
  const showForm     = useSignal(false);
  const saving       = useSignal(false);
  const err          = useSignal<string | null>(null);
  const activeModal  = useSignal<any | null>(null);
  const copied       = useSignal(false);
  const searchQuery  = useSignal("");
  const visibleLimit = useSignal(30);

  const form = useSignal({
    document_id:        "",
    vehicle_number:     "",
    transport_mode:     "road",
    distance_km:        "",
    transporter_id:     "",
    transporter_doc_no: "",
  });

  const handleGenerate = $(async () => {
    if (!form.value.document_id) { err.value = "Select an invoice first."; return; }
    saving.value = true;
    err.value = null;
    try {
      const bill = await invoke("fin_generate_eway_bill", {
        args: {
          document_id:        form.value.document_id,
          vehicle_number:     form.value.vehicle_number || null,
          transport_mode:     form.value.transport_mode,
          distance_km:        parseFloat(form.value.distance_km) || null,
          transporter_id:     form.value.transporter_id || null,
          transporter_doc_no: form.value.transporter_doc_no || null,
        },
      }) as any;
      store.ewayBills = [bill, ...store.ewayBills];
      showForm.value = false;
      form.value = { document_id: "", vehicle_number: "", transport_mode: "road", distance_km: "", transporter_id: "", transporter_doc_no: "" };
    } catch (e: any) {
      err.value = e?.message ?? String(e);
    } finally {
      saving.value = false;
    }
  });

  const handleCopy = $((text: string) => {
    navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });

  const handlePrint = $(() => {
    if (typeof window !== "undefined") window.print();
  });

  const now = Math.floor(Date.now() / 1000);
  const inputStyle = "width:100%;padding:0.5rem 0.75rem;border:1px solid var(--border);border-radius:0.375rem;background:var(--field-fill,var(--surface-3));color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;";

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {[...Array(4)].map((_, i) => <div key={i} style={{ height: "72px", background: "var(--surface-2)", borderRadius: "0.625rem", animation: "pulse 2s infinite" }} />)}
      </div>
    );
  }

  const q = searchQuery.value.trim().toLowerCase();
  const filteredBills = store.ewayBills.filter((b: any) => {
    if (!q) return true;
    return (
      (b.ewb_number && String(b.ewb_number).toLowerCase().includes(q)) ||
      (b.document_id && b.document_id.toLowerCase().includes(q)) ||
      (b.vehicle_number && b.vehicle_number.toLowerCase().includes(q)) ||
      (b.transporter_id && b.transporter_id.toLowerCase().includes(q)) ||
      (b.transporter_doc_no && b.transporter_doc_no.toLowerCase().includes(q))
    );
  });

  const displayedBills = filteredBills.slice(0, visibleLimit.value);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>E-Way Bill</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8125rem" }}>
            Required for goods movement exceeding ₹50,000. Showing {displayedBills.length} of {filteredBills.length} e-way bills.
          </p>
        </div>
        <button type="button" class="btn btn-secondary"
          onClick$={() => showForm.value = !showForm.value}>
          {showForm.value ? "✕ Cancel" : "+ Generate Bill"}
        </button>
      </div>

      {/* Search Input Bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <input
          type="text"
          value={searchQuery.value}
          onInput$={(e) => {
            searchQuery.value = (e.target as HTMLInputElement).value;
            visibleLimit.value = 30;
          }}
          placeholder="🔍 Search e-way bills by EWB number, invoice, vehicle, transporter..."
          style={{
            width: "100%",
            padding: "0.625rem 0.875rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            boxSizing: "border-box",
          }}
        />
      </div>

      {showForm.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem 0" }}>New E-Way Bill</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Invoice *</label>
              <select value={form.value.document_id}
                onChange$={(e) => { form.value = { ...form.value, document_id: (e.target as HTMLSelectElement).value }; }}
                style={inputStyle + "height:38px;"}>
                <option value="">Select Invoice</option>
                {store.invoices.map((inv: any, i: number) => (
                  <option key={i} value={inv.id}>{`${inv.doc_number || inv.id} — ${inv.customer_name || "?"}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Vehicle No.</label>
              <input value={form.value.vehicle_number}
                onInput$={(e) => { form.value = { ...form.value, vehicle_number: (e.target as HTMLInputElement).value }; }}
                placeholder="MH12AB1234"
                style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Mode</label>
              <select value={form.value.transport_mode}
                onChange$={(e) => { form.value = { ...form.value, transport_mode: (e.target as HTMLSelectElement).value }; }}
                style={inputStyle + "height:38px;"}>
                {MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Distance (km)</label>
              <input type="number" value={form.value.distance_km}
                onInput$={(e) => { form.value = { ...form.value, distance_km: (e.target as HTMLInputElement).value }; }}
                placeholder="250"
                style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Transporter GSTIN / ID (TRANSIN)</label>
              <input value={form.value.transporter_id}
                onInput$={(e) => { form.value = { ...form.value, transporter_id: (e.target as HTMLInputElement).value }; }}
                placeholder="27ABCDE1234F1Z5 or TRANSIN"
                style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Doc / LR No. (Optional)</label>
              <input value={form.value.transporter_doc_no}
                onInput$={(e) => { form.value = { ...form.value, transporter_doc_no: (e.target as HTMLInputElement).value }; }}
                placeholder="LR-987654"
                style={inputStyle} />
            </div>
          </div>
          {err.value && <div style={{ color: "#ef4444", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>{err.value}</div>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" class="btn btn-primary" onClick$={handleGenerate} disabled={saving.value}>
              {saving.value ? "Generating…" : "Generate E-Way Bill"}
            </button>
            <button type="button" class="btn btn-secondary" onClick$={() => { showForm.value = false; err.value = null; }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {filteredBills.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          {searchQuery.value
            ? `No e-way bills matching "${searchQuery.value}".`
            : "No e-way bills yet. Click Generate Bill to create one for a goods shipment."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {displayedBills.map((b: any) => {
            const expired = b.valid_upto < now;
            return (
              <div key={b.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.625rem", gap: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    🚚 {b.ewb_number}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {b.document_id} · {b.transport_mode} · {b.distance_km > 0 ? `${b.distance_km} km` : "—"}
                    {b.vehicle_number ? ` · Vehicle: ${b.vehicle_number}` : ""}
                    {b.transporter_id ? ` · Transporter: ${b.transporter_id}` : ""}
                    {b.transporter_doc_no ? ` · Doc: ${b.transporter_doc_no}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: expired ? "#ef4444" : "#10b981" }}>
                    {expired ? "⚠ Expired" : "✓ Valid"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Valid till {fmtDate(b.valid_upto)}
                  </div>
                  <button type="button" onClick$={() => { activeModal.value = b; }}
                    style={{ background: "none", border: "none", padding: 0, fontSize: "0.75rem", color: "var(--accent)", cursor: "pointer", textDecoration: "underline", marginTop: "0.25rem" }}>
                    View QR & Details →
                  </button>
                </div>
              </div>
            );
          })}

          {filteredBills.length > visibleLimit.value && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                class="btn btn-secondary"
                onClick$={() => { visibleLimit.value += 30; }}
                style={{ padding: "0.5rem 1.5rem", fontSize: "0.8125rem", fontWeight: 600 }}
              >
                + Load More (Showing {displayedBills.length} of {filteredBills.length})
              </button>
            </div>
          )}
        </div>
      )}

      {activeModal.value && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}
          onClick$={() => { activeModal.value = null; }}>
          <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.5rem", maxWidth: "680px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick$={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>E-Way Bill Details & QR</h2>
              <button type="button" onClick$={() => { activeModal.value = null; }}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Horizontal Flex: Left = QR Code, Right = Texts */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "1.25rem", alignItems: "start" }}>
                {/* Left: QR Code */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", background: "var(--surface-2)", borderRadius: "0.625rem", border: "1px solid var(--border)" }}>
                  <QRCodeView value={JSON.stringify({ ewb_number: activeModal.value.ewb_number, doc_id: activeModal.value.document_id, vehicle: activeModal.value.vehicle_number, valid_upto: activeModal.value.valid_upto })} size={170} />
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.625rem", textAlign: "center", lineHeight: "1.3" }}>
                    Scan to verify transit validity and vehicle allocation
                  </div>
                </div>

                {/* Right: Details */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ background: "var(--surface-2)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem", fontWeight: 600 }}>E-WAY BILL NUMBER</div>
                    <div style={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {activeModal.value.ewb_number}
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onClick$={() => handleCopy(activeModal.value.ewb_number)}
                      style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
                      {copied.value ? "✓ Copied EWB" : "📋 Copy EWB Number"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Transport Mode</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>{activeModal.value.transport_mode?.toUpperCase()}</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Distance</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>{activeModal.value.distance_km} km</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Vehicle Number</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>{activeModal.value.vehicle_number || "—"}</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Valid Till</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>{fmtDate(activeModal.value.valid_upto)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" class="btn btn-secondary" onClick$={handlePrint}
                style={{ padding: "0.5rem 1.25rem", fontWeight: 600, fontSize: "0.875rem" }}>
                🖨️ Print Slip
              </button>
              <button type="button" class="btn btn-primary" onClick$={() => { activeModal.value = null; }}
                style={{ padding: "0.5rem 1.25rem", fontWeight: 600, fontSize: "0.875rem" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
