// src/components/shop/ShopStaffSelector.tsx
//
// WHAT: Unified, reactive staff member selector component for BusinessKit.
//       Maintains real-time sync with localStorage ("bk-active-staff-id") and
//       broadcasts "bk-staff-changed" events across all open modals, POS, and slide-overs.
//
// VARIANTS:
//   - "top-bar": Compact selector placed before close icon in slide-overs and modals.
//   - "form-field": Standard form input with optional label.

import {
  component$,
  useSignal,
  useVisibleTask$,
  useStylesScoped$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuUser, LuChevronDown } from "@qwikest/icons/lucide";

export interface ShopStaffMember {
  id: string;
  name: string;
  display_name?: string;
  role?: string;
  is_active?: number | boolean | null;
}

export interface ShopStaffSelectorProps {
  selectedStaffId: Signal<string | null | undefined>;
  staffList?: Signal<ShopStaffMember[]> | ShopStaffMember[];
  onStaffChange$?: PropFunction<(staffId: string | null) => void>;
  variant?: "top-bar" | "form-field" | "button";
  label?: string;
  allowGlobalSync?: boolean;
  disabled?: boolean;
}

const STYLES = `
  .bk-staff-btn {
    position: relative;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    flex-wrap: nowrap;
    height: 2rem;
    padding: 0 0.625rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    box-sizing: border-box;
    white-space: nowrap;
    transition: all 0.15s ease;
    background: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    gap: 0.35rem;
    min-width: 0;
    width: auto;
    overflow: hidden;
  }
  .bk-staff-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--border-hover, var(--border));
  }
  .bk-staff-topbar {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.375rem;
    min-width: 0;
  }
  .bk-staff-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1;
  }
  .bk-staff-name-display {
    display: inline-block;
    font-size: 0.8125rem;
    color: var(--text-primary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    line-height: 1.2;
  }
  .bk-staff-chevron-wrapper {
    margin-left: 0.15rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text-secondary);
    line-height: 1;
  }
  .bk-staff-overlay-select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }
  .bk-staff-topbar-select {
    height: 1.85rem;
    padding: 0 0.5rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
    font-weight: 500;
    max-width: 140px;
    min-width: 0;
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .bk-staff-btn {
      padding: 0 0.35rem;
      gap: 0.25rem;
      font-size: 0.75rem;
      justify-content: center;
      width: 100%;
    }
    .bk-staff-label {
      display: none !important;
    }
    .bk-staff-name-display {
      display: inline-block !important;
      font-size: 0.75rem;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bk-staff-chevron-wrapper {
      margin-left: 0.15rem !important;
      flex-shrink: 0 !important;
      display: inline-flex !important;
    }
  }
`;

export const ShopStaffSelector = component$<ShopStaffSelectorProps>((props) => {
  useStylesScoped$(STYLES);

  const internalStaffList = useSignal<ShopStaffMember[]>([]);
  const isLoaded = useSignal(false);
  const variant = props.variant || "top-bar";
  const allowGlobalSync = props.allowGlobalSync !== false;

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ cleanup }) => {
    try {
      const staff = await invoke<ShopStaffMember[]>("shop_list_staff", {}).catch(() => []);
      internalStaffList.value = Array.isArray(staff) ? staff.filter((s) => s.is_active !== 0) : [];

      // Initial active staff hydration if not already set by document/parent
      if (!props.selectedStaffId.value && typeof localStorage !== "undefined") {
        const savedStaffId = localStorage.getItem("bk-active-staff-id");
        if (savedStaffId) {
          props.selectedStaffId.value = savedStaffId;
          if (props.onStaffChange$) {
            await props.onStaffChange$(savedStaffId);
          }
        }
      }

      const handleStaffChange = async (e: any) => {
        const newId = e.detail || null;
        if (props.selectedStaffId.value !== newId) {
          props.selectedStaffId.value = newId;
          if (props.onStaffChange$) {
            await props.onStaffChange$(newId);
          }
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("bk-staff-changed", handleStaffChange);
        cleanup(() => {
          window.removeEventListener("bk-staff-changed", handleStaffChange);
        });
      }

      isLoaded.value = true;
    } catch (e) {
      console.error("[ShopStaffSelector] load failed:", e);
    }
  });

  const handleChange = $(async (e: Event) => {
    const val = (e.target as HTMLSelectElement).value || null;
    props.selectedStaffId.value = val;

    if (allowGlobalSync && typeof localStorage !== "undefined") {
      if (val) {
        localStorage.setItem("bk-active-staff-id", val);
        window.dispatchEvent(new CustomEvent("bk-staff-changed", { detail: val }));
      } else {
        localStorage.removeItem("bk-active-staff-id");
        window.dispatchEvent(new CustomEvent("bk-staff-changed", { detail: null }));
      }
    }

    if (props.onStaffChange$) {
      await props.onStaffChange$(val);
    }
  });

  const activeStaffList = (() => {
    if (props.staffList) {
      const list = "value" in props.staffList ? props.staffList.value : props.staffList;
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return internalStaffList.value;
  })();

  const currentVal = props.selectedStaffId.value || "";
  const selectedStaffMember = activeStaffList.find((s) => s.id === currentVal);
  const selectedStaffName = selectedStaffMember
    ? (selectedStaffMember.name || selectedStaffMember.display_name || "Staff")
    : "You";

  if (variant === "button") {
    return (
      <div
        class="bk-staff-btn"
        title={selectedStaffMember ? `Staff: ${selectedStaffName}${selectedStaffMember.role ? ` (${selectedStaffMember.role})` : ""}` : "Staff: You (None selected)"}
      >
        <LuUser style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0, color: "var(--text-secondary)" }} />
        <span class="bk-staff-label">
          {props.label ?? "Staff:"}
        </span>
        <span class="bk-staff-name-display">
          {selectedStaffName}
        </span>
        <span class="bk-staff-chevron-wrapper" style={{ marginLeft: "0.15rem", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LuChevronDown style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0, color: "var(--text-secondary)" }} />
        </span>
        <select
          value={currentVal}
          onChange$={handleChange}
          disabled={props.disabled}
          class="bk-staff-overlay-select"
          title="Select active staff member"
        >
          <option value="" selected={!currentVal}>None (You)</option>
          {activeStaffList.map((s) => (
            <option key={s.id} value={s.id} selected={s.id === currentVal}>
              {`${s.name || s.display_name || "Staff"}${s.role ? ` (${s.role})` : ""}`}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (variant === "top-bar") {
    return (
      <div class="bk-staff-topbar">
        <span class="bk-staff-label" style="font-size: 0.75rem;">
          {props.label ?? "Staff:"}
        </span>
        <select
          value={currentVal}
          onChange$={handleChange}
          disabled={props.disabled}
          class="bk-staff-topbar-select"
          title="Select active staff member"
        >
          <option value="" selected={!currentVal}>None (You)</option>
          {activeStaffList.map((s) => (
            <option key={s.id} value={s.id} selected={s.id === currentVal}>
              {`${s.name || s.display_name || "Staff"}${s.role ? ` (${s.role})` : ""}`}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // "form-field" variant
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
        {props.label ?? "Staff Member"}
        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginLeft: "0.25rem" }}>(optional)</span>
      </label>
      <select
        value={currentVal}
        onChange$={handleChange}
        disabled={props.disabled}
        style={{
          width: "100%",
          height: "2.25rem",
          padding: "0 0.75rem",
          background: "var(--field-fill)",
          border: "1px solid var(--border)",
          borderRadius: "0.375rem",
          color: "var(--text-primary)",
          fontSize: "0.875rem",
          outline: "none",
          cursor: props.disabled ? "not-allowed" : "pointer",
          boxSizing: "border-box",
        }}
        title="Select staff member"
      >
        <option value="" selected={!currentVal}>None (You)</option>
        {activeStaffList.map((s) => (
          <option key={s.id} value={s.id} selected={s.id === currentVal}>
            {`${s.name || s.display_name || "Staff"}${s.role ? ` (${s.role})` : ""}`}
          </option>
        ))}
      </select>
    </div>
  );
});
