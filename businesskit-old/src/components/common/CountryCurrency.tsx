// src/components/common/CountryCurrency.tsx
// Top 25 currencies list and reusable Currency components for Qwik.

import { component$, type PropFunction, $ } from "@builder.io/qwik";

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  flag: string;
}

export const TOP_25_CURRENCIES: CurrencyOption[] = [
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", flag: "🇸🇦" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { code: "KRW", name: "South Korean Won", symbol: "₩", flag: "🇰🇷" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", flag: "🇲🇽" },
  { code: "ZAR", name: "South African Rand", symbol: "R", flag: "🇿🇦" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", flag: "🇸🇪" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", flag: "🇳🇴" },
  { code: "DKK", name: "Danish Krone", symbol: "kr", flag: "🇩🇰" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", flag: "🇭🇰" },
  { code: "THB", name: "Thai Baht", symbol: "฿", flag: "🇹🇭" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", flag: "🇮🇩" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", flag: "🇻🇳" },
];

export interface CountryCurrencySelectProps {
  value: string;
  onChange$?: PropFunction<(val: string) => void>;
  class?: string;
  style?: Record<string, string | number>;
  placeholder?: string;
  allowedCodes?: string[]; // filter dropdown to only supported currencies
}

export const CountryCurrencySelect = component$<CountryCurrencySelectProps>(({
  value,
  onChange$,
  class: className,
  style,
  placeholder,
  allowedCodes,
}) => {
  const options = allowedCodes && allowedCodes.length > 0
    ? TOP_25_CURRENCIES.filter((c) => allowedCodes.includes(c.code))
    : TOP_25_CURRENCIES;

  const currentVal = value || "";

  return (
    <select
      value={currentVal}
      onChange$={(e) => onChange$?.((e.target as HTMLSelectElement).value)}
      class={className}
      style={style}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((c) => (
        <option key={c.code} value={c.code} selected={c.code === currentVal}>
          {`${c.flag} ${c.code} (${c.symbol}) — ${c.name}`}
        </option>
      ))}
    </select>
  );
});

export interface SupportedCurrenciesPickerProps {
  selectedCodes: string[];
  onChange$?: PropFunction<(codes: string[]) => void>;
}

export const SupportedCurrenciesPicker = component$<SupportedCurrenciesPickerProps>(({
  selectedCodes,
  onChange$,
}) => {
  const removeCode = $((code: string) => {
    if (selectedCodes.length <= 1) return; // Keep at least 1 currency
    const updated = selectedCodes.filter((c) => c !== code);
    onChange$?.(updated);
  });

  const addCode = $((code: string) => {
    if (!code || selectedCodes.includes(code)) return;
    const updated = [...selectedCodes, code];
    onChange$?.(updated);
  });

  const availableOptions = TOP_25_CURRENCIES.filter(
    (c) => !selectedCodes.includes(c.code)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Selected Currency Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {selectedCodes.map((code) => {
          const item = TOP_25_CURRENCIES.find((c) => c.code === code) || {
            code,
            symbol: code,
            flag: "🌐",
            name: code,
          };
          return (
            <span
              key={code}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.35rem 0.65rem",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: "600",
                border: "1px solid var(--accent)",
                background: "rgba(59,130,246,0.12)",
                color: "var(--accent)",
              }}
            >
              <span>{item.flag}</span>
              <span>{item.code}</span>
              <span style={{ opacity: 0.75, fontSize: "0.75rem" }}>({item.symbol})</span>
              {selectedCodes.length > 1 && (
                <button
                  type="button"
                  onClick$={() => removeCode(code)}
                  title={`Remove ${code}`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    padding: "0 0.125rem",
                    marginLeft: "0.125rem",
                    fontSize: "0.875rem",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          );
        })}

        {/* Dropdown to select and add additional currency */}
        {availableOptions.length > 0 && (
          <select
            value=""
            onChange$={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              if (val) addCode(val);
            }}
            class="text-input"
            style={{
              height: "34px",
              padding: "0.25rem 0.65rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--border)",
              background: "var(--surface-3)",
              color: "var(--text-secondary)",
              fontSize: "0.8125rem",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            <option value="">+ Add Accepted Currency...</option>
            {availableOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {`${c.flag} ${c.code} (${c.symbol}) — ${c.name}`}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
});
