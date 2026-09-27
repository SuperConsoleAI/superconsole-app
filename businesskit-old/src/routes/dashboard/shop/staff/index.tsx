// src/routes/dashboard/shop/staff/index.tsx
//
// Shop Staff Management — Path: /dashboard/shop/staff
//
// Manages employees, waitstaff, chefs, cashiers, drivers, stylists across all shop verticals.
// Backed by SQLite/Turso `shop_staff` table.

import { component$, useSignal, useVisibleTask$, useComputed$, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuUsers,
  LuPlus,
  LuSearch,
  LuPencil,
  LuTrash2,
  LuPhone,
  LuMail,
  LuPercent,
  LuUserCheck,
} from "@qwikest/icons/lucide";
import { AddStaffSlideOver, type ShopStaffMember } from "~/components/shop/AddStaffSlideOver";
import { ShopMoreMenu } from "~/components/shop/ShopMoreMenu";

const ROLE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  waiter: { label: "🍽️ Waiter / Server", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
  chef: { label: "👨‍🍳 Chef / Kitchen", color: "#f97316", bg: "rgba(249, 115, 22, 0.1)" },
  manager: { label: "👔 Manager", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
  cashier: { label: "💳 Cashier / POS", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },
  stylist: { label: "✂️ Stylist", color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },
  doctor: { label: "🩺 Doctor", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.1)" },
  driver: { label: "🚚 Driver", color: "#eab308", bg: "rgba(234, 179, 8, 0.1)" },
  salesman: { label: "💼 Sales Rep", color: "#6366f1", bg: "rgba(99, 102, 241, 0.1)" },
  housekeeper: { label: "🧹 Housekeeper", color: "#64748b", bg: "rgba(100, 116, 139, 0.1)" },
  staff: { label: "👤 General Staff", color: "#94a3b8", bg: "rgba(148, 163, 184, 0.1)" },
};

export default component$(() => {
  const staffList = useSignal<ShopStaffMember[]>([]);
  const loading = useSignal(true);
  const search = useSignal("");
  const selectedRole = useSignal("all");
  const showAddModal = useSignal(false);
  const editingStaff = useSignal<ShopStaffMember | null>(null);

  const loadStaff = $(async () => {
    try {
      const res = await invoke<ShopStaffMember[]>("shop_list_staff", {});
      staffList.value = res;
    } catch (e) {
      console.error("[shop/staff] load failed:", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadStaff();
  });

  const handleDelete$ = $(async (staffId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}?`)) return;
    try {
      await invoke("shop_delete_staff", { staffId });
      staffList.value = staffList.value.filter((s) => s.id !== staffId);
    } catch (e) {
      alert(`Failed to delete staff: ${e}`);
    }
  });

  const filteredStaff = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    const r = selectedRole.value;

    return staffList.value.filter((s) => {
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q));

      const matchRole = r === "all" || s.role === r;

      return matchSearch && matchRole;
    });
  });

  // Role counts
  const waiterCount = staffList.value.filter((s) => s.role === "waiter").length;
  const chefCount = staffList.value.filter((s) => s.role === "chef").length;
  const otherCount = staffList.value.length - waiterCount - chefCount;

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ padding: "0.5rem", borderRadius: "0.5rem", background: "var(--brand-primary-soft, rgba(99,102,241,0.12))", color: "var(--brand-primary)" }}>
            <LuUsers style="width:1.25rem;height:1.25rem;" />
          </div>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Staff & Team Management
            </h1>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Manage waiters, chefs, cashiers, technicians & sales personnel
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ShopMoreMenu />
          <button
            type="button"
            onClick$={() => {
              editingStaff.value = null;
              showAddModal.value = true;
            }}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <LuPlus style="width:1rem;height:1rem;" />
            Add Staff Member
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 500 }}>
            <span>Total Active Staff</span>
            <LuUsers style="width:1.125rem;height:1.125rem;color:var(--brand-primary);" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {staffList.value.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Registered shop personnel</div>
        </div>

        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 500 }}>
            <span>Waiters / Servers</span>
            <span style={{ fontSize: "1rem" }}>🍽️</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "#3b82f6" }}>
            {waiterCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Dining & table service</div>
        </div>

        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 500 }}>
            <span>Kitchen & Chefs</span>
            <span style={{ fontSize: "1rem" }}>👨‍🍳</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "#f97316" }}>
            {chefCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Food prep & cooking</div>
        </div>

        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 500 }}>
            <span>Management & POS</span>
            <span style={{ fontSize: "1rem" }}>👔</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "#8b5cf6" }}>
            {otherCount > 0 ? otherCount : 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Supervisors & billing</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "260px", maxWidth: "360px" }}>
          <LuSearch style="width:1rem;height:1rem;position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);" />
          <input
            type="text"
            placeholder="Search staff by name, phone or email..."
            value={search.value}
            onInput$={(e) => (search.value = (e.target as HTMLInputElement).value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem 0.5rem 2.25rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
              fontSize: "0.875rem",
            }}
          />
        </div>

        <select
          value={selectedRole.value}
          onChange$={(e) => (selectedRole.value = (e.target as HTMLSelectElement).value)}
          style={{
            height: "2.25rem",
            padding: "0 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            fontSize: "0.8125rem",
            cursor: "pointer",
          }}
        >
          <option value="all">All Staff Roles</option>
          <option value="waiter">🍽️ Waiters / Servers</option>
          <option value="chef">👨‍🍳 Chefs & Kitchen</option>
          <option value="manager">👔 Managers</option>
          <option value="cashier">💳 Cashiers</option>
          <option value="stylist">✂️ Stylists</option>
          <option value="doctor">🩺 Doctors</option>
          <option value="driver">🚚 Drivers</option>
          <option value="salesman">💼 Sales Reps</option>
          <option value="staff">👤 General Staff</option>
        </select>
      </div>

      {/* Staff Grid */}
      {loading.value ? (
        <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading staff roster...
        </div>
      ) : filteredStaff.value.length === 0 ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px dashed var(--border)" }}>
          <LuUserCheck style="width:3rem;height:3rem;color:var(--text-secondary);margin-bottom:1rem;" />
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>No Staff Members Found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            {search.value || selectedRole.value !== "all"
              ? "No staff matching your search query or role filter."
              : "Click '+ Add Staff Member' above to create your shop team roster."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {filteredStaff.value.map((member) => {
            const badge = ROLE_BADGES[member.role] || ROLE_BADGES.staff;
            return (
              <div
                key={member.id}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.75rem",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text-primary)" }}>{member.name}</div>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "0.35rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.375rem",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: badge.color,
                          background: badge.bg,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <button
                        type="button"
                        title="Edit Staff"
                        onClick$={() => {
                          editingStaff.value = member;
                          showAddModal.value = true;
                        }}
                        style={{
                          padding: "0.35rem",
                          borderRadius: "0.375rem",
                          background: "var(--surface-1)",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          display: "flex",
                        }}
                      >
                        <LuPencil style="width:0.875rem;height:0.875rem;" />
                      </button>

                      <button
                        type="button"
                        title="Delete Staff"
                        onClick$={() => handleDelete$(member.id, member.name)}
                        style={{
                          padding: "0.35rem",
                          borderRadius: "0.375rem",
                          background: "var(--surface-1)",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                          color: "#ef4444",
                          display: "flex",
                        }}
                      >
                        <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    {member.phone && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <LuPhone style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
                        <span>{member.phone}</span>
                      </div>
                    )}
                    {member.email && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <LuMail style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
                        <span>{member.email}</span>
                      </div>
                    )}
                    {(member.commission_pct || 0) > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#10b981", fontWeight: 500 }}>
                        <LuPercent style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
                        <span>{member.commission_pct}% Sales Commission</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <span>Status: <strong style={{ color: "#10b981" }}>Active</strong></span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>ID: {member.id.slice(0, 14)}...</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Staff SlideOver */}
      <AddStaffSlideOver
        open={showAddModal}
        editingStaff={editingStaff}
        onSaved$={$(async () => {
          await loadStaff();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Staff & Team Management | BusinessKit",
};
