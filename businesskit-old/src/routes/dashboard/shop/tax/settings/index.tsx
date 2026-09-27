// src/routes/dashboard/shop/tax/settings/index.tsx
// Tax regime setup & Business/POS Hardware Print Configuration
// Reads country from settings to pre-suggest the right regime.
// On save: calls fin_set_tax_regime, then fin_seed_default_accounts, then fin_seed_gst_rates.

import { component$, useSignal, useStore, useVisibleTask$, $ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { CountrySelect } from "~/components/common/Country";
import { CountryCurrencySelect } from "~/components/common/CountryCurrency";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { LuTrash2, LuPrinter, LuBuilding, LuReceipt, LuFolderOpen } from "@qwikest/icons/lucide";

const REGIMES = [
  {
    id: "GST",
    label: "GST (India)",
    desc: "Goods & Services Tax — CGST + SGST for intra-state, IGST for inter-state. Mandatory for turnover > ₹40L.",
    flag: "🇮🇳",
    suggest: ["IN"],
  },
  {
    id: "VAT",
    label: "VAT",
    desc: "Value Added Tax — used in UK, EU, Gulf (UAE, Saudi). Single rate applied to sales.",
    flag: "🇬🇧",
    suggest: ["GB", "DE", "FR", "AE", "SA", "EU"],
  },
  {
    id: "SalesTax",
    label: "Sales Tax (US)",
    desc: "US state + county + city rates. No federal VAT — varies by jurisdiction.",
    flag: "🇺🇸",
    suggest: ["US"],
  },
  {
    id: "None",
    label: "No Tax / Exempt",
    desc: "Your business is tax-exempt or below the registration threshold. No tax added to invoices.",
    flag: "🚫",
    suggest: [],
  },
];

export default component$(() => {
  const nav            = useNavigate();
  const saving         = useSignal(false);
  const done           = useSignal(false);
  const err            = useSignal<string | null>(null);
  const showSignPicker = useSignal(false);
  const seeding        = useSignal(false);
  const seedDone       = useSignal(false);
  const taxRates       = useSignal<Array<{ id: string; name: string; rate_pct: number }>>([]);
  const defaultRate    = useSignal("");
  const defaultSaved   = useSignal(false);

  const form = useStore({
    regime:              "",
    country:             "IN",
    currency:            "INR",
    tax_mode:            "item",
    global_tax_rate:     "",
    global_tax_rate_id:  "",
    tax_inclusive:       false,
    gstin:               "",
    legal_name:          "",
    dl_no:               "",
    address:             "",
    phone:               "",
    state_code:          "",
    lut_number:          "",
    lut_valid_until:     "",
    default_bill_design: "dotmatrix",
    header_top_text:     "[ OM ]",
    invoice_title_text:  "[ GST INVOICE ]",
    digital_sign_url:    "",
    signatory_name:      "",
    jurisdiction_city:   "",
    invoice_terms:       "",
    auto_print_enabled:  false,
    pos_printer_type:    "system",
    pos_printer_ip:      "",
    einvoice_enabled:    false,
    eway_enabled:        false,
  });

  const loadRates = $(async () => {
    try {
      const rates = await invoke<Array<{ id: string; name: string; rate_pct: number }>>("fin_list_tax_rates");
      taxRates.value = rates;
    } catch { /* noop */ }
  });

  const handleSeedRates = $(async () => {
    seeding.value = true;
    try {
      await invoke("fin_seed_gst_rates");
      await loadRates();
      seedDone.value = true;
    } catch { /* noop */ }
    finally { seeding.value = false; }
  });

  // Load existing config + country from settings
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const [cfg, settings, rates] = await Promise.all([
        invoke("fin_get_tax_config").catch(() => null),
        invoke("get_settings").catch(() => null) as any,
        invoke<Array<{ id: string; name: string; rate_pct: number }>>("fin_list_tax_rates").catch(() => []),
      ]);

      taxRates.value = Array.isArray(rates) ? rates : [];

      if (cfg) {
        const c = cfg as any;
        form.regime              = c.regime;
        form.country             = c.country;
        form.currency            = c.currency;
        form.tax_mode            = c.tax_mode ?? "item";
        form.global_tax_rate     = c.global_tax_rate !== undefined && c.global_tax_rate !== null ? String(c.global_tax_rate) : "";
        form.global_tax_rate_id  = c.global_tax_rate_id ?? "";
        form.tax_inclusive       = Boolean(c.tax_inclusive);
        form.gstin               = c.gstin ?? "";
        form.legal_name          = c.legal_name ?? "";
        form.dl_no               = c.dl_no ?? "";
        form.address             = c.address ?? "";
        form.phone               = c.phone ?? "";
        form.state_code          = c.state_code ?? "";
        form.lut_number          = c.lut_number ?? "";
        form.lut_valid_until     = c.lut_valid_until ? new Date(c.lut_valid_until * 1000).toISOString().slice(0, 10) : "";
        form.default_bill_design = c.default_bill_design ?? "dotmatrix";
        form.header_top_text     = c.header_top_text ?? "[ OM ]";
        form.invoice_title_text  = c.invoice_title_text ?? "[ GST INVOICE ]";
        form.digital_sign_url    = c.digital_sign_url ?? "";
        form.signatory_name      = c.signatory_name ?? "";
        form.jurisdiction_city   = c.jurisdiction_city ?? "";
        form.invoice_terms       = c.invoice_terms ?? "";
        form.auto_print_enabled  = !!c.auto_print_enabled;
        form.pos_printer_type    = c.pos_printer_type ?? "system";
        form.pos_printer_ip      = c.pos_printer_ip ?? "";
        form.einvoice_enabled    = !!c.einvoice_enabled;
        form.eway_enabled        = !!c.eway_enabled;
      } else if (settings) {
        // Pre-suggest regime from settings.country
        const country = settings.country ?? "IN";
        form.country  = country;
        form.currency = settings.currency ?? "INR";
        // Auto-suggest
        const suggestion = REGIMES.find(r => r.suggest.includes(country));
        if (suggestion) form.regime = suggestion.id;
      }
    } catch { /* noop */ }

    // Load current default rate
    try {
      const def = await invoke<string | null>("fin_get_default_tax_rate");
      if (def) defaultRate.value = def;
    } catch { /* noop */ }
  });

  const handleSave = $(async () => {
    if (!form.regime) { err.value = "Please choose a tax regime."; return; }
    saving.value = true;
    err.value    = null;
    try {
      const lutTimestamp = form.lut_valid_until ? Math.floor(new Date(form.lut_valid_until).getTime() / 1000) : null;
      await invoke("fin_set_tax_regime", {
        args: {
          regime:              form.regime,
          country:             form.country,
          currency:            form.currency,
          tax_mode:            form.tax_mode,
          global_tax_rate:     form.tax_mode === "global" && form.global_tax_rate ? parseFloat(form.global_tax_rate) : null,
          global_tax_rate_id:  form.tax_mode === "global" && form.global_tax_rate_id ? form.global_tax_rate_id : null,
          tax_inclusive:       form.tax_inclusive,
          gstin:               form.gstin               || null,
          legal_name:          form.legal_name          || null,
          dl_no:               form.dl_no               || null,
          address:             form.address             || null,
          phone:               form.phone               || null,
          state_code:          form.state_code          || null,
          lut_number:          form.lut_number.trim()   || null,
          lut_valid_until:     lutTimestamp,
          default_bill_design: form.default_bill_design || "dotmatrix",
          header_top_text:     form.header_top_text     || "[ OM ]",
          invoice_title_text:  form.invoice_title_text  || "[ GST INVOICE ]",
          digital_sign_url:    form.digital_sign_url    || null,
          signatory_name:      form.signatory_name      || null,
          jurisdiction_city:   form.jurisdiction_city   || null,
          invoice_terms:       form.invoice_terms       || null,
          auto_print_enabled:  form.auto_print_enabled,
          pos_printer_type:    form.pos_printer_type,
          pos_printer_ip:      form.pos_printer_ip      || null,
          einvoice_enabled:    form.einvoice_enabled,
          eway_enabled:        form.eway_enabled,
        },
      });
      // Seed chart of accounts (idempotent)
      await invoke("fin_seed_default_accounts");
      done.value = true;
      setTimeout(() => nav("/dashboard/shop/tax/"), 800);
    } catch (e: any) {
      err.value = e?.message ?? String(e);
    } finally {
      saving.value = false;
    }
  });

  return (
    <div class="tax-settings-page">
      <style>{`
        .tax-settings-page {
          width: 100%;
          box-sizing: border-box;
        }
        .tax-card {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-md, 0.75rem);
          padding: 1.25rem;
          margin-bottom: 1.25rem;
          box-sizing: border-box;
        }
        .tax-inner-box {
          background: var(--surface-1);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm, 0.5rem);
          padding: 1rem;
          margin-top: 1rem;
          box-sizing: border-box;
        }
        .tax-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .tax-field-row {
          margin-top: 1rem;
        }
        .tax-regime-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .tax-mode-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .bill-design-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
        }
        .tax-choice-btn {
          padding: 0.875rem 1rem;
          border-radius: var(--radius-sm, 0.5rem);
          cursor: pointer;
          text-align: left;
          transition: all var(--transition-fast);
        }
        @media (max-width: 640px) {
          .tax-card {
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: var(--radius-sm, 0.5rem);
          }
          .tax-inner-box {
            padding: 0.875rem;
            margin-top: 0.875rem;
          }
          .tax-grid-2 {
            grid-template-columns: 1fr !important;
            gap: 0.875rem;
          }
          .tax-field-row {
            margin-top: 0.875rem;
          }
          .tax-mode-grid {
            grid-template-columns: 1fr !important;
            gap: 0.75rem;
            margin-bottom: 0.875rem;
          }
          .tax-regime-grid {
            grid-template-columns: 1fr !important;
            gap: 0.75rem;
            margin-bottom: 0.875rem;
          }
          .bill-design-grid {
            grid-template-columns: 1fr !important;
            gap: 0.75rem;
          }
          .tax-choice-btn {
            padding: 0.75rem 0.875rem !important;
          }
          .tax-save-btn {
            width: 100% !important;
            display: flex;
            justify-content: center;
          }
        }
      `}</style>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.375rem 0" }}>Tax &amp; Invoice Settings</h1>
      <p style={{ color: "var(--text-secondary)", margin: "0 0 1.25rem 0", fontSize: "0.875rem" }}>
        Configure tax calculation, business invoice headers, default print templates, and hardware thermal POS auto-printing.
      </p>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* BOX 1: TAX REGIME & CURRENCY                                      */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div class="tax-card">
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.875rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>🌐</span> Tax Regime &amp; Regional Setup
        </h3>

        {/* Regime selector */}
        <div class="tax-regime-grid">
          {REGIMES.map(r => {
            const selected = form.regime === r.id;
            return (
              <button key={r.id} type="button"
                class="tax-choice-btn"
                onClick$={() => { form.regime = r.id; }}
                style={{
                  border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: selected ? "rgba(99,102,241,0.08)" : "var(--surface-1)",
                }}>
                <div style={{ fontSize: "1.25rem", marginBottom: "0.375rem" }}>{r.flag}</div>
                <div style={{ fontWeight: 700, fontSize: "0.875rem", color: selected ? "var(--accent)" : "var(--text-primary)", marginBottom: "0.25rem" }}>{r.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.35 }}>{r.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Country + Currency row */}
        <div class="tax-grid-2 tax-field-row">
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>Country</label>
            <CountrySelect
              value={form.country}
              onChange$={$((val: string) => {
                form.country = val;
                const suggestion = REGIMES.find(r => r.suggest.includes(val));
                if (suggestion) form.regime = suggestion.id;
              })}
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>Home Currency</label>
            <CountryCurrencySelect
              value={form.currency}
              onChange$={$((val: string) => { form.currency = val; })}
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* BOX 2: TAX CALCULATION & COLLECTION MODE (SHOPIFY / INDUSTRY STANDARD) */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {form.regime !== "None" && (
        <div class="tax-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>⚖️</span> Tax Collection Mode
            </h3>
            <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--surface-1)", padding: "0.15rem 0.5rem", borderRadius: "1rem", border: "1px solid var(--border)" }}>
              Industry Standard
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0 0 0.875rem 0" }}>
            Choose how taxes are determined and applied across your product catalog and checkout bills.
          </p>

          {/* Mode toggle cards */}
          <div class="tax-mode-grid">
            {/* Option 1: Item-Level Slabs */}
            <button
              type="button"
              class="tax-choice-btn"
              onClick$={() => { form.tax_mode = "item"; }}
              style={{
                border: form.tax_mode === "item" ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: form.tax_mode === "item" ? "rgba(99,102,241,0.08)" : "var(--surface-1)",
              }}
            >
              <div style={{ fontSize: "1.25rem", marginBottom: "0.375rem" }}>📦</div>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: form.tax_mode === "item" ? "var(--accent)" : "var(--text-primary)", marginBottom: "0.25rem" }}>
                Item-Level Tax Slabs (Default)
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.35 }}>
                Each product uses its individual tax slab (e.g. 0%, 5%, 12%, 18%, 28%). Standard for Indian GST and European VAT.
              </div>
            </button>

            {/* Option 2: Global Flat Rate */}
            <button
              type="button"
              class="tax-choice-btn"
              onClick$={$(async () => {
                form.tax_mode = "global";
                defaultRate.value = "";
                try {
                  await invoke("fin_set_default_tax_rate", { rateId: "" });
                } catch { /* noop */ }
              })}
              style={{
                border: form.tax_mode === "global" ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: form.tax_mode === "global" ? "rgba(99,102,241,0.08)" : "var(--surface-1)",
              }}
            >
              <div style={{ fontSize: "1.25rem", marginBottom: "0.375rem" }}>🌐</div>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: form.tax_mode === "global" ? "var(--accent)" : "var(--text-primary)", marginBottom: "0.25rem" }}>
                Global Flat Tax Rate (Shopify Style)
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.35 }}>
                A single flat rate is applied at checkout to all taxable goods. Items marked Exempt / Nil remain tax-free.
              </div>
            </button>
          </div>

          {/* Global Tax Rate Selection directly from seeded fin_tax_rates */}
          {form.tax_mode === "global" && (
            <div class="tax-inner-box">
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                Select Global Checkout Tax Rate:
              </label>

              {/* Selectable chips directly from seeded rates in fin_tax_rates */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.625rem" }}>
                {taxRates.value.filter(r => r.rate_pct > 0).map(r => {
                  const isSelected = form.global_tax_rate_id === r.id || (form.global_tax_rate === String(r.rate_pct) && !form.global_tax_rate_id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick$={() => {
                        form.global_tax_rate_id = r.id;
                        form.global_tax_rate = String(r.rate_pct);
                      }}
                      style={{
                        padding: "0.45rem 0.75rem",
                        borderRadius: "var(--radius-sm)",
                        border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                        background: isSelected ? "var(--accent)" : "var(--surface-2)",
                        color: isSelected ? "var(--button-primary-text)" : "var(--text-primary)",
                        fontWeight: isSelected ? "700" : "500",
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <span>{r.name}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          padding: "0.12rem 0.45rem",
                          borderRadius: "0.25rem",
                          background: isSelected ? "rgba(128, 128, 128, 0.25)" : "var(--surface-3)",
                          color: isSelected ? "var(--button-primary-text)" : "var(--text-primary)",
                          border: `1px solid ${isSelected ? "rgba(128, 128, 128, 0.35)" : "var(--border)"}`,
                          fontSize: "0.75rem",
                          lineHeight: "1.2",
                        }}
                      >
                        {r.rate_pct}%
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                💡 <em>This rate applies at checkout across all taxable goods. Items marked Exempt / Nil remain tax-free. Default product rates are disabled in this mode.</em>
              </div>
            </div>
          )}

          {/* Tax Inclusive vs Tax Exclusive Pricing Setting */}
          <div class="tax-inner-box">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>Tax-Inclusive Pricing (MRP / Prices include tax)</span>
                  {form.tax_inclusive ? (
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "1rem", background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
                      Inclusive (Tax in Price)
                    </span>
                  ) : (
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "1rem", background: "rgba(99, 102, 241, 0.12)", color: "var(--accent)" }}>
                      Exclusive (Tax Added on Top)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.3rem", lineHeight: 1.4 }}>
                  {form.tax_inclusive
                    ? "Prices entered include tax. Tax is calculated by deducting backwards from the price (e.g. ₹118 @ 18% GST → Base ₹100 + ₹18 Tax = ₹118 final price). New products default to Tax-Inclusive."
                    : "Prices entered are before tax. Tax is calculated and added on top of the price at checkout (e.g. ₹100 @ 18% GST → ₹100 + ₹18 Tax = ₹118 final price). New products default to Tax-Exclusive."}
                </div>
              </div>
              <label style={{ position: "relative", display: "inline-block", width: "2.5rem", height: "1.375rem", flexShrink: 0, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.tax_inclusive}
                  onChange$={(e) => { form.tax_inclusive = (e.target as HTMLInputElement).checked; }}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: "absolute",
                    cursor: "pointer",
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: form.tax_inclusive ? "#10b981" : "var(--surface-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "1.5rem",
                    transition: "all 200ms",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      height: "1rem",
                      width: "1rem",
                      left: form.tax_inclusive ? "1.25rem" : "0.15rem",
                      bottom: "0.1rem",
                      background: "#fff",
                      borderRadius: "50%",
                      transition: "all 200ms",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* BOX 3: TAX RATE SLABS & DEFAULT RATE (DIRECTLY BELOW MODE)        */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {(form.regime === "GST" || taxRates.value.length > 0) && (
        <div class="tax-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: taxRates.value.length > 0 ? "0.875rem" : 0 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Tax Rate Slabs</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                {taxRates.value.length > 0
                  ? `${taxRates.value.length} rates active in database`
                  : "Seed standard GST slabs (0%, 5%, 12%, 18%, 28%)"}
              </div>
            </div>
            <button type="button" class="btn btn-secondary" onClick$={handleSeedRates}
              disabled={seeding.value} style={{ height: "32px", fontSize: "0.75rem", padding: "0 0.75rem" }}>
              {seeding.value ? "Seeding…" : seedDone.value ? "✓ Re-seed" : "Seed GST Rates"}
            </button>
          </div>

          {taxRates.value.length > 0 && (
            <>
              {/* Rate list */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.875rem" }}>
                {taxRates.value.map(r => (
                  <span key={r.id} style={{
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    background: "var(--surface-3,var(--surface-1))",
                    border: "1px solid var(--border)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}>
                    {r.name} · {r.rate_pct}%
                  </span>
                ))}
              </div>

              {/* Default rate picker */}
              <div class="tax-field-row">
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                  Default Rate for New Products
                </label>
                {form.tax_mode === "global" ? (
                  <div style={{ padding: "0.55rem 0.75rem", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", border: "1px dashed var(--border)", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    🔒 Default product rate is unneeded in <strong>Global Flat Tax Rate</strong> mode ({form.global_tax_rate ? `${form.global_tax_rate}%` : "flat rate"} applies automatically).
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
                    <select
                      value={defaultRate.value}
                      onChange$={$(async (e) => {
                        const v = (e.target as HTMLSelectElement).value;
                        defaultRate.value = v;
                        defaultSaved.value = false;
                        try {
                          await invoke("fin_set_default_tax_rate", { rateId: v });
                          defaultSaved.value = true;
                          setTimeout(() => { defaultSaved.value = false; }, 2000);
                        } catch { /* noop */ }
                      })}
                      style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
                    >
                      <option value="">— No default (set per-product) —</option>
                      {taxRates.value.map(r => (
                        <option key={r.id} value={r.id}>
                          {`${r.name} — ${r.rate_pct}%`}
                        </option>
                      ))}
                    </select>
                    {defaultSaved.value && (
                      <span style={{ fontSize: "0.75rem", color: "#10b981", whiteSpace: "nowrap" }}>Saved ✓</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* BOX 4: TAX COMPLIANCE & LEGAL IDs (GST / DL NO)                  */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div class="tax-card">
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.875rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <LuReceipt class="w-4 h-4 text-accent" /> Tax Compliance &amp; Registration
        </h3>

        <div class="tax-grid-2">
          {form.regime === "GST" && (
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                GSTIN / Tax Registration No.
              </label>
              <input
                value={form.gstin}
                onInput$={(e) => { form.gstin = (e.target as HTMLInputElement).value; }}
                placeholder="22AAAAA0000A1Z5"
                style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Drug License No. (DL No.)
              <span style={{ fontSize: "0.7rem", marginLeft: "0.375rem", color: "var(--text-secondary)" }}>(pharma)</span>
            </label>
            <input
              value={form.dl_no}
              onInput$={(e) => { form.dl_no = (e.target as HTMLInputElement).value; }}
              placeholder="BR-PAT139474/139475"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {form.regime === "GST" && (
          <>
            {/* Letter of Undertaking (LUT) */}
            <div style={{ marginTop: "1rem", paddingTop: "0.875rem", borderTop: "1px dashed var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                  Letter of Undertaking (LUT) — Zero-Rated Exports &amp; SEZ
                </div>
                {form.lut_number && (
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "1rem", background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
                    LUT Active
                  </span>
                )}
              </div>
              <div class="tax-grid-2 tax-field-row">
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                    LUT Application ARN / Number
                  </label>
                  <input
                    value={form.lut_number}
                    onInput$={(e) => { form.lut_number = (e.target as HTMLInputElement).value; }}
                    placeholder="AD270324000123A"
                    style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                    LUT Valid Until
                  </label>
                  <input
                    type="date"
                    value={form.lut_valid_until}
                    onInput$={(e) => { form.lut_valid_until = (e.target as HTMLInputElement).value; }}
                    style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginTop: "1rem", paddingTop: "0.875rem", borderTop: "1px dashed var(--border)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.8125rem" }}>
                <input type="checkbox" checked={form.einvoice_enabled}
                  onChange$={(e) => { form.einvoice_enabled = (e.target as HTMLInputElement).checked; }} />
                E-Invoice required (&gt; ₹5Cr)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.8125rem" }}>
                <input type="checkbox" checked={form.eway_enabled}
                  onChange$={(e) => { form.eway_enabled = (e.target as HTMLInputElement).checked; }} />
                E-Way Bill required (&gt; ₹50K)
              </label>
            </div>
          </>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* BOX 5: BUSINESS PROFILE & INVOICE HEADER                          */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div class="tax-card">
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.875rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <LuBuilding class="w-4 h-4 text-accent" /> Business Details &amp; Invoice Header
        </h3>
        
        {/* Legal Name + Phone row */}
        <div class="tax-grid-2">
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Legal Business Name / Firm Name
            </label>
            <input
              value={form.legal_name}
              onInput$={(e) => { form.legal_name = (e.target as HTMLInputElement).value; }}
              placeholder="MAA JAGDAMBA PHARMA"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Business Contact Phone / Mobile
            </label>
            <input
              value={form.phone}
              onInput$={(e) => { form.phone = (e.target as HTMLInputElement).value; }}
              placeholder="9051427807, 7250325147"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {/* Address */}
        <div class="tax-field-row">
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
            Full Business Address (printed on invoices)
          </label>
          <input
            value={form.address}
            onInput$={(e) => { form.address = (e.target as HTMLInputElement).value; }}
            placeholder="RC PLACE G.M ROAD, PATNA"
            style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
          />
        </div>

        {/* State Code + Jurisdiction City */}
        <div class="tax-grid-2 tax-field-row">
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              State &amp; State Code
              <span style={{ fontSize: "0.7rem", marginLeft: "0.375rem", color: "var(--text-secondary)" }}>(e.g. BIHAR[10])</span>
            </label>
            <input
              value={form.state_code}
              onInput$={(e) => { form.state_code = (e.target as HTMLInputElement).value; }}
              placeholder="BIHAR[10]"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Jurisdiction City
              <span style={{ fontSize: "0.7rem", marginLeft: "0.375rem", color: "var(--text-secondary)" }}>(e.g. PATNA)</span>
            </label>
            <input
              value={form.jurisdiction_city}
              onInput$={(e) => { form.jurisdiction_city = (e.target as HTMLInputElement).value; }}
              placeholder="PATNA"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {/* Top Header Inscription + Invoice Title */}
        <div class="tax-grid-2 tax-field-row">
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Top Header Inscription
              <span style={{ fontSize: "0.7rem", marginLeft: "0.375rem", color: "var(--text-secondary)" }}>(e.g. [ OM ])</span>
            </label>
            <input
              value={form.header_top_text}
              onInput$={(e) => { form.header_top_text = (e.target as HTMLInputElement).value; }}
              placeholder="[ OM ]"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Invoice Title
              <span style={{ fontSize: "0.7rem", marginLeft: "0.375rem", color: "var(--text-secondary)" }}>(e.g. TAX INVOICE)</span>
            </label>
            <input
              value={form.invoice_title_text}
              onInput$={(e) => { form.invoice_title_text = (e.target as HTMLInputElement).value; }}
              placeholder="[ GST INVOICE ]"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {/* Signatory + Digital Signature */}
        <div class="tax-grid-2 tax-field-row">
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Signatory Name / Label
            </label>
            <input
              value={form.signatory_name}
              onInput$={(e) => { form.signatory_name = (e.target as HTMLInputElement).value; }}
              placeholder="For: MAA JAGDAMBA PHARMA"
              style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Digital Signature Image / Stamp
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
              <input
                value={form.digital_sign_url}
                onInput$={(e) => { form.digital_sign_url = (e.target as HTMLInputElement).value; }}
                placeholder="Image URL or browse"
                style={{ flex: 1, minWidth: 0, width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick$={() => { showSignPicker.value = true; }}
                class="btn btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0 0.75rem", height: "2.375rem", fontSize: "0.8125rem", whiteSpace: "nowrap", flexShrink: 0 }}
                title="Browse Media Library for Signature"
              >
                <LuFolderOpen class="w-3.5 h-3.5" />
                Browse
              </button>
              {form.digital_sign_url && (
                <button
                  type="button"
                  onClick$={() => { form.digital_sign_url = ""; }}
                  class="btn btn-ghost"
                  style={{ padding: "0.4rem", color: "#ef4444", height: "2.375rem", flexShrink: 0 }}
                  title="Remove Signature"
                >
                  <LuTrash2 class="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Signature Preview Thumbnail */}
            {form.digital_sign_url && (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.625rem", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)" }}>
                <img
                  src={form.digital_sign_url}
                  alt="Sign preview"
                  width={100}
                  height={30}
                  style={{ maxHeight: "30px", maxWidth: "100px", objectFit: "contain", background: "#ffffff", padding: "2px", borderRadius: "2px", border: "1px solid var(--border)" }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Preview</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* BOX 6: INVOICE & POS HARDWARE PRINT SETTINGS                      */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div class="tax-card">
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.875rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <LuPrinter class="w-4 h-4 text-accent" /> Invoice Design &amp; POS Hardware Print Settings
        </h3>

        {/* Default Bill Format Selector */}
        <div class="tax-inner-box" style={{ marginTop: 0, marginBottom: "0.875rem" }}>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Default Bill Print Template / Design
          </label>
          <div class="bill-design-grid">
            {[
              { id: "dotmatrix", label: "Dot Matrix / Pharma", desc: "Continuous tractor-feed paper with batch & expiry", icon: "🖨️" },
              { id: "thermal",   label: "Thermal POS Roll", desc: "80mm/58mm vertical receipt roll", icon: "🧾" },
              { id: "standard",  label: "Standard Business (A4)", desc: "Corporate invoice with full breakdown", icon: "📄" },
            ].map(d => {
              const isSel = form.default_bill_design === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  class="tax-choice-btn"
                  onClick$={() => { form.default_bill_design = d.id; }}
                  style={{
                    border: isSel ? "2px solid var(--accent)" : "1px solid var(--border)",
                    background: isSel ? "rgba(99,102,241,0.08)" : "var(--surface-2)",
                  }}
                >
                  <div style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>{d.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: isSel ? "var(--accent)" : "var(--text-primary)" }}>{d.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem", lineHeight: 1.3 }}>{d.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* POS Receipt Auto-Print & Hardware Card */}
        <div class="tax-inner-box">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <span>⚡</span> Auto-Print Receipt on POS Settlement (Zero-Click)
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.3rem", lineHeight: 1.4 }}>
                Automatically send the bill to the printer and trigger mechanical auto-cut immediately when a sale is charged, without opening manual print popups.
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}>
              <div style={{
                position: "relative",
                width: "40px",
                height: "22px",
                background: form.auto_print_enabled ? "#10b981" : "rgba(128,128,128,0.35)",
                borderRadius: "24px",
                transition: "background 0.25s ease",
                border: "1px solid var(--border)",
              }}>
                <input
                  type="checkbox"
                  checked={form.auto_print_enabled}
                  onChange$={(e) => { form.auto_print_enabled = (e.target as HTMLInputElement).checked; }}
                  style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 1, margin: 0 }}
                />
                <div style={{
                  position: "absolute",
                  top: "2px",
                  left: form.auto_print_enabled ? "19px" : "2px",
                  width: "16px",
                  height: "16px",
                  background: "#ffffff",
                  borderRadius: "50%",
                  transition: "left 0.25s ease",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.35)",
                  pointerEvents: "none",
                }} />
              </div>
            </label>
          </div>

          {form.auto_print_enabled && (
            <div class="tax-grid-2 tax-field-row" style={{ paddingTop: "0.875rem", borderTop: "1px dashed var(--border)" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                  POS Printer Connection
                </label>
                <select
                  value={form.pos_printer_type}
                  onChange$={(e) => { form.pos_printer_type = (e.target as HTMLSelectElement).value; }}
                  style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: "0.875rem" }}
                >
                  <option value="system">OS System Default Printer (AirPrint / USB / Bluetooth / Preview)</option>
                  <option value="escpos_network">Network Thermal Printer (Direct TCP RAW Socket e.g. Port 9100)</option>
                </select>
              </div>

              {form.pos_printer_type === "escpos_network" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                    Printer IP Address &amp; Port
                  </label>
                  <input
                    value={form.pos_printer_ip}
                    onInput$={(e) => { form.pos_printer_ip = (e.target as HTMLInputElement).value; }}
                    placeholder="192.168.1.100:9100"
                    style={{ width: "100%", height: "2.375rem", padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Invoice Terms */}
        <div class="tax-field-row">
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
            Invoice Terms &amp; Conditions
            <span style={{ fontSize: "0.7rem", marginLeft: "0.375rem", color: "var(--text-secondary)" }}>(printed at bottom of invoices)</span>
          </label>
          <textarea
            value={form.invoice_terms}
            onInput$={(e) => { form.invoice_terms = (e.target as HTMLTextAreaElement).value; }}
            rows={3}
            placeholder={`Payment is due within 30 days of invoice date. Goods once sold are not returnable unless defective. All disputes are subject to local jurisdiction. E. & O. E.`}
            style={{ width: "100%", padding: "0.55rem 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.8125rem", lineHeight: "1.45", resize: "vertical", minHeight: "4.75rem", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
      </div>

      {err.value && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--radius-sm)", padding: "0.625rem 0.875rem", color: "#ef4444", fontSize: "0.8125rem", marginBottom: "0.875rem" }}>
          {err.value}
        </div>
      )}

      {done.value && (
        <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "var(--radius-sm)", padding: "0.625rem 0.875rem", color: "#10b981", fontSize: "0.8125rem", marginBottom: "0.875rem" }}>
          ✓ Tax regime &amp; print configuration saved. Redirecting…
        </div>
      )}

      <button type="button" class="btn btn-primary tax-save-btn" onClick$={handleSave}
        disabled={saving.value || !form.regime}
        style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem" }}
      >
        {saving.value ? "Saving…" : "Save & Continue →"}
      </button>

      {/* Media Picker Modal for Signature Image */}
      <MediaPickerModal
        open={showSignPicker}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          form.digital_sign_url = media.url || media.local_url || "";
          showSignPicker.value = false;
        })}
      />
    </div>
  );
});
