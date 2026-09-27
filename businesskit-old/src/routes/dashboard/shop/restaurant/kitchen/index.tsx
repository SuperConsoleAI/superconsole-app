// src/routes/dashboard/shop/restaurant/kitchen/index.tsx
//
// Kitchen Display Screen (KDS) — Path: /dashboard/shop/restaurant/kitchen

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuFlame, LuRefreshCw } from "@qwikest/icons/lucide";
import { KOTQueueCard } from "~/components/shop/restaurant/KOTQueueCard";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

export default component$(() => {
  const ctx        = useContext(RestaurantContext);
  const refreshing = useSignal(false);
  const filter     = useSignal("active");

  const loadKOTs = $(async () => {
    refreshing.value = true;
    try {
      await ctx.loadData();
    } catch (e) {
      console.error("[restaurant/kitchen] load failed:", e);
    } finally {
      refreshing.value = false;
    }
  });

  const handleUpdateStatus = $(async (kotId: string, newStatus: string) => {
    try {
      await invoke("shop_update_kot_status", { kotId, status: newStatus });
      ctx.kots = ctx.kots.map((k) =>
        k.id === kotId ? { ...k, status: newStatus } : k
      );
    } catch (e) {
      console.error("[restaurant/kitchen] status update failed:", e);
    }
  });

  const filteredKOTs = ctx.kots.filter((k) => {
    if (filter.value === "active") return k.status === "pending" || k.status === "cooking";
    if (filter.value === "ready")  return k.status === "ready";
    return true;
  });

  return (
    <div>
      <style>{`
        @keyframes kds-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Filter Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["active", "ready", "all"].map((f) => (
            <button
              key={f}
              onClick$={() => (filter.value = f)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: 500,
                textTransform: "capitalize",
                border: filter.value === f ? "1px solid var(--text-primary)" : "1px solid var(--border)",
                background: filter.value === f ? "var(--text-primary)" : "var(--surface-1)",
                color: filter.value === f ? "var(--bg-card, var(--surface-1))" : "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {f === "active" ? "Pending & Cooking" : f}
            </button>
          ))}
        </div>
        <button
          onClick$={loadKOTs}
          disabled={refreshing.value}
          style={{
            padding: "0.4rem 0.85rem",
            borderRadius: "0.375rem",
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            fontSize: "0.8125rem",
            fontWeight: 500,
            cursor: refreshing.value ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            opacity: refreshing.value ? 0.75 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          <LuRefreshCw
            style={{
              width: "0.875rem",
              height: "0.875rem",
              animation: refreshing.value ? "kds-spin 0.7s linear infinite" : "none",
            }}
          />
          {refreshing.value ? "Refreshing..." : "Refresh Queue"}
        </button>
      </div>

      {/* Grid */}
      {ctx.loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading kitchen tickets...
        </div>
      ) : filteredKOTs.length === 0 ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px dashed var(--border)" }}>
          <LuFlame style="width:3rem;height:3rem;color:var(--text-secondary);margin-bottom:1rem;" />
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>Kitchen Queue Clear</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            No active KOT tickets currently in queue.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {filteredKOTs.map((kot) => (
            <KOTQueueCard key={kot.id} kot={kot} onUpdateStatus$={handleUpdateStatus} />
          ))}
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Kitchen Display Queue | BusinessKit",
};
