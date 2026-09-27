import { component$, useSignal, useContext, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { QRCodeView } from "~/components/QRCode";
import { TaxCtx } from "../layout";

export default component$(() => {
  const store        = useContext(TaxCtx);
  const generating   = useSignal<string | null>(null);
  const searchQuery  = useSignal("");
  const visibleLimit = useSignal(30);

  const activeModal  = useSignal<{ doc: any; ei: any } | null>(null);
  const copied       = useSignal(false);

  const handleGenerate = $(async (docId: string, docNumber?: string) => {
    generating.value = docId;
    try {
      const ei = await invoke("fin_generate_einvoice", { documentId: docId }) as any;
      const updated = { ...store.einvoices, [docId]: ei };
      if (docNumber) updated[docNumber] = ei;
      if (ei?.document_id) updated[ei.document_id] = ei;
      store.einvoices = updated;
    } catch (e: any) {
      alert("Failed: " + (e?.message ?? String(e)));
    } finally {
      generating.value = null;
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

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {[...Array(4)].map((_, i) => <div key={i} style={{ height: "72px", background: "var(--surface-2)", borderRadius: "0.625rem", animation: "pulse 2s infinite" }} />)}
      </div>
    );
  }

  const confirmedInvoices = store.invoices.filter((i) => !i.status || i.status === "confirmed" || i.status === "paid" || i.status === "completed" || store.einvoices[i.id] || (i.doc_number && store.einvoices[i.doc_number]));

  const q = searchQuery.value.trim().toLowerCase();
  const filteredInvoices = confirmedInvoices.filter((doc: any) => {
    if (!q) return true;
    const ei = store.einvoices[doc.id] || (doc.doc_number ? store.einvoices[doc.doc_number] : undefined);
    return (
      (doc.doc_number && doc.doc_number.toLowerCase().includes(q)) ||
      (doc.customer_name && doc.customer_name.toLowerCase().includes(q)) ||
      (doc.id && doc.id.toLowerCase().includes(q)) ||
      (ei?.irn && ei.irn.toLowerCase().includes(q)) ||
      (ei?.ack_number && String(ei.ack_number).toLowerCase().includes(q))
    );
  });

  const displayedInvoices = filteredInvoices.slice(0, visibleLimit.value);

  return (
    <div>
      <div style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.375rem 0" }}>E-Invoice Log</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8125rem" }}>
            Generate IRN (Invoice Reference Number) and QR code for B2B invoices above ₹5 Crore turnover threshold. Showing {displayedInvoices.length} of {filteredInvoices.length} invoices.
          </p>
        </div>
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
          placeholder="🔍 Search invoices by doc number, customer name, IRN, ACK number..."
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

      {filteredInvoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          {searchQuery.value
            ? `No invoices matching "${searchQuery.value}".`
            : "No confirmed invoices yet. Create and confirm invoices to generate e-invoices."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {displayedInvoices.map((doc: any) => {
            const ei  = store.einvoices[doc.id] || (doc.doc_number ? store.einvoices[doc.doc_number] : undefined);
            const gen = generating.value === doc.id;
            return (
              <div key={doc.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.625rem", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    {doc.doc_number ?? doc.id}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {doc.customer_name ?? "—"} · ₹{(doc.grand_total ?? 0).toLocaleString("en-IN")}
                  </div>
                </div>

                {ei ? (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#10b981", marginBottom: "0.25rem" }}>✓ Generated</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      {ei.irn.slice(0, 16)}…{ei.irn.slice(-8)}
                    </div>
                    {ei.ack_number && (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>ACK: {ei.ack_number}</div>
                    )}
                    <button type="button" onClick$={() => { activeModal.value = { doc, ei }; }}
                      style={{ background: "none", border: "none", padding: 0, fontSize: "0.75rem", color: "var(--accent)", cursor: "pointer", textDecoration: "underline", marginTop: "0.25rem" }}>
                      View IRN & QR Details →
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick$={() => handleGenerate(doc.id, doc.doc_number)} disabled={gen}
                    style={{ padding: "0.5rem 1rem", border: "1px solid var(--accent)", borderRadius: "0.375rem", background: "transparent", color: "var(--accent)", cursor: gen ? "wait" : "pointer", fontSize: "0.8125rem", fontWeight: 600, flexShrink: 0 }}>
                    {gen ? "Generating…" : "Generate IRN"}
                  </button>
                )}
              </div>
            );
          })}

          {filteredInvoices.length > visibleLimit.value && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                class="btn btn-secondary"
                onClick$={() => { visibleLimit.value += 30; }}
                style={{ padding: "0.5rem 1.5rem", fontSize: "0.8125rem", fontWeight: 600 }}
              >
                + Load More (Showing {displayedInvoices.length} of {filteredInvoices.length})
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
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>E-Invoice IRN & QR Details</h2>
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
                  <QRCodeView value={activeModal.value.ei.qr_code || activeModal.value.ei.irn} size={170} />
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.625rem", textAlign: "center", lineHeight: "1.3" }}>
                    Scan with GST app or camera to verify digital signature
                  </div>
                </div>

                {/* Right: Details & IRN */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ background: "var(--surface-2)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem", fontWeight: 600 }}>INVOICE REFERENCE NUMBER (IRN)</div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.8125rem", wordBreak: "break-all", lineHeight: 1.4, color: "var(--text-primary)" }}>
                      {activeModal.value.ei.irn}
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onClick$={() => handleCopy(activeModal.value!.ei.irn)}
                      style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
                      {copied.value ? "✓ Copied IRN" : "📋 Copy IRN"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Ack Number</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>{activeModal.value.ei.ack_number ?? "—"}</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Document</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>{activeModal.value.doc.doc_number ?? activeModal.value.doc.id}</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Invoice Value</div>
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.125rem" }}>₹{(activeModal.value.doc.grand_total ?? 0).toLocaleString("en-IN")}</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.625rem 0.75rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Status</div>
                      <div style={{ fontWeight: 700, fontSize: "0.8125rem", color: "#10b981", marginTop: "0.125rem" }}>✓ Generated</div>
                    </div>
                  </div>
                </div>
              </div>

              {activeModal.value.ei.qr_code && (
                <div style={{ background: "var(--surface-2)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem", fontWeight: 600 }}>B2B SIGNED QR VERIFICATION PAYLOAD</div>
                  <pre style={{ margin: 0, fontSize: "0.75rem", fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--surface-3)", padding: "0.625rem", borderRadius: "0.375rem" }}>
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(activeModal.value.ei.qr_code), null, 2);
                      } catch {
                        return activeModal.value.ei.qr_code;
                      }
                    })()}
                  </pre>
                  <button type="button" class="btn btn-secondary btn-sm" onClick$={() => handleCopy(activeModal.value!.ei.qr_code)}
                    style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
                    {copied.value ? "✓ Copied Payload" : "📋 Copy Signed Payload"}
                  </button>
                </div>
              )}
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
