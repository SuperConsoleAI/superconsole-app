// src/components/shop/restaurant/AddStaffSlideOver.tsx
//
// WHAT: SlideOver to add / edit restaurant waitstaff or kitchen staff.
//       Matches exact design language of AddProductModal.tsx.

import {
  component$,
  useSignal,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuSave, LuLoader, LuUsers } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";

export interface RestaurantStaff {
  id: string;
  name: string;
  role: string;
  phone?: string;
  assigned_floor?: string;
  is_active: boolean;
}

export interface AddStaffSlideOverProps {
  open: Signal<boolean>;
  onSaved$: PropFunction<(staff: RestaurantStaff) => void>;
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
  ({ open, onSaved$ }) => {
    const name    = useSignal("");
    const role    = useSignal("Waiter");
    const phone   = useSignal("");
    const floor   = useSignal("Main Floor");
    const saving  = useSignal(false);
    const error   = useSignal<string | null>(null);

    const handleSave = $(async () => {
      if (!name.value.trim()) {
        error.value = "Staff name is required";
        return;
      }
      saving.value = true;
      error.value  = null;

      try {
        const staffMember: RestaurantStaff = {
          id: `staff-${Date.now()}`,
          name: name.value.trim(),
          role: role.value,
          phone: phone.value.trim() || undefined,
          assigned_floor: floor.value.trim() || undefined,
          is_active: true,
        };
        await onSaved$(staffMember);
        open.value = false;
        name.value = "";
        phone.value = "";
      } catch (e: any) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    return (
      <SlideOver
        open={open}
        title="Add Restaurant Staff"
        subtitle="Manage waitstaff, chefs & assigned dining zones"
        width="480px"
        icon="users"
      >
        <LuUsers q:slot="icon" style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {error.value && (
            <div
              style={{
                background: "#fee2e2",
                color: "#dc2626",
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
                  <label style={labelStyle}>Role / Title</label>
                  <select
                    value={role.value}
                    onChange$={(e) => (role.value = (e.target as HTMLSelectElement).value)}
                    style={inputStyle}
                  >
                    <option value="Waiter">Waiter / Server</option>
                    <option value="Head Chef">Head Chef</option>
                    <option value="Sous Chef">Sous Chef</option>
                    <option value="Manager">Restaurant Manager</option>
                    <option value="Cashier">POS Cashier</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Assigned Floor / Zone</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Floor, Terrace"
                    value={floor.value}
                    onInput$={(e) => (floor.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Phone / Contact</label>
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={phone.value}
                  onInput$={(e) => (phone.value = (e.target as HTMLInputElement).value)}
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
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Saving Staff…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                Add Staff Member
              </>
            )}
          </button>
        </div>
      </SlideOver>
    );
  }
);
