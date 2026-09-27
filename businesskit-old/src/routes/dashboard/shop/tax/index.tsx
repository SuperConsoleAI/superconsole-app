// src/routes/dashboard/shop/tax/index.tsx
// Tax overview — rate list + compliance shortcuts + quick setup CTA if no regime set.

import { component$, useContext, $ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { TaxCtx } from "./layout";

const RATE_COLORS: Record<string, string> = {
  "0": "#6b7280",
  "5": "#10b981",
  "12": "#3b82f6",
  "18": "#8b5cf6",
  "28": "#ef4444",
};

export default component$(() => {
  const nav   = useNavigate();
  const store = useContext(TaxCtx);

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ height: "80px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 2s infinite", animationDelay: `${i*150}ms` }} />
        ))}
      </div>
    );
  }

  if (!store.config) {
    // No regime set — show setup CTA
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏛️</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem" }}>Set Up Your Tax System</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem", maxWidth: "400px", margin: "0 auto 1.5rem" }}>
          Choose GST, VAT, Sales Tax, or None. This takes 30 seconds and unlocks correct tax on every invoice.
        </p>
        <button type="button" class="btn btn-primary" onClick$={() => nav("/dashboard/shop/tax/settings/")}>
          Configure Tax →
        </button>
      </div>
    );
  }

  const cfg = store.config;

  return (
    <div>
      {/* Regime summary */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Active Tax Regime</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {cfg.regime === "GST" ? "🇮🇳 GST (India)"
             : cfg.regime === "VAT" ? "🇬🇧 VAT"
             : cfg.regime === "SalesTax" ? "🇺🇸 Sales Tax"
             : "🚫 No Tax"}
          </div>
          {cfg.gstin && <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>GSTIN: {cfg.gstin}</div>}
          {cfg.legal_name && <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{cfg.legal_name}</div>}
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.25rem 0.75rem", borderRadius: "999px", background: "var(--surface-3)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            {cfg.currency}
          </span>
          <button type="button" class="btn btn-secondary btn-sm" onClick$={() => nav("/dashboard/shop/tax/settings/")}>
            Edit
          </button>
        </div>
      </div>

      {/* Tax rates */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Tax Rates</h2>
          <button type="button"
            onClick$={$(async () => {
              if (cfg.regime === "GST") await invoke("fin_seed_gst_rates");
              window.location.reload();
            })}
            style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>
            Re-seed Presets
          </button>
        </div>

        {store.rates.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem" }}>
            {store.rates.map((r: any) => {
              const rateKey = String(Math.round(r.rate_pct));
              const color   = RATE_COLORS[rateKey] ?? "var(--accent)";
              const comp    = (() => { try { const c = JSON.parse(r.components); return Object.entries(c).map(([k,v]) => `${k.toUpperCase()} ${v}%`).join(" + "); } catch { return ""; } })();
              return (
                <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color, marginBottom: "0.25rem", fontVariantNumeric: "tabular-nums" }}>{r.rate_pct}%</div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: comp ? "0.25rem" : 0 }}>{r.name}</div>
                  {comp && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{comp}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            No rates yet — click "Re-seed Presets" to add default rates for {cfg.regime}
          </div>
        )}
      </div>

      {/* India compliance links */}
      {cfg.regime === "GST" && (
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0" }}>India Compliance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
            {[
              { href: "/dashboard/shop/tax/gst/", icon: "📊", label: "GST Returns", desc: "Monthly filing tracker" },
              { href: "/dashboard/shop/tax/einvoice/", icon: "🧾", label: "E-Invoice", desc: "IRN + QR code records", hidden: !cfg.einvoice_enabled },
              { href: "/dashboard/shop/tax/eway/", icon: "🚚", label: "E-Way Bill", desc: "Goods movement log", hidden: !cfg.eway_enabled },
              { href: "/dashboard/shop/tax/tds/", icon: "✂️", label: "TDS / TCS", desc: "Deductions & collections" },
            ].filter(i => !i.hidden).map(item => (
              <a key={item.href} href={item.href}
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem", textDecoration: "none", display: "block", transition: "border-color 150ms" }}>
                <div style={{ fontSize: "1.25rem", marginBottom: "0.375rem" }}>{item.icon}</div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem", marginBottom: "0.2rem" }}>{item.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{item.desc}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
