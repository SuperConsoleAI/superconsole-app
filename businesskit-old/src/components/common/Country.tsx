// src/components/common/Country.tsx
// Top 25 countries list and reusable Country select dropdown component for Qwik.

import { component$, type PropFunction } from "@builder.io/qwik";

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  currency: string;
}

export const TOP_25_COUNTRIES: CountryOption[] = [
  { code: "IN", name: "India", flag: "🇮🇳", currency: "INR" },
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  { code: "DE", name: "Germany", flag: "🇩🇪", currency: "EUR" },
  { code: "FR", name: "France", flag: "🇫🇷", currency: "EUR" },
  { code: "CA", name: "Canada", flag: "🇨🇦", currency: "CAD" },
  { code: "AU", name: "Australia", flag: "🇦🇺", currency: "AUD" },
  { code: "JP", name: "Japan", flag: "🇯🇵", currency: "JPY" },
  { code: "CN", name: "China", flag: "🇨🇳", currency: "CNY" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", currency: "SGD" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", currency: "SAR" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", currency: "BRL" },
  { code: "KR", name: "South Korea", flag: "🇰🇷", currency: "KRW" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", currency: "MXN" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", currency: "NZD" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", currency: "CHF" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", currency: "SEK" },
  { code: "NO", name: "Norway", flag: "🇳🇴", currency: "NOK" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", currency: "DKK" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰", currency: "HKD" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", currency: "THB" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", currency: "MYR" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", currency: "IDR" },
];

export interface CountrySelectProps {
  value: string;
  onChange$?: PropFunction<(val: string) => void>;
  class?: string;
  style?: Record<string, string | number>;
  placeholder?: string;
}

export const CountrySelect = component$<CountrySelectProps>(({
  value,
  onChange$,
  class: className,
  style,
  placeholder = "Select Country"
}) => {
  return (
    <select
      value={value}
      onChange$={(e) => onChange$?.((e.target as HTMLSelectElement).value)}
      class={className}
      style={style}
    >
      <option value="">{placeholder}</option>
      {TOP_25_COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {`${c.flag} ${c.name} (${c.code})`}
        </option>
      ))}
    </select>
  );
});
