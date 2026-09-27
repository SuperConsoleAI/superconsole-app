// src/components/shop/AddStaffSlideOver.tsx
//
// WHAT: SlideOver to add / edit staff across all shop verticals (restaurant, retail, salon, etc.).
//       Matches exact design language of AddProductModal.tsx and SlideOver.tsx.

import {
  component$,
  useSignal,
  useTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuSave, LuLoader, LuUsers } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";

export interface ShopStaffMember {
  id: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  name: string;
  role: string;
  department?: string;
  phone?: string;
  email?: string;
  commission_pct?: number;
  is_active: number | boolean;
}

export interface AddStaffSlideOverProps {
  open: Signal<boolean>;
  editingStaff?: Signal<ShopStaffMember | null>;
  onSaved$: PropFunction<(staff: ShopStaffMember) => void>;
}

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: "0.75rem",
        fontWeight: "600",
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "0.875rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

export const AddStaffSlideOver = component$<AddStaffSlideOverProps>(
  ({ open, editingStaff, onSaved$ }) => {
    const name = useSignal("");
    const department = useSignal("");
    const role = useSignal("waiter");
    const phone = useSignal("");
    const email = useSignal("");
    const commissionPct = useSignal("0");
    const saving = useSignal(false);
    const error = useSignal<string | null>(null);

    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      const editing = editingStaff ? track(() => editingStaff.value) : null;
      if (isOpen) {
        if (editing) {
          name.value = editing.name;
          department.value = editing.department || "";
          role.value = editing.role || "waiter";
          phone.value = editing.phone || "";
          email.value = editing.email || "";
          commissionPct.value = String(editing.commission_pct || 0);
        } else {
          name.value = "";
          department.value = "";
          role.value = "waiter";
          phone.value = "";
          email.value = "";
          commissionPct.value = "0";
        }
        error.value = null;
      }
    });

    const handleSave = $(async () => {
      if (!name.value.trim()) {
        error.value = "Staff name is required";
        return;
      }
      saving.value = true;
      error.value = null;

      try {
        const payload = {
          name: name.value.trim(),
          role: role.value,
          department: department.value.trim() || undefined,
          phone: phone.value.trim() || undefined,
          email: email.value.trim() || undefined,
          commission_pct: Number(commissionPct.value) || 0,
        };

        let result: ShopStaffMember;
        if (editingStaff && editingStaff.value?.id) {
          await invoke("shop_update_staff", {
            staffId: editingStaff.value.id,
            data: payload,
          });
          result = {
            id: editingStaff.value.id,
            ...payload,
            is_active: 1,
          };
        } else {
          result = await invoke<ShopStaffMember>("shop_create_staff", {
            data: payload,
          });
        }

        await onSaved$(result);
        open.value = false;
      } catch (e: any) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    return (
      <SlideOver
        open={open}
        title={editingStaff?.value ? "Edit Staff Member" : "Add Staff Member"}
        subtitle="Manage shop employees, waitstaff, technicians & sales personnel"
        width="480px"
        icon="users"
      >
        <LuUsers q:slot="icon" style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {error.value && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#ef4444",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
              }}
            >
              {error.value}
            </div>
          )}

          <div>
            <SectionTitle>Staff Profile</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Staff Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={name.value}
                  onInput$={(e) => (name.value = (e.target as HTMLInputElement).value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>Role / Function</label>
                  <select
                    value={role.value}
                    onChange$={(e) => (role.value = (e.target as HTMLSelectElement).value)}
                    style={inputStyle}
                  >
                    <option value="waiter">🍽️ Waiter / Server</option>
                    <option value="chef">👨‍🍳 Chef / Cook</option>
                    <option value="manager">👔 Manager / Supervisor</option>
                    <option value="cashier">💳 Cashier / POS Operator</option>
                    <option value="stylist">✂️ Stylist / Beautician</option>
                    <option value="doctor">🩺 Doctor / Specialist</option>
                    <option value="driver">🚚 Driver / Delivery</option>
                    <option value="salesman">💼 Sales Rep / Executive</option>
                    <option value="housekeeper">🧹 Housekeeper</option>
                    <option value="staff">👤 General Staff</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Department / Zone</label>
                  <input
                    type="text"
                    placeholder="e.g. Dining Floor, Kitchen"
                    value={department.value}
                    onInput$={(e) => (department.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>Commission (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="0"
                    value={commissionPct.value}
                    onInput$={(e) => (commissionPct.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Phone / Mobile</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={phone.value}
                    onInput$={(e) => (phone.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. rahul@company.com"
                  value={email.value}
                  onInput$={(e) => (email.value = (e.target as HTMLInputElement).value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div q:slot="footer" style={{ borderTop: "1px solid var(--border)", padding: "1rem 1.5rem", background: "var(--surface-1)" }}>
          <button
            type="button"
            onClick$={handleSave}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" />
                Saving Staff…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" />
                {editingStaff?.value ? "Save Changes" : "Create Staff Member"}
              </>
            )}
          </button>
        </div>
      </SlideOver>
    );
  }
);
