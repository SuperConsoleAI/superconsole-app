// src/routes/dashboard/content/subscribers/index.tsx
//
// WHAT:  Subscribers management page for Content / Newsletters.
//        Displays subscriber list, status badges, referrer info, and stats.
//
// HOW:   Uses `list_subscribers` IPC command with pagination.
//        Row design matches the movements tab from shop/products/inventory/index.tsx.
//        Lazy-loads 40 rows at a time with "Load 40 more" button.

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  useStylesScoped$,
  $,
} from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "~/lib/app-context";
import {
  LuSearch,
  LuUsers,
  LuUserCheck,
  LuUserX,
  LuBan,
  LuLoader,
  LuMail,
  LuTrendingUp,
  LuGlobe,
} from "@qwikest/icons/lucide";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriberRow {
  id: string;
  profile_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  referrer_domain: string | null;
  timezone: string | null;
  browser_name: string | null;
  os_name: string | null;
  device_type: string | null;
  country: string | null;
  city: string | null;
  is_blocked: boolean;
  is_unsubscribed: boolean;
  blocked_at: number | null;
  unsubscribed_at: number | null;
  block_reason: string | null;
  topics: string;
  signup_timestamp: number;
}

// ── Scoped styles — matching Inventory movements tab toggle ─────────────────────

const STYLES = `
  .sub-toggle {
    display: flex;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
    align-items: center;
  }
  .sub-tab {
    padding: 0 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    height: 100%;
    box-sizing: border-box;
    transition: background 0.15s, color 0.15s;
    border: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .sub-tab.active {
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  }
  .sub-tab.inactive {
    background: transparent;
    color: var(--text-secondary);
  }
  .sub-tab.inactive:hover {
    color: var(--text-primary);
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE = 40;

const fmtDate = (ts: number) => {
  if (!ts) return "—";
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
  );
};

const getStatusInfo = (sub: SubscriberRow) => {
  if (sub.is_blocked) {
    return { label: "Blocked", color: "var(--error)", bg: "rgba(239,68,68,0.12)" };
  }
  if (sub.is_unsubscribed) {
    return { label: "Unsubscribed", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  }
  return { label: "Active", color: "#22c55e", bg: "rgba(34,197,94,0.1)" };
};

const thL = {
  padding: "0.625rem 0.75rem",
  textAlign: "left" as const,
  fontWeight: "600" as const,
  color: "var(--text-secondary)",
  fontSize: "0.75rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap" as const,
};
const thR = { ...thL, textAlign: "right" as const };

// ── Main Component ────────────────────────────────────────────────────────────

export default component$(() => {
  useStylesScoped$(STYLES);
  const appState = useAppContext();

  const subscribers = useSignal<SubscriberRow[]>([]);
  const loading = useSignal(true);
  const loadingMore = useSignal(false);
  const hasMore = useSignal(true);
  const offset = useSignal(0);
  const search = useSignal("");
  const statusFilter = useSignal<"all" | "active" | "unsubscribed" | "blocked">("all");

  const totalCount = useSignal(0);
  const activeCount = useSignal(0);
  const unsubCount = useSignal(0);
  const blockCount = useSignal(0);

  const fetchSubscribersPage = $(async (reset: boolean) => {
    const currentOffset = reset ? 0 : offset.value;
    if (reset) {
      loading.value = true;
      hasMore.value = true;
    } else {
      loadingMore.value = true;
    }

    try {
      const page = await invoke<SubscriberRow[]>("list_subscribers", {
        opts: {
          status: statusFilter.value,
          search: search.value.trim() || null,
          limit: PAGE,
          offset: currentOffset,
        },
      });

      if (reset) {
        subscribers.value = page;
      } else {
        subscribers.value = [...subscribers.value, ...page];
      }

      offset.value = currentOffset + page.length;
      hasMore.value = page.length === PAGE;

      if (reset && !search.value.trim() && statusFilter.value === "all") {
        totalCount.value = page.length;
        activeCount.value = page.filter((s) => !s.is_blocked && !s.is_unsubscribed).length;
        unsubCount.value = page.filter((s) => s.is_unsubscribed).length;
        blockCount.value = page.filter((s) => s.is_blocked).length;
      }
    } catch (e) {
      console.error("Failed to load subscribers:", e);
    } finally {
      loading.value = false;
      loadingMore.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => appState.activeProfileId.value);
    track(() => statusFilter.value);

    if (appState.activeProfileId.value) {
      fetchSubscribersPage(true);
    }
  });

  const filteredSubscribers = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    if (!q) return subscribers.value;
    return subscribers.value.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.referrer_domain ?? "").toLowerCase().includes(q) ||
        (s.country ?? "").toLowerCase().includes(q)
    );
  });

  const handleBlock$ = $(async (subscriberId: string) => {
    const ok = typeof window === "undefined" ? true : window.confirm("Block this subscriber?");
    if (!ok) return;
    try {
      await invoke("block_subscriber", { subscriberId, reason: "Manual block from dashboard" });
      subscribers.value = subscribers.value.map((s) =>
        s.id === subscriberId ? { ...s, is_blocked: true, blocked_at: Math.floor(Date.now() / 1000) } : s
      );
    } catch (e) {
      console.error("Failed to block subscriber:", e);
    }
  });

  const handleUnsubscribe$ = $(async (subscriberId: string) => {
    const ok = typeof window === "undefined" ? true : window.confirm("Unsubscribe this member?");
    if (!ok) return;
    try {
      await invoke("unsubscribe_subscriber", { subscriberId });
      subscribers.value = subscribers.value.map((s) =>
        s.id === subscriberId ? { ...s, is_unsubscribed: true, unsubscribed_at: Math.floor(Date.now() / 1000) } : s
      );
    } catch (e) {
      console.error("Failed to unsubscribe subscriber:", e);
    }
  });

  return (
    <div>
      {/* ── 1. Stats Cards ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        {[
          { label: "Total Subscribers", value: String(subscribers.value.length), icon: LuUsers, color: "var(--text-primary)" },
          { label: "Active", value: String(subscribers.value.filter((s) => !s.is_blocked && !s.is_unsubscribed).length), icon: LuUserCheck, color: "#22c55e" },
          {
            label: "Active Rate",
            value: `${Math.round(
              (subscribers.value.filter((s) => !s.is_blocked && !s.is_unsubscribed).length /
                Math.max(subscribers.value.length, 1)) *
                100
            )}%`,
            icon: LuTrendingUp,
            color: "#6366f1",
          },
          { label: "Unsubscribed", value: String(subscribers.value.filter((s) => s.is_unsubscribed).length), icon: LuUserX, color: "#f59e0b" },
          { label: "Blocked", value: String(subscribers.value.filter((s) => s.is_blocked).length), icon: LuBan, color: "var(--error)" },
          {
            label: "Direct Referrals",
            value: String(subscribers.value.filter((s) => !s.referrer_domain || s.referrer_domain === "Direct").length),
            icon: LuGlobe,
            color: "#06b6d4",
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "1.375rem",
                  fontWeight: "700",
                  color: card.color,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.2,
                }}
              >
                {card.value}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                {card.label}
              </div>
            </div>
            <card.icon style={{ width: "1.25rem", height: "1.25rem", color: "var(--text-secondary)", opacity: 0.6 }} />
          </div>
        ))}
      </div>

      {/* ── 2. Toolbar: [Search] ----------- [Filter Toggle] ─────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {/* Search on left */}
        <div style={{ position: "relative", flex: 1, minWidth: "12rem", maxWidth: "22rem" }}>
          <span
            style={{
              position: "absolute",
              left: "0.65rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-secondary)",
              pointerEvents: "none",
              display: "flex",
            }}
          >
            <LuSearch style={{ width: "14px", height: "14px" }} />
          </span>
          <input
            type="search"
            placeholder="Search email, name or domain..."
            value={search.value}
            onInput$={(e) => {
              search.value = (e.target as HTMLInputElement).value;
            }}
            style={{
              width: "100%",
              height: "2.25rem",
              paddingLeft: "2rem",
              paddingRight: "0.75rem",
              background: "var(--field-fill)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              color: "var(--text-primary)",
              fontSize: "0.875rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Status Pill Toggle */}
        <div class="sub-toggle">
          {(["all", "active", "unsubscribed", "blocked"] as const).map((st) => (
            <button
              key={st}
              type="button"
              class={`sub-tab ${statusFilter.value === st ? "active" : "inactive"}`}
              onClick$={() => {
                statusFilter.value = st;
              }}
              style={{ textTransform: "capitalize" }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. Subscribers Table ─────────────────────────────────────────────── */}
      {loading.value ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Loading subscribers...
        </div>
      ) : filteredSubscribers.value.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
            <LuMail style={{ width: "2.5rem", height: "2.5rem", color: "var(--text-secondary)" }} />
          </div>
          <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.375rem" }}>
            No subscribers found
          </div>
          <div style={{ fontSize: "0.8125rem" }}>Subscribers from newsletters and sign-up forms will appear here.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                <th style={thL}>Joined Date</th>
                <th style={thL}>Subscriber</th>
                <th style={thL}>Location / Device</th>
                <th style={thL}>Referrer</th>
                <th style={{ ...thL, textAlign: "center" }}>Status</th>
                <th style={thR}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscribers.value.map((sub) => {
                const status = getStatusInfo(sub);
                return (
                  <tr key={sub.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}>
                    <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      {fmtDate(sub.signup_timestamp)}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem" }}>
                      <div style={{ fontWeight: "500", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        {sub.name || sub.email}
                      </div>
                      {sub.name && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{sub.email}</div>
                      )}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {[sub.city, sub.country].filter(Boolean).join(", ") || sub.device_type || "—"}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {sub.referrer_domain || "Direct"}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "center" }}>
                      <span
                        style={{
                          background: status.bg,
                          color: status.color,
                          border: `1px solid ${status.color}33`,
                          borderRadius: "0.25rem",
                          padding: "0.15rem 0.5rem",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end" }}>
                        {!sub.is_unsubscribed && !sub.is_blocked && (
                          <button
                            type="button"
                            onClick$={() => handleUnsubscribe$(sub.id)}
                            title="Unsubscribe member"
                            style={{
                              padding: "0.25rem 0.5rem",
                              background: "var(--surface-3)",
                              border: "1px solid var(--border)",
                              borderRadius: "0.375rem",
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            Unsub
                          </button>
                        )}
                        {!sub.is_blocked && (
                          <button
                            type="button"
                            onClick$={() => handleBlock$(sub.id)}
                            title="Block subscriber"
                            style={{
                              padding: "0.25rem 0.5rem",
                              background: "rgba(239,68,68,0.08)",
                              border: "1px solid rgba(239,68,68,0.25)",
                              borderRadius: "0.375rem",
                              fontSize: "0.75rem",
                              color: "var(--error)",
                              cursor: "pointer",
                            }}
                          >
                            Block
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Footer: Count + Load More ────────────────────────────────────────── */}
          <div
            style={{
              padding: "0.75rem 0.875rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {filteredSubscribers.value.length} subscriber{filteredSubscribers.value.length !== 1 ? "s" : ""}
              {search.value ? " (filtered)" : ""} · newest first
            </span>
            {hasMore.value && !search.value && (
              <button
                type="button"
                disabled={loadingMore.value}
                onClick$={() => fetchSubscribersPage(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  padding: "0.35rem 0.875rem",
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  cursor: loadingMore.value ? "not-allowed" : "pointer",
                  fontWeight: "500",
                }}
              >
                {loadingMore.value ? (
                  <>
                    <LuLoader style={{ width: "13px", height: "13px", animation: "spin 1s linear infinite" }} />
                    Loading…
                  </>
                ) : (
                  <>Load {PAGE} more</>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Subscribers - BusinessKit",
};
