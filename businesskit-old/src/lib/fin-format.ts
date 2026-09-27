// src/lib/fin-format.ts
// Currency and date formatters for the Finance module.
// Always reads currency from the tax config — no hardcoded ₹.

/** Read the stored currency from fin_tax_config. Falls back to "INR" if not configured. */
export function getCurrency(): string {
  // Read from sessionStorage cache set by the layout provider
  if (typeof window !== "undefined" && window.__finCurrency) {
    return window.__finCurrency;
  }
  return "INR";
}

/** Returns the locale string for Intl.NumberFormat based on currency code */
function currencyLocale(currency: string): string {
  const map: Record<string, string> = {
    INR: "en-IN", USD: "en-US", GBP: "en-GB", EUR: "de-DE",
    AED: "ar-AE", SAR: "ar-SA", SGD: "en-SG", AUD: "en-AU",
    CAD: "en-CA", JPY: "ja-JP", CNY: "zh-CN",
  };
  return map[currency] ?? "en-US";
}

/**
 * Format a monetary amount with the correct currency symbol and locale.
 * @param amount  - the numeric value
 * @param currency - ISO 4217 code e.g. "INR", "USD", "GBP"
 */
export function fmtMoney(amount: number, currency?: string): string {
  const cur     = currency ?? getCurrency();
  const locale  = currencyLocale(cur);
  try {
    return new Intl.NumberFormat(locale, {
      style:                 "currency",
      currency:              cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if Intl doesn't know this currency
    return `${cur} ${Math.abs(amount).toFixed(2)}`;
  }
}

/** Short date: "27 Jul 2026" */
export function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Short datetime: "27 Jul 2026, 3:30 PM" */
export function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Set the global currency so all formatters use it (called from layouts after loading tax config) */
export function setGlobalCurrency(currency: string): void {
  if (typeof window !== "undefined") {
    (window as any).__finCurrency = currency;
  }
}

/** Helper to trigger standard browser file downloads cleanly across WebKit / Tauri / Safari */
export function downloadFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8;"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch { /* noop */ }
  }, 2000);
}

// Augment window type
declare global {
  interface Window {
    __finCurrency?: string;
  }
}
