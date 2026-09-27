// src/routes/dashboard/shop/customers/index.tsx
//
// Phase 3 & Phase 4C — Customer list + Add Customer + detail slide-out
//
// IPC: shop_list_customers, shop_create_customer, shop_get_customer_detail, shop_update_customer_preferences

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { CustomerDetailSlideOver } from "~/components/shop/CustomerDetailSlideOver";
import type { CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";

interface Customer extends CustomerBasic {
  credit_limit: number;
  credit_used: number;
  loyalty_pts: number;
  total_orders: number;
  total_spent: number;
  is_active: number;
  created_at: number;
  wallet_balance?: number;
  tags?: string;
  notes?: string;
  collect_taxes?: number;
  accepts_email_marketing?: number;
  accepts_sms_marketing?: number;
}

const inp = {
  width: "100%", height: "2.375rem", padding: "0 0.75rem",
  background: "var(--field-fill)", border: "1px solid var(--border)",
  borderRadius: "0.375rem", color: "var(--text-primary)",
  fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const,
};
const lbl = {
  display: "block", fontSize: "0.8125rem", fontWeight: "500" as const,
  color: "var(--text-secondary)", marginBottom: "0.375rem",
};

export default component$(() => {
  const customers     = useSignal<Customer[]>([]);
  const loading       = useSignal(true);
  const search        = useSignal("");
  const showAdd       = useSignal(false);
  const showDetail    = useSignal(false);        // controls CustomerDetailSlideOver open state
  const selectedCust  = useSignal<CustomerBasic | null>(null);
  const saving        = useSignal(false);
  const error         = useSignal<string | null>(null);

  // form fields
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
  const flimit        = useSignal("0");
  const fstoreCredit  = useSignal("0");
  const fnotes        = useSignal("");
  const ftags         = useSignal("");
  const fpriceList    = useSignal("");
  const fcollectTaxes = useSignal(true);
  const femailMarketing = useSignal(false);
  const fsmsMarketing = useSignal(false);
  const priceLists    = useSignal<{ id: string; name: string; discount_pct: number }[]>([]);

  const load = $(async () => {
    loading.value = true;
    try {
      const [custs, pls] = await Promise.all([
        invoke<Customer[]>("shop_list_customers", {}),
        invoke<{ id: string; name: string; discount_pct: number }[]>("shop_list_price_lists", {}).catch(() => []),
      ]);
      customers.value = custs || [];
      priceLists.value = pls || [];
    } catch (e) {
      console.error("[Customers]", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => { await load(); });

  const filtered = useComputed$(() => {
    const q = search.value.toLowerCase();
    if (!q) return customers.value;
    return customers.value.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.gstin ?? "").toLowerCase().includes(q) ||
      (c.dl_no ?? "").toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q) ||
      (c.pincode ?? "").includes(q) ||
      (c.tags ?? "").toLowerCase().includes(q)
    );
  });

  const openDetail = $((c: Customer) => {
    selectedCust.value = c;
    showDetail.value = true;
  });

  const handleAdd = $(async () => {
    if (!fname.value.trim()) { error.value = "Name / Firm Name is required"; return; }
    saving.value = true; error.value = null;
    try {
      const parsedTags = ftags.value.trim()
        ? JSON.stringify(ftags.value.split(",").map(t => t.trim()).filter(Boolean))
        : "[]";

      await invoke("shop_create_customer", {
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
          credit_limit: parseFloat(flimit.value) || 0,
          wallet_balance: parseFloat(fstoreCredit.value) || 0,
          price_list_id: fpriceList.value || null,
          notes:        fnotes.value.trim() || null,
          tags:         parsedTags,
          collect_taxes: fcollectTaxes.value ? 1 : 0,
          accepts_email_marketing: femailMarketing.value ? 1 : 0,
          accepts_sms_marketing: fsmsMarketing.value ? 1 : 0,
          addresses:    "[]",
        },
      });
      showAdd.value = false;
      fname.value = ""; fphone.value = ""; femail.value = "";
      fgstin.value = ""; fdl_no.value = ""; fpan.value = "";
      fbilling_addr.value = ""; fcity.value = ""; fstate.value = ""; fpincode.value = "";
      flimit.value = "0"; fstoreCredit.value = "0"; fnotes.value = ""; ftags.value = ""; fpriceList.value = "";
      fcollectTaxes.value = true; femailMarketing.value = false; fsmsMarketing.value = false;
      await load();
    } catch (e) { error.value = String(e); }
    finally { saving.value = false; }
  });

  const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "22rem" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="search" placeholder="Search name, phone, GSTIN, tags, city…" value={search.value}
            onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
            style={{ ...inp, paddingLeft: "2rem" }} />
        </div>
        <button type="button" onClick$={() => { showAdd.value = !showAdd.value; error.value = null; }}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1rem", height: "2.375rem", fontSize: "0.875rem", fontWeight: "600", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Customer
        </button>
      </div>

      {/* Add form */}
      {showAdd.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1.25rem", marginBottom: "1.25rem" }}>
          <div style={{ fontWeight: "600", marginBottom: "1rem", color: "var(--text-primary)" }}>New Customer / Firm</div>
          {error.value && (
            <div style={{ padding: "0.5rem 0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem", marginBottom: "1rem" }}>{error.value}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={lbl}>Name / Firm Name *</label>
              <input type="text" value={fname.value} onInput$={(e) => { fname.value = (e.target as HTMLInputElement).value; }} placeholder="e.g. M/S VISHAL ENTERPRISES" style={inp} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input type="tel" value={fphone.value} onInput$={(e) => { fphone.value = (e.target as HTMLInputElement).value; }} placeholder="9876543210" style={inp} />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={femail.value} onInput$={(e) => { femail.value = (e.target as HTMLInputElement).value; }} placeholder="customer@email.com" style={inp} />
            </div>
            <div>
              <label style={lbl}>GSTIN</label>
              <input type="text" value={fgstin.value} onInput$={(e) => { fgstin.value = (e.target as HTMLInputElement).value; }} placeholder="10ECBPK4595M1ZE" style={inp} />
            </div>
            <div>
              <label style={lbl}>Drug License No. (DL No.)</label>
              <input type="text" value={fdl_no.value} onInput$={(e) => { fdl_no.value = (e.target as HTMLInputElement).value; }} placeholder="BR-PAT139474/139475" style={inp} />
            </div>
            <div>
              <label style={lbl}>PAN No.</label>
              <input type="text" value={fpan.value} onInput$={(e) => { fpan.value = (e.target as HTMLInputElement).value; }} placeholder="AAAAA0000A" style={inp} />
            </div>
            <div>
              <label style={lbl}>Billing Address</label>
              <input type="text" value={fbilling_addr.value} onInput$={(e) => { fbilling_addr.value = (e.target as HTMLInputElement).value; }} placeholder="RC PLACE G.M ROAD" style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <div>
                <label style={lbl}>City</label>
                <input type="text" value={fcity.value} onInput$={(e) => { fcity.value = (e.target as HTMLInputElement).value; }} placeholder="PATNA" style={inp} />
              </div>
              <div>
                <label style={lbl}>State</label>
                <input type="text" value={fstate.value} onInput$={(e) => { fstate.value = (e.target as HTMLInputElement).value; }} placeholder="BIHAR" style={inp} />
              </div>
              <div>
                <label style={lbl}>PIN / ZIP Code</label>
                <input type="text" value={fpincode.value} onInput$={(e) => { fpincode.value = (e.target as HTMLInputElement).value; }} placeholder="800004" style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>Credit Limit (₹)</label>
              <input type="number" min="0" value={flimit.value} onInput$={(e) => { flimit.value = (e.target as HTMLInputElement).value; }} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Store Credit / Wallet (₹)</label>
              <input type="number" min="0" value={fstoreCredit.value} onInput$={(e) => { fstoreCredit.value = (e.target as HTMLInputElement).value; }} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Tags (comma separated)</label>
              <input type="text" value={ftags.value} onInput$={(e) => { ftags.value = (e.target as HTMLInputElement).value; }} placeholder="VIP, Wholesale, Retail" style={inp} />
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input type="text" value={fnotes.value} onInput$={(e) => { fnotes.value = (e.target as HTMLInputElement).value; }} placeholder="Customer preferences or delivery notes…" style={inp} />
            </div>
            <div>
              <label style={lbl}>Pricing Tier / Price List</label>
              <select
                value={fpriceList.value}
                onChange$={(e) => { fpriceList.value = (e.target as HTMLSelectElement).value; }}
                style={{ ...inp, cursor: "pointer" }}
              >
                <option value="">Standard Base Pricing (Default)</option>
                {priceLists.value.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {`${pl.name}${pl.discount_pct > 0 ? ` (${pl.discount_pct}% off)` : ""}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preferences checkboxes */}
          <div style={{ display: "flex", gap: "1.5rem", margin: "1rem 0", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={fcollectTaxes.value} onChange$={(e) => { fcollectTaxes.value = (e.target as HTMLInputElement).checked; }} style={{ accentColor: "var(--accent)" }} />
              Collect Taxes (Uncheck for tax-exempt)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={femailMarketing.value} onChange$={(e) => { femailMarketing.value = (e.target as HTMLInputElement).checked; }} style={{ accentColor: "var(--accent)" }} />
              Email Marketing Opt-in
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={fsmsMarketing.value} onChange$={(e) => { fsmsMarketing.value = (e.target as HTMLInputElement).checked; }} style={{ accentColor: "var(--accent)" }} />
              SMS Marketing Opt-in
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" onClick$={() => { showAdd.value = false; error.value = null; }}
              style={{ padding: "0 1rem", height: "2.25rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}>
              Cancel
            </button>
            <button type="button" disabled={saving.value} onClick$={handleAdd}
              style={{ padding: "0 1.25rem", height: "2.25rem", background: saving.value ? "var(--muted)" : "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.875rem", fontWeight: "600", cursor: saving.value ? "not-allowed" : "pointer" }}>
              {saving.value ? "Saving…" : "Save Customer"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading.value ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>Loading customers…</div>
      ) : filtered.value.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)", background: "var(--surface-2)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
          {search.value ? "No customers match your search." : "No customers added yet."}
        </div>
      ) : (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                {["Name / Firm", "Phone / Contact", "GSTIN / DL No", "Location", "Orders", "Total Spent", "Wallet (Credit) / Limit"].map(h => (
                  <th key={h} style={{ padding: "0.625rem 0.875rem", textAlign: "left", fontWeight: "600", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.value.map(c => {
                let parsedTags: string[] = [];
                try {
                  if (c.tags) {
                    const t = JSON.parse(c.tags);
                    if (Array.isArray(t)) parsedTags = t;
                  }
                } catch {
                  if (c.tags) parsedTags = c.tags.split(",").map(t => t.trim()).filter(Boolean);
                }

                const matchedPl = c.price_list_id ? priceLists.value.find(p => p.id === c.price_list_id) : null;

                return (
                  <tr key={c.id}
                    onClick$={$(() => openDetail(c))}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 120ms" }}>
                    <td style={{ padding: "0.625rem 0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span>{c.name}</span>
                        {matchedPl && (
                          <span style={{ fontSize: "0.6875rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", color: "#10b981", borderRadius: "0.25rem", padding: "0.08rem 0.35rem", fontWeight: "600" }}>
                            {matchedPl.name} {matchedPl.discount_pct > 0 ? `(${matchedPl.discount_pct}% off)` : ""}
                          </span>
                        )}
                      </div>
                      {parsedTags.length > 0 && (
                        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
                          {parsedTags.map(tag => (
                            <span key={tag} style={{ fontSize: "0.6875rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", padding: "0.1rem 0.35rem", color: "var(--text-secondary)" }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)" }}>
                      <div>{c.phone || "—"}</div>
                      {c.email && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", fontSize: "0.8125rem", fontFamily: "monospace" }}>
                      {c.gstin && <div>GST: {c.gstin}</div>}
                      {c.dl_no && <div>DL: {c.dl_no}</div>}
                      {!c.gstin && !c.dl_no && <span>—</span>}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                      {c.city || c.state ? `${c.city ?? ""}${c.state ? `, ${c.state}` : ""}${c.pincode ? ` - ${c.pincode}` : ""}` : (c.pincode ?? "—")}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{c.total_orders}</td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: "500" }}>{fmtMoney(c.total_spent)}</td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", fontSize: "0.8125rem" }}>
                      {c.wallet_balance && c.wallet_balance > 0 ? (
                        <div style={{ fontWeight: "600", color: "#10b981" }}>Wallet: {fmtMoney(c.wallet_balance)}</div>
                      ) : null}
                      {c.credit_limit > 0 && <div style={{ fontSize: "0.725rem", color: "var(--text-secondary)" }}>Limit: {fmtMoney(c.credit_limit)}</div>}
                      {!c.wallet_balance && !c.credit_limit && <div>{c.loyalty_pts.toFixed(0)} pts</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Detail Drawer */}
      <CustomerDetailSlideOver
        open={showDetail}
        customer={selectedCust}
        onCustomerUpdated$={$(async () => {
          await load();
        })}
      />
    </>
  );
});
