// src/routes/dashboard/shop/settings/currency/index.tsx
//
// Multi-Currency & Custom Exchange Rate Settings Manager (Phase 4 Money Matters).
// Allows viewing, seeding, adding, and manually editing bank conversion rates.

import { component$, useSignal, useVisibleTask$, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuRefreshCw, LuPlus, LuGlobe, LuSearch } from "@qwikest/icons/lucide";
import { CountryCurrencySelect, SupportedCurrenciesPicker, TOP_25_CURRENCIES } from "~/components/common/CountryCurrency";
import { fmtDate } from "~/lib/fin-format";

export function getCurrencyInfo(code: string) {
  const item = TOP_25_CURRENCIES.find((c) => c.code === code.toUpperCase());
  return item ?? { code, symbol: code, flag: "🌐", name: code };
}

export interface CurrencyRateItem {
  id: string;
  profile_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: number;
  source: string;
}

export default component$(() => {
  const loading = useSignal(true);
  const savingSettings = useSignal(false);
  const seeding = useSignal(false);
  const error = useSignal<string | null>(null);
  const successMsg = useSignal<string | null>(null);
  const searchQuery = useSignal("");

  // Settings Signals
  const defaultCurrency = useSignal("INR");
  const supportedCurrencies = useSignal<string[]>([]);

  // Rates Table Signals
  const rates = useSignal<CurrencyRateItem[]>([]);

  // Modal / Add Form Signals
  const showModal = useSignal(false);
  const formFrom = useSignal("USD");
  const formTo = useSignal("INR");
  const formRate = useSignal("");
  const formSource = useSignal("manual");
  const modalSaving = useSignal(false);

  const loadData = $(async () => {
    loading.value = true;
    error.value = null;
    try {
      // 1. Load Settings
      const s: any = await invoke("get_settings").catch(() => null);
      if (s) {
        if (s.currency && typeof s.currency === "string" && s.currency.trim()) {
          defaultCurrency.value = s.currency.trim();
        } else {
          defaultCurrency.value = "INR";
        }
        if (s.supported_currencies) {
          try {
            const parsed = JSON.parse(s.supported_currencies);
            if (Array.isArray(parsed) && parsed.length > 0) {
              supportedCurrencies.value = parsed;
            } else {
              supportedCurrencies.value = [defaultCurrency.value];
            }
          } catch {
            supportedCurrencies.value = [defaultCurrency.value];
          }
        } else {
          supportedCurrencies.value = [defaultCurrency.value];
        }
      }

      // 2. Load Currency Rates
      const list = await invoke<CurrencyRateItem[]>("fin_list_currency_rates").catch(() => []);
      rates.value = list;

      // Auto-seed if empty
      if (list.length === 0) {
        await invoke("fin_seed_currency_rates", { baseCurrency: defaultCurrency.value }).catch(() => 0);
        const seededList = await invoke<CurrencyRateItem[]>("fin_list_currency_rates").catch(() => []);
        rates.value = seededList;
      }
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadData();
  });

  const handleSaveSettings = $(async () => {
    savingSettings.value = true;
    error.value = null;
    successMsg.value = null;
    try {
      await invoke("update_settings", {
        data: {
          currency: defaultCurrency.value,
          supported_currencies: JSON.stringify(supportedCurrencies.value),
        },
      });
      successMsg.value = "Currency preferences saved successfully!";
      setTimeout(() => { successMsg.value = null; }, 3000);
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      savingSettings.value = false;
    }
  });

  const handleSeed = $(async () => {
    seeding.value = true;
    error.value = null;
    try {
      await invoke("fin_seed_currency_rates", { baseCurrency: defaultCurrency.value });
      const updated = await invoke<CurrencyRateItem[]>("fin_list_currency_rates");
      rates.value = updated;
      successMsg.value = "Updated exchange rates with latest live market rates!";
      setTimeout(() => { successMsg.value = null; }, 3000);
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      seeding.value = false;
    }
  });

  const handleSaveRate = $(async () => {
    if (!formRate.value || parseFloat(formRate.value) <= 0) {
      error.value = "Please enter a valid exchange rate greater than 0";
      return;
    }
    modalSaving.value = true;
    error.value = null;
    try {
      await invoke("fin_set_currency_rate", {
        args: {
          from_currency: formFrom.value,
          to_currency: formTo.value || defaultCurrency.value,
          rate: parseFloat(formRate.value),
          source: formSource.value,
        },
      });
      showModal.value = false;
      formRate.value = "";
      await loadData();
      successMsg.value = "Exchange rate updated!";
      setTimeout(() => { successMsg.value = null; }, 3000);
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      modalSaving.value = false;
    }
  });

  const filteredRates = rates.value.filter((r) => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return true;
    return (
      r.from_currency.toLowerCase().includes(q) ||
      r.to_currency.toLowerCase().includes(q) ||
      r.source.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <LuGlobe style={{ width: "1.25rem", height: "1.25rem", color: "var(--accent)" }} />
            Currency & Custom Exchange Rates
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>
            Set store default billing currency, accepted storefront currencies, and custom bank/forex rates.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick$={handleSeed}
            disabled={seeding.value}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
          >
            <LuRefreshCw style={{ width: "0.875rem", height: "0.875rem" }} />
            {seeding.value ? "Updating..." : "Fetch & Update Live Rates"}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick$={() => {
              formFrom.value = "USD";
              formTo.value = defaultCurrency.value;
              formRate.value = "";
              formSource.value = "manual";
              showModal.value = true;
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
          >
            <LuPlus style={{ width: "0.875rem", height: "0.875rem" }} />
            Add / Override Rate
          </button>
        </div>
      </div>

      {/* Messages */}
      {error.value && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "0.5rem", color: "#ef4444", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error.value}
        </div>
      )}
      {successMsg.value && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "0.5rem", color: "#10b981", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {successMsg.value}
        </div>
      )}

      {/* Section 1: Store Currency Configuration */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 1rem 0" }}>Store Currency Preferences</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem", marginBottom: "1.25rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
              Default Billing Currency
            </label>
            <CountryCurrencySelect
              class="text-input"
              style={{
                width: "100%",
                height: "38px",
                padding: "0.5rem 0.75rem",
                boxSizing: "border-box",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                background: "var(--surface-3)",
                color: "var(--text-primary)",
              }}
              value={defaultCurrency.value}
              onChange$={(val: string) => defaultCurrency.value = val}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
            Accepted Currencies for Store & Billing
          </label>
          <SupportedCurrenciesPicker
            selectedCodes={supportedCurrencies.value}
            onChange$={(codes: string[]) => supportedCurrencies.value = codes}
          />
        </div>

        <div style={{ marginTop: "1.25rem", textAlign: "right" }}>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick$={handleSaveSettings}
            disabled={savingSettings.value}
          >
            {savingSettings.value ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>

      {/* Section 2: Exchange Rates Table */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: 0 }}>Custom & Bank Conversion Rates</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Used when converting foreign currency invoices & transactions
          </span>
        </div>

        {/* Search Bar & Fetch Button Header */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <LuSearch style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", width: "1rem", height: "1rem", color: "var(--text-secondary)" }} />
            <input
              type="text"
              value={searchQuery.value}
              onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
              placeholder="Search currency pair (e.g. USD, EUR, INR, manual)..."
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem 0.5rem 2.25rem",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                background: "var(--surface-3)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick$={handleSeed}
            disabled={seeding.value}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", height: "36px", whiteSpace: "nowrap", border: "1px solid var(--border)" }}
          >
            <LuRefreshCw style={{ width: "0.875rem", height: "0.875rem" }} />
            {seeding.value ? "Fetching..." : "Fetch & Update Live Rates"}
          </button>
        </div>

        {loading.value ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading exchange rates...</div>
        ) : filteredRates.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            {searchQuery.value ? `No currency pairs matching "${searchQuery.value}"` : "No exchange rates configured. Click 'Fetch & Update Live Rates' above to load live rates."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem" }}>CURRENCY PAIR</th>
                  <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem" }}>EXCHANGE RATE</th>
                  <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem" }}>EQUIVALENT</th>
                  <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem" }}>SOURCE</th>
                  <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem" }}>EFFECTIVE DATE</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem" }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((r) => {
                  const fromInfo = getCurrencyInfo(r.from_currency);
                  const toInfo = getCurrencyInfo(r.to_currency);
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.75rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        <span style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          <span>{fromInfo.flag}</span>
                          <span>{r.from_currency}</span>
                          <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>({fromInfo.symbol})</span>
                        </span>
                        <span style={{ margin: "0 0.5rem", color: "var(--text-secondary)" }}>→</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          <span>{toInfo.flag}</span>
                          <span>{r.to_currency}</span>
                          <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>({toInfo.symbol})</span>
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {r.rate.toFixed(4)}
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
                        1 {r.from_currency} ({fromInfo.symbol}) = {toInfo.symbol}{r.rate.toFixed(2)} {r.to_currency}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <span style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                          background: r.source === "manual" ? "rgba(59, 130, 246, 0.15)" : "var(--surface-3)",
                          color: r.source === "manual" ? "#3b82f6" : "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}>
                          {r.source === "manual" ? "Manual / Bank Rate" : r.source === "live_api" ? "Live API" : r.source}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                        {fmtDate(r.rate_date)}
                      </td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          style={{
                            padding: "0.3rem 0.65rem",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            background: "var(--surface-3)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                          onClick$={() => {
                            formFrom.value = r.from_currency;
                            formTo.value = r.to_currency;
                            formRate.value = String(r.rate);
                            formSource.value = "manual";
                            showModal.value = true;
                          }}
                        >
                          Edit Rate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      {showModal.value && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", width: "100%", maxWidth: "440px", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 1rem 0" }}>Set Custom Exchange Rate</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>From Currency</label>
                <CountryCurrencySelect
                  class="text-input"
                  style={{ width: "100%", height: "38px", padding: "0.5rem 0.75rem", boxSizing: "border-box", background: "var(--surface-3)" }}
                  value={formFrom.value}
                  onChange$={(val: string) => formFrom.value = val}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>To Currency (Base / Reporting)</label>
                <CountryCurrencySelect
                  class="text-input"
                  style={{ width: "100%", height: "38px", padding: "0.5rem 0.75rem", boxSizing: "border-box", background: "var(--surface-3)" }}
                  value={formTo.value}
                  onChange$={(val: string) => formTo.value = val}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Exchange / Net Bank Conversion Rate (1 {formFrom.value} = X {formTo.value})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={formRate.value}
                  onInput$={(e) => { formRate.value = (e.target as HTMLInputElement).value; }}
                  placeholder="e.g. 84.65 or net bank rate 82.10"
                  style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-3)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick$={() => { showModal.value = false; }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onClick$={handleSaveRate}
                disabled={modalSaving.value}
              >
                {modalSaving.value ? "Saving..." : "Save Exchange Rate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Currency & Custom Exchange Rates - BusinessKit",
};
