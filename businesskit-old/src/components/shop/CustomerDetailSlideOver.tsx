// src/components/shop/CustomerDetailSlideOver.tsx
//
// WHAT: Comprehensive Customer Detail & Management SlideOver.
//       Includes:
//         - Remove from cart & Done action
//         - Credit line & live prior dues with inline limit editing
//         - Total spend & orders metrics
//         - Store credit wallet management + append-only ledger history
//         - Contact & Business Info editing (Name, Phone, Email, GSTIN, PAN, DL No, Billing Address, City, State)
//         - Marketing Toggles (Email, SMS, WhatsApp)
//         - Important Dates & Milestones (Date of Birth, Anniversary)
//         - Multiple shipping/billing addresses (Add, Edit, Delete, Default toggle)
//         - Customer notes & tags
//         - Customer Options: GST Supply Classification (Regular, SEZ, Export, Overseas) & Collect Taxes toggle

import {
  component$,
  useSignal,
  useTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuTrash2,
  LuCreditCard,
  LuTag,
  LuCheck,
  LuHistory,
  LuCalendar,
  LuPencil,
  LuImage,
  LuUser,
  LuUpload,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { fmtMoney } from "~/lib/fin-format";
import { invoke } from "@tauri-apps/api/core";
import type { CustomerBasic } from "./CustomerLookupSlideOver";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";

export interface CustomerAddress {
  id: string;
  name?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  is_default?: boolean;
}

export interface OutstandingInvoiceSummary {
  document_id: string;
  doc_number: string;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  doc_date: number;
}

export interface CustomerBillingContext {
  customer_id?: string;
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  pan?: string | null;
  dl_no?: string | null;
  billing_addr?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  credit_limit: number;
  credit_used: number;
  wallet_balance?: number;
  store_credit?: number;
  collect_taxes: number;
  accepts_email_marketing: number;
  accepts_sms_marketing: number;
  accepts_whatsapp_marketing: number;
  date_of_birth?: string | null;
  anniversary?: string | null;
  notes?: string | null;
  tags?: string | null;
  addresses?: string | null;
  gst_supply_type?: string;
  total_spent: number;
  total_orders: number;
  available_credit: number;
  is_over_limit: boolean;
  media_id?: string | null;
  image_url?: string | null;
  price_list_id?: string | null;
  outstanding_invoices: OutstandingInvoiceSummary[];
}

export interface PriceListOption {
  id: string;
  name: string;
  description?: string | null;
  discount_pct: number;
  is_active?: boolean;
}

export interface CreditLedgerItem {
  id: string;
  customer_id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  document_id?: string | null;
  payment_id?: string | null;
  notes?: string | null;
  created_at: number;
}

export interface CustomerDetailSlideOverProps {
  open: Signal<boolean>;
  customer: Signal<CustomerBasic | null>;
  zIndex?: number;
  disableRemoveFromCart?: boolean;
  onRemoveFromCart$?: PropFunction<() => void>;
  onCustomerUpdated$?: PropFunction<(updated: CustomerBasic) => void>;
  onSelectShippingAddress$?: PropFunction<(addr: CustomerAddress) => void>;
}

const fmt = (n: number) => fmtMoney(n);

const fmtDate = (ts: number) =>
  ts
    ? new Date(ts * 1000).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

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

// ── Custom Checkbox (Unchecked = transparent border, Checked = blue fill with white check) ──
export const CustomCheckbox = component$<{
  checked: boolean;
  onChange$: PropFunction<(checked: boolean) => void>;
}>(({ checked, onChange$ }) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick$={$(() => {
        onChange$(!checked);
      })}
      style={{
        width: "1.25rem",
        height: "1.25rem",
        borderRadius: "0.25rem",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
        background: checked ? "#3b82f6" : "transparent",
        border: checked ? "1.5px solid #3b82f6" : "1.5px solid var(--border, #d1d5db)",
        transition: "all 120ms ease",
      }}
    >
      {checked && (
        <LuCheck style={{ width: "0.875rem", height: "0.875rem", color: "#ffffff" }} stroke-width="3" />
      )}
    </button>
  );
});

export const CustomerDetailSlideOver = component$<CustomerDetailSlideOverProps>(
  ({ open, customer, zIndex = 500, disableRemoveFromCart = false, onRemoveFromCart$, onCustomerUpdated$, onSelectShippingAddress$ }) => {
    const c = customer.value;

    // Contact & Identity info edit state
    const isEditingContact = useSignal(false);
    const editName = useSignal("");
    const editEmail = useSignal("");
    const editPhone = useSignal("");
    const editGstin = useSignal("");
    const editPan = useSignal("");
    const editDlNo = useSignal("");
    const editBillingAddr = useSignal("");
    const editCity = useSignal("");
    const editState = useSignal("");
    const editPincode = useSignal("");

    // Dates & Milestones edit state
    const isEditingDates = useSignal(false);
    const dob = useSignal("");
    const anniversary = useSignal("");

    // Preferences signals
    const emailMarketing = useSignal(false);
    const smsMarketing = useSignal(false);
    const whatsappMarketing = useSignal(false);
    const collectTaxes = useSignal(true);
    const gstSupplyType = useSignal("regular");
    const storeCredit = useSignal(0);
    const noteText = useSignal("");
    const isEditingNote = useSignal(false);

    // Tags
    const tagsList = useSignal<string[]>([]);
    const newTagInput = useSignal("");
    const showAddTag = useSignal(false);

    // Addresses
    const addressesList = useSignal<CustomerAddress[]>([]);
    const showAddAddress = useSignal(false);
    const editingAddressId = useSignal<string | null>(null);
    const addrName = useSignal("");
    const addr1 = useSignal("");
    const addr2 = useSignal("");
    const addrCity = useSignal("");
    const addrState = useSignal("");
    const addrZip = useSignal("");
    const addrCountry = useSignal("India");
    const addrPhone = useSignal("");
    const addrDefault = useSignal(false);

    // Store credit adjust & ledger history
    const showCreditAdjust = useSignal(false);
    const creditDelta = useSignal("");
    const creditNotes = useSignal("");
    const creditLedger = useSignal<CreditLedgerItem[]>([]);
    const showCreditHistory = useSignal(false);

    // Credit context & limit editing
    const creditContext = useSignal<CustomerBillingContext | null>(null);
    const showOutstanding = useSignal(false);
    const isEditingCreditLimit = useSignal(false);
    const newCreditLimit = useSignal("");

    // Avatar / Media
    const avatarUrl = useSignal<string | null>(null);
    const mediaId = useSignal<string | null>(null);
    const showAvatarPicker = useSignal(false);
    const showAvatarUpload = useSignal(false);

    // Pricing Tier / Price List
    const priceLists = useSignal<PriceListOption[]>([]);
    const selectedPriceListId = useSignal<string>("");

    // Sync state when customer changes
    useTask$(({ track }) => {
      const cust = track(() => customer.value);
      if (cust) {
        avatarUrl.value = cust.image_url || null;
        mediaId.value = cust.media_id || null;
        selectedPriceListId.value = cust.price_list_id || "";

        // Fetch active price lists
        invoke<PriceListOption[]>("shop_list_price_lists", {})
          .then((lists) => {
            priceLists.value = lists || [];
          })
          .catch(() => {
            priceLists.value = [];
          });

        editName.value = cust.name || "";
        editEmail.value = cust.email || "";
        editPhone.value = cust.phone || "";
        editGstin.value = cust.gstin || "";
        editPan.value = cust.pan || "";
        editDlNo.value = cust.dl_no || "";
        editBillingAddr.value = (cust.billing_addr && cust.billing_addr !== "{}") ? cust.billing_addr : "";
        editCity.value = cust.city || "";
        editState.value = cust.state || "";
        editPincode.value = cust.pincode || "";
        dob.value = cust.date_of_birth || "";
        anniversary.value = cust.anniversary || "";
        emailMarketing.value = cust.accepts_email_marketing === 1;
        smsMarketing.value = cust.accepts_sms_marketing === 1;
        whatsappMarketing.value = cust.accepts_whatsapp_marketing === 1;
        collectTaxes.value = cust.collect_taxes !== 0;
        gstSupplyType.value = cust.gst_supply_type || "regular";
        storeCredit.value = cust.wallet_balance ?? cust.store_credit ?? 0;
        noteText.value = cust.notes || "";
        isEditingContact.value = false;
        isEditingDates.value = false;
        isEditingNote.value = false;
        isEditingCreditLimit.value = false;
        newCreditLimit.value = String(cust.credit_limit || 0);

        // Fetch live billing context (credit limit, prior dues, available credit, outstanding invoices)
        invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: cust.id })
          .then((ctx) => {
            creditContext.value = ctx;
            newCreditLimit.value = String(ctx.credit_limit || 0);
            if (ctx.price_list_id !== undefined && ctx.price_list_id !== null) {
              selectedPriceListId.value = ctx.price_list_id || "";
            }
            if (ctx.image_url) avatarUrl.value = ctx.image_url;
            if (ctx.media_id) mediaId.value = ctx.media_id;
            if (!editGstin.value && ctx.gstin) editGstin.value = ctx.gstin;
            if (!editPan.value && ctx.pan) editPan.value = ctx.pan;
            if (!editDlNo.value && ctx.dl_no) editDlNo.value = ctx.dl_no;
            if (!editBillingAddr.value && ctx.billing_addr && ctx.billing_addr !== "{}") editBillingAddr.value = ctx.billing_addr;
            if (!editCity.value && ctx.city) editCity.value = ctx.city;
            if (!editState.value && ctx.state) editState.value = ctx.state;
            if (!editPincode.value && ctx.pincode) editPincode.value = ctx.pincode;
            if (ctx.accepts_whatsapp_marketing !== undefined) {
              whatsappMarketing.value = ctx.accepts_whatsapp_marketing === 1;
            }
            if (ctx.date_of_birth) dob.value = ctx.date_of_birth;
            if (ctx.anniversary) anniversary.value = ctx.anniversary;
          })
          .catch(() => {
            creditContext.value = null;
          });

        // Fetch append-only credit ledger history
        invoke<CreditLedgerItem[]>("shop_get_customer_credit_ledger", { customerId: cust.id })
          .then((entries) => {
            creditLedger.value = entries || [];
          })
          .catch(() => {
            creditLedger.value = [];
          });

        // Parse tags
        try {
          if (cust.tags) {
            const parsed = JSON.parse(cust.tags);
            tagsList.value = Array.isArray(parsed) ? parsed : [];
          } else {
            tagsList.value = [];
          }
        } catch {
          tagsList.value = cust.tags ? cust.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
        }

        // Parse addresses
        try {
          if (cust.addresses) {
            const parsed = JSON.parse(cust.addresses);
            addressesList.value = Array.isArray(parsed) ? parsed : [];
          } else {
            addressesList.value = [];
          }
        } catch {
          addressesList.value = [];
        }
      } else {
        creditContext.value = null;
        creditLedger.value = [];
      }
    });

    const persistPreferences = $(async (updates: Partial<{
      accepts_email_marketing: number;
      accepts_sms_marketing: number;
      accepts_whatsapp_marketing: number;
      date_of_birth: string | null;
      anniversary: string | null;
      collect_taxes: number;
      store_credit: number;
      notes: string;
      tags: string;
      addresses: string;
      gst_supply_type: string;
      media_id: string | null;
      image_url: string | null;
      price_list_id: string | null;
    }>) => {
      if (!customer.value) return;
      try {
        await invoke<any>("shop_update_customer_preferences", {
          data: {
            customer_id: customer.value.id,
            ...updates,
          },
        });
        const merged: CustomerBasic = {
          ...customer.value,
          ...updates,
        };
        customer.value = merged;
        if (onCustomerUpdated$) await onCustomerUpdated$(merged);
      } catch (err) {
        console.error("Failed to update customer preferences:", err);
      }
    });

    const handleAvatarSelected = $(async (media: MediaItem) => {
      const url = media.url || media.local_url || "";
      avatarUrl.value = url;
      mediaId.value = media.id;
      await persistPreferences({
        media_id: media.id,
        image_url: url,
      });
    });

    const handleAvatarUploaded = $(async (media: MediaItem) => {
      const url = media.url || media.local_url || "";
      avatarUrl.value = url;
      mediaId.value = media.id;
      await persistPreferences({
        media_id: media.id,
        image_url: url,
      });
    });

    const handleRemoveAvatar = $(async () => {
      avatarUrl.value = null;
      mediaId.value = null;
      await persistPreferences({
        media_id: null,
        image_url: null,
      });
    });

    const handleSaveContact = $(async () => {
      if (!customer.value || !editName.value.trim()) return;
      try {
        await invoke("shop_update_customer", {
          data: {
            id: customer.value.id,
            name: editName.value.trim(),
            email: editEmail.value.trim() || null,
            phone: editPhone.value.trim() || null,
            gstin: editGstin.value.trim() || null,
            pan: editPan.value.trim() || null,
            dl_no: editDlNo.value.trim() || null,
            billing_addr: editBillingAddr.value.trim() || null,
            city: editCity.value.trim() || null,
            state: editState.value.trim() || null,
            pincode: editPincode.value.trim() || null,
            credit_limit: customer.value.credit_limit || 0,
            wallet_balance: storeCredit.value,
            notes: noteText.value || null,
            tags: JSON.stringify(tagsList.value),
            collect_taxes: collectTaxes.value ? 1 : 0,
            accepts_email_marketing: emailMarketing.value ? 1 : 0,
            accepts_sms_marketing: smsMarketing.value ? 1 : 0,
            accepts_whatsapp_marketing: whatsappMarketing.value ? 1 : 0,
            date_of_birth: dob.value || null,
            anniversary: anniversary.value || null,
            addresses: JSON.stringify(addressesList.value),
            gst_supply_type: gstSupplyType.value,
            media_id: mediaId.value || null,
            image_url: avatarUrl.value || null,
            price_list_id: selectedPriceListId.value || null,
          },
        });
        const updated: CustomerBasic = {
          ...customer.value,
          name: editName.value.trim(),
          email: editEmail.value.trim() || null,
          phone: editPhone.value.trim() || null,
          gstin: editGstin.value.trim() || null,
          pan: editPan.value.trim() || null,
          dl_no: editDlNo.value.trim() || null,
          billing_addr: editBillingAddr.value.trim() || null,
          city: editCity.value.trim() || null,
          state: editState.value.trim() || null,
          pincode: editPincode.value.trim() || null,
          media_id: mediaId.value || null,
          image_url: avatarUrl.value || null,
          price_list_id: selectedPriceListId.value || null,
        };
        customer.value = updated;
        isEditingContact.value = false;
        if (onCustomerUpdated$) await onCustomerUpdated$(updated);
      } catch (err) {
        console.error("Failed to update contact info:", err);
      }
    });

    const handleAddTag = $(async () => {
      const tag = newTagInput.value.trim();
      if (!tag) return;
      if (!tagsList.value.includes(tag)) {
        const next = [...tagsList.value, tag];
        tagsList.value = next;
        newTagInput.value = "";
        showAddTag.value = false;
        await persistPreferences({ tags: JSON.stringify(next) });
        invoke("shop_create_tag", { name: tag, tagType: "customer" }).catch(() => {});
      }
    });

    const handleRemoveTag = $(async (tagToRemove: string) => {
      const next = tagsList.value.filter(t => t !== tagToRemove);
      tagsList.value = next;
      await persistPreferences({ tags: JSON.stringify(next) });
    });

    const handleStartEditAddress = $((addr: CustomerAddress) => {
      editingAddressId.value = addr.id;
      addrName.value = addr.name || "";
      addr1.value = addr.address1 || "";
      addr2.value = addr.address2 || "";
      addrCity.value = addr.city || "";
      addrState.value = addr.state || "";
      addrZip.value = addr.zip || "";
      addrCountry.value = addr.country || "India";
      addrPhone.value = addr.phone || "";
      addrDefault.value = !!addr.is_default;
      showAddAddress.value = true;
    });

    const handleSaveAddress = $(async () => {
      if (!addr1.value.trim() || !addrCity.value.trim()) return;
      let next: CustomerAddress[];
      if (editingAddressId.value) {
        next = addressesList.value.map(a =>
          a.id === editingAddressId.value
            ? {
                id: a.id,
                name: addrName.value.trim() || undefined,
                address1: addr1.value.trim(),
                address2: addr2.value.trim() || undefined,
                city: addrCity.value.trim(),
                state: addrState.value.trim(),
                zip: addrZip.value.trim(),
                country: addrCountry.value.trim(),
                phone: addrPhone.value.trim() || undefined,
                is_default: addrDefault.value || a.is_default,
              }
            : addrDefault.value ? { ...a, is_default: false } : a
        );
      } else {
        const newAddr: CustomerAddress = {
          id: `addr-${Date.now()}`,
          name: addrName.value.trim() || undefined,
          address1: addr1.value.trim(),
          address2: addr2.value.trim() || undefined,
          city: addrCity.value.trim(),
          state: addrState.value.trim(),
          zip: addrZip.value.trim(),
          country: addrCountry.value.trim(),
          phone: addrPhone.value.trim() || undefined,
          is_default: addrDefault.value || addressesList.value.length === 0,
        };
        next = addrDefault.value
          ? [...addressesList.value.map(a => ({ ...a, is_default: false })), newAddr]
          : [...addressesList.value, newAddr];
      }
      addressesList.value = next;
      showAddAddress.value = false;
      editingAddressId.value = null;
      addrName.value = "";
      addr1.value = "";
      addr2.value = "";
      addrCity.value = "";
      addrState.value = "";
      addrZip.value = "";
      addrPhone.value = "";
      addrDefault.value = false;
      await persistPreferences({ addresses: JSON.stringify(next) });
    });

    const handleDeleteAddress = $(async (id: string) => {
      const next = addressesList.value.filter(a => a.id !== id);
      addressesList.value = next;
      await persistPreferences({ addresses: JSON.stringify(next) });
    });

    const handleAdjustCredit = $(async () => {
      const delta = parseFloat(creditDelta.value);
      if (isNaN(delta) || delta === 0 || !customer.value) return;
      try {
        const updated = await invoke<CustomerBasic>("shop_adjust_customer_credit", {
          data: {
            customer_id: customer.value.id,
            delta_amount: delta,
            entry_type: delta > 0 ? "issuance" : "adjustment",
            notes: creditNotes.value.trim() || undefined,
          },
        });
        storeCredit.value = updated.store_credit ?? 0;
        customer.value = updated;
        creditDelta.value = "";
        creditNotes.value = "";
        showCreditAdjust.value = false;
        if (onCustomerUpdated$) await onCustomerUpdated$(updated);
        // Refresh credit ledger history
        const entries = await invoke<CreditLedgerItem[]>("shop_get_customer_credit_ledger", {
          customerId: customer.value.id,
        });
        creditLedger.value = entries || [];
      } catch (err) {
        console.error("Failed to adjust store credit:", err);
      }
    });

    return (
      <>
        <SlideOver
        open={open}
        title={c?.name || editName.value || "Customer"}
        subtitle={c?.email || c?.phone || editPhone.value || editEmail.value || ""}
        width="440px"
        zIndex={zIndex}
      >
        {c && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "2rem" }}>

            {/* ── Top Bar: Remove from cart & Done ────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              {onRemoveFromCart$ && (
                <button
                  type="button"
                  disabled={disableRemoveFromCart}
                  onClick$={$(async () => {
                    if (disableRemoveFromCart) return;
                    if (onRemoveFromCart$) await onRemoveFromCart$();
                    open.value = false;
                  })}
                  title={disableRemoveFromCart ? "Customer is locked for this online order" : undefined}
                  style={{
                    padding: "0.4rem 0.875rem",
                    background: disableRemoveFromCart ? "var(--surface-3)" : "rgba(239,68,68,0.1)",
                    color: disableRemoveFromCart ? "var(--text-secondary)" : "var(--error, #ef4444)",
                    border: `1px solid ${disableRemoveFromCart ? "var(--border)" : "rgba(239,68,68,0.25)"}`,
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: "600",
                    cursor: disableRemoveFromCart ? "not-allowed" : "pointer",
                    opacity: disableRemoveFromCart ? 0.45 : 1,
                  }}
                >
                  Remove from cart
                </button>
              )}

              <button
                type="button"
                onClick$={() => { open.value = false; }}
                style={{
                  marginLeft: "auto",
                  padding: "0.4rem 1rem",
                  background: "var(--button-primary-bg)",
                  color: "var(--button-primary-text)",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.8125rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>

            {/* ── Customer Profile & Avatar Card ────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <div
                style={{
                  width: "3.75rem",
                  height: "3.75rem",
                  borderRadius: "50%",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                  fontWeight: "700",
                  fontSize: "1.25rem",
                  color: "var(--text-primary)",
                  position: "relative",
                }}
              >
                {avatarUrl.value ? (
                  <img
                    src={avatarUrl.value}
                    alt={c.name}
                    width={60}
                    height={60}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  c.name ? c.name.charAt(0).toUpperCase() : <LuUser style="width:1.5rem;height:1.5rem;color:var(--text-secondary);" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: "700", fontSize: "1rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </div>
                {(c.phone || c.email) && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.phone ? `${c.phone}${c.email ? ` • ${c.email}` : ""}` : c.email}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick$={() => { showAvatarPicker.value = true; }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.25rem 0.6rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.25rem",
                      fontSize: "0.72rem",
                      fontWeight: "500",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <LuImage style="width:0.75rem;height:0.75rem;" />
                    {avatarUrl.value ? "Change Photo" : "Add Photo"}
                  </button>
                  <button
                    type="button"
                    onClick$={() => { showAvatarUpload.value = true; }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.25rem 0.6rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.25rem",
                      fontSize: "0.72rem",
                      fontWeight: "500",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <LuUpload style="width:0.75rem;height:0.75rem;" />
                    Upload
                  </button>
                  {avatarUrl.value && (
                    <button
                      type="button"
                      onClick$={handleRemoveAvatar}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--error)",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Credit Line & Account Balance (TOP) ──────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Credit Line &amp; Balance
                </span>
                <button
                  type="button"
                  onClick$={() => { isEditingCreditLimit.value = !isEditingCreditLimit.value; }}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                >
                  {isEditingCreditLimit.value ? "Cancel" : "Edit Limit"}
                </button>
              </div>

              {/* Edit Credit Limit inline */}
              {isEditingCreditLimit.value && (
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Credit Limit (₹)"
                    value={newCreditLimit.value}
                    onInput$={(e) => { newCreditLimit.value = (e.target as HTMLInputElement).value; }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick$={$(async () => {
                      const limit = parseFloat(newCreditLimit.value) || 0;
                      await invoke("shop_update_customer", {
                        data: {
                          id: customer.value!.id,
                          name: editName.value.trim() || customer.value!.name,
                          email: editEmail.value.trim() || null,
                          phone: editPhone.value.trim() || null,
                          gstin: editGstin.value.trim() || null,
                          pan: editPan.value.trim() || null,
                          dl_no: editDlNo.value.trim() || null,
                          billing_addr: editBillingAddr.value.trim() || null,
                          city: editCity.value.trim() || null,
                          state: editState.value.trim() || null,
                          pincode: editPincode.value.trim() || null,
                          credit_limit: limit,
                          wallet_balance: storeCredit.value,
                          notes: noteText.value || null,
                          tags: JSON.stringify(tagsList.value),
                          collect_taxes: collectTaxes.value ? 1 : 0,
                          accepts_email_marketing: emailMarketing.value ? 1 : 0,
                          accepts_sms_marketing: smsMarketing.value ? 1 : 0,
                          accepts_whatsapp_marketing: whatsappMarketing.value ? 1 : 0,
                          date_of_birth: dob.value || null,
                          anniversary: anniversary.value || null,
                          addresses: JSON.stringify(addressesList.value),
                          gst_supply_type: gstSupplyType.value,
                          media_id: mediaId.value || null,
                          image_url: avatarUrl.value || null,
                        },
                      });
                      if (creditContext.value) {
                        const used = creditContext.value.credit_used;
                        creditContext.value = {
                          ...creditContext.value,
                          credit_limit: limit,
                          available_credit: Math.max(0, limit - used),
                          is_over_limit: used > limit,
                        };
                      }
                      isEditingCreditLimit.value = false;
                      if (onCustomerUpdated$) onCustomerUpdated$({ ...customer.value!, credit_limit: limit });
                    })}
                    style={{ padding: "0 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Save
                  </button>
                </div>
              )}

              {creditContext.value ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", padding: "0.25rem 0" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Credit Limit</div>
                      <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)", marginTop: "0.15rem" }}>
                        {fmt(creditContext.value.credit_limit)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Prior Dues</div>
                      <div style={{ fontWeight: "600", fontSize: "0.875rem", color: creditContext.value.credit_used > 0 ? "var(--error, #ef4444)" : "var(--text-primary)", marginTop: "0.15rem" }}>
                        {fmt(creditContext.value.credit_used)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Available Credit</div>
                      <div style={{ fontWeight: "700", fontSize: "0.875rem", color: creditContext.value.available_credit > 0 ? "#10b981" : "var(--error, #ef4444)", marginTop: "0.15rem" }}>
                        {fmt(creditContext.value.available_credit)}
                      </div>
                    </div>
                  </div>

                  {creditContext.value.outstanding_invoices.length > 0 && (
                    <div style={{ marginTop: "0.625rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
                      <button
                        type="button"
                        onClick$={() => { showOutstanding.value = !showOutstanding.value; }}
                        style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                      >
                        {showOutstanding.value ? "Hide prior unpaid invoices" : `View ${creditContext.value.outstanding_invoices.length} prior unpaid invoice(s)`}
                      </button>
                      {showOutstanding.value && (
                        <div style={{ marginTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "120px", overflowY: "auto" }}>
                          {creditContext.value.outstanding_invoices.map((inv) => (
                            <div key={inv.document_id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.25rem 0", borderBottom: "1px solid var(--border)" }}>
                              <span style={{ color: "var(--text-primary)" }}>{inv.doc_number}</span>
                              <span style={{ color: "var(--error, #ef4444)", fontWeight: "600" }}>Due: {fmt(inv.amount_due)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Limit: {fmt(c.credit_limit || 0)}
                </div>
              )}
            </div>

            {/* ── Spend & Orders Stats ────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>Spend</div>
                <div style={{ fontSize: "1.125rem", fontWeight: "700", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
                  {fmt(c.total_spent || 0)}
                </div>
              </div>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>Orders</div>
                <div style={{ fontSize: "1.125rem", fontWeight: "700", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
                  {c.total_orders || 0} orders
                </div>
              </div>
            </div>

            {/* ── Wallet & Store Credit ───────────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Wallet
                </span>
                {creditLedger.value.length > 0 && (
                  <button
                    type="button"
                    onClick$={() => { showCreditHistory.value = !showCreditHistory.value; }}
                    style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem", padding: 0 }}
                  >
                    <LuHistory style={{ width: "0.8rem", height: "0.8rem" }} />
                    {showCreditHistory.value ? "Hide history" : `History (${creditLedger.value.length})`}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <LuCreditCard style={{ width: "1.1rem", height: "1.1rem", color: "#10b981" }} />
                  <span style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>Wallet (Store credit)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1rem", fontWeight: "700", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(storeCredit.value)}
                  </span>
                  <button
                    type="button"
                    onClick$={() => { showCreditAdjust.value = !showCreditAdjust.value; }}
                    style={{ background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.25rem", padding: "0.2rem 0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer" }}
                  >
                    Adjust
                  </button>
                </div>
              </div>

              {/* Adjust store credit inline */}
              {showCreditAdjust.value && (
                <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="± Amount (e.g. 500 or -200)"
                      value={creditDelta.value}
                      onInput$={(e) => { creditDelta.value = (e.target as HTMLInputElement).value; }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick$={handleAdjustCredit}
                      style={{ padding: "0 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                    >
                      Save
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Reason / Notes (optional)"
                    value={creditNotes.value}
                    onInput$={(e) => { creditNotes.value = (e.target as HTMLInputElement).value; }}
                    style={{ ...inputStyle, fontSize: "0.8125rem", padding: "0.35rem 0.6rem" }}
                  />
                </div>
              )}

              {/* Append-only Credit History Ledger */}
              {showCreditHistory.value && creditLedger.value.length > 0 && (
                <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                    Credit Transaction Ledger
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "160px", overflowY: "auto" }}>
                    {creditLedger.value.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          padding: "0.4rem 0.6rem",
                          background: "var(--field-fill)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span
                            style={{
                              textTransform: "capitalize",
                              fontWeight: "600",
                              color:
                                entry.entry_type === "issuance"
                                  ? "#10b981"
                                  : entry.entry_type === "redemption"
                                  ? "#3b82f6"
                                  : entry.entry_type === "refund"
                                  ? "#a855f7"
                                  : "var(--text-primary)",
                            }}
                          >
                            {entry.entry_type}
                          </span>
                          <span
                            style={{
                              fontWeight: "700",
                              color: entry.amount >= 0 ? "#10b981" : "var(--error, #ef4444)",
                            }}
                          >
                            {entry.amount >= 0 ? `+${fmt(entry.amount)}` : fmt(entry.amount)}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.7rem", marginTop: "0.15rem" }}>
                          <span>{entry.notes || "Store credit transaction"}</span>
                          <span>{fmtDate(entry.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Contact & Business Info ─────────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Contact &amp; Business Info
                </span>
                <button
                  type="button"
                  onClick$={() => { isEditingContact.value = !isEditingContact.value; }}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                >
                  {isEditingContact.value ? "Cancel" : "Edit"}
                </button>
              </div>

              {isEditingContact.value ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Name *"
                      value={editName.value}
                      onInput$={(e) => { editName.value = (e.target as HTMLInputElement).value; }}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. +91 9876543210"
                        value={editPhone.value}
                        onInput$={(e) => { editPhone.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="customer@example.com"
                        value={editEmail.value}
                        onInput$={(e) => { editEmail.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: "0.68rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: "0.35rem", letterSpacing: "0.03em" }}>
                    Tax &amp; Statutory Identifiers
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        GSTIN (15 chars)
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        placeholder="e.g. 27ABCDE1234F1Z5"
                        value={editGstin.value}
                        onInput$={(e) => { editGstin.value = (e.target as HTMLInputElement).value.toUpperCase(); }}
                        style={{ ...inputStyle, textTransform: "uppercase", fontFamily: "monospace" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        PAN (10 chars)
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        placeholder="e.g. ABCDE1234F"
                        value={editPan.value}
                        onInput$={(e) => { editPan.value = (e.target as HTMLInputElement).value.toUpperCase(); }}
                        style={{ ...inputStyle, textTransform: "uppercase", fontFamily: "monospace" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                      Drug License No. (Pharma / Medical)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 20B/21B-MH-12345"
                      value={editDlNo.value}
                      onInput$={(e) => { editDlNo.value = (e.target as HTMLInputElement).value; }}
                      style={{ ...inputStyle, fontFamily: "monospace" }}
                    />
                  </div>

                  <div style={{ fontSize: "0.68rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: "0.35rem", letterSpacing: "0.03em" }}>
                    Billing Address
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                      Street / Building Address
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Shop 4, Market Complex"
                      value={editBillingAddr.value}
                      onInput$={(e) => { editBillingAddr.value = (e.target as HTMLInputElement).value; }}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        City
                      </label>
                      <input
                        type="text"
                        placeholder="City"
                        value={editCity.value}
                        onInput$={(e) => { editCity.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        State / Province
                      </label>
                      <input
                        type="text"
                        placeholder="State"
                        value={editState.value}
                        onInput$={(e) => { editState.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        PIN / ZIP Code
                      </label>
                      <input
                        type="text"
                        placeholder="PIN / ZIP"
                        value={editPincode.value}
                        onInput$={(e) => { editPincode.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick$={handleSaveContact}
                    style={{ alignSelf: "flex-end", marginTop: "0.35rem", padding: "0.4rem 1rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Save Contact
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
                  <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{c.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                  </div>

                  {/* Badges for GSTIN, PAN, DL No */}
                  {(editGstin.value || editPan.value || editDlNo.value) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.2rem" }}>
                      {editGstin.value && (
                        <span style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem", borderRadius: "0.25rem", background: "var(--field-fill)", border: "1px solid var(--border)", fontFamily: "monospace", color: "var(--text-primary)" }}>
                          GSTIN: <strong>{editGstin.value}</strong>
                        </span>
                      )}
                      {editPan.value && (
                        <span style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem", borderRadius: "0.25rem", background: "var(--field-fill)", border: "1px solid var(--border)", fontFamily: "monospace", color: "var(--text-primary)" }}>
                          PAN: <strong>{editPan.value}</strong>
                        </span>
                      )}
                      {editDlNo.value && (
                        <span style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem", borderRadius: "0.25rem", background: "var(--field-fill)", border: "1px solid var(--border)", fontFamily: "monospace", color: "var(--text-primary)" }}>
                          DL: <strong>{editDlNo.value}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Billing address line */}
                  {(editBillingAddr.value || editCity.value || editState.value || editPincode.value) && (
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                      📍 {[
                        editBillingAddr.value,
                        [editCity.value, editState.value].filter(Boolean).join(", "),
                        editPincode.value ? (editCity.value || editState.value ? `- ${editPincode.value}` : editPincode.value) : "",
                      ].filter(Boolean).join(" ")}
                    </div>
                  )}

                  {!c.email && !c.phone && !editGstin.value && !editPan.value && !editDlNo.value && !editBillingAddr.value && !editCity.value && !editPincode.value && (
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontStyle: "italic" }}>
                      No phone, email, tax or address details set.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Marketing Preferences (Custom Checkbox) ─────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", overflow: "hidden" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                Marketing Preferences
              </div>

              {/* Email marketing */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Email marketing</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{emailMarketing.value ? "Customer opted in" : "Not subscribed"}</div>
                </div>
                <CustomCheckbox
                  checked={emailMarketing.value}
                  onChange$={$(async (checked) => {
                    emailMarketing.value = checked;
                    await persistPreferences({ accepts_email_marketing: checked ? 1 : 0 });
                  })}
                />
              </div>

              {/* SMS marketing */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>SMS marketing</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{smsMarketing.value ? "Customer opted in" : "Not subscribed"}</div>
                </div>
                <CustomCheckbox
                  checked={smsMarketing.value}
                  onChange$={$(async (checked) => {
                    smsMarketing.value = checked;
                    await persistPreferences({ accepts_sms_marketing: checked ? 1 : 0 });
                  })}
                />
              </div>

              {/* WhatsApp marketing */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>WhatsApp marketing</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{whatsappMarketing.value ? "Customer opted in" : "Not subscribed"}</div>
                </div>
                <CustomCheckbox
                  checked={whatsappMarketing.value}
                  onChange$={$(async (checked) => {
                    whatsappMarketing.value = checked;
                    await persistPreferences({ accepts_whatsapp_marketing: checked ? 1 : 0 });
                  })}
                />
              </div>
            </div>

            {/* ── Important Dates & Milestones ─────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <LuCalendar style={{ width: "0.85rem", height: "0.85rem" }} />
                  Important Dates &amp; Milestones
                </span>
                <button
                  type="button"
                  onClick$={() => { isEditingDates.value = !isEditingDates.value; }}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                >
                  {isEditingDates.value ? "Cancel" : "Edit Dates"}
                </button>
              </div>

              {isEditingDates.value ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dob.value}
                        onInput$={(e) => { dob.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        Anniversary
                      </label>
                      <input
                        type="date"
                        value={anniversary.value}
                        onInput$={(e) => { anniversary.value = (e.target as HTMLInputElement).value; }}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick$={$(async () => {
                      isEditingDates.value = false;
                      await persistPreferences({
                        date_of_birth: dob.value || null,
                        anniversary: anniversary.value || null,
                      });
                    })}
                    style={{ alignSelf: "flex-end", marginTop: "0.25rem", padding: "0.35rem 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Save Dates
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8125rem" }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Date of Birth</div>
                    <div style={{ color: dob.value ? "var(--text-primary)" : "var(--text-secondary)", fontStyle: dob.value ? "normal" : "italic", marginTop: "0.15rem", fontWeight: dob.value ? "500" : "normal" }}>
                      {dob.value || "Not set"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Anniversary</div>
                    <div style={{ color: anniversary.value ? "var(--text-primary)" : "var(--text-secondary)", fontStyle: anniversary.value ? "normal" : "italic", marginTop: "0.15rem", fontWeight: anniversary.value ? "500" : "normal" }}>
                      {anniversary.value || "Not set"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Addresses ───────────────────────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Addresses ({addressesList.value.length})
                </span>
                <button
                  type="button"
                  onClick$={() => {
                    showAddAddress.value = !showAddAddress.value;
                    editingAddressId.value = null;
                    addrName.value = "";
                    addr1.value = "";
                    addr2.value = "";
                    addrCity.value = "";
                    addrState.value = "";
                    addrZip.value = "";
                    addrPhone.value = "";
                    addrDefault.value = false;
                  }}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                >
                  {showAddAddress.value ? "Cancel" : "Add address"}
                </button>
              </div>

              {/* Add / Edit Address form */}
              {showAddAddress.value && (
                <div style={{ background: "var(--field-fill)", padding: "0.75rem", borderRadius: "0.375rem", marginBottom: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.15rem" }}>
                    {editingAddressId.value ? "Edit Address" : "New Address"}
                  </div>
                  <input type="text" placeholder="Contact Name (optional)" value={addrName.value} onInput$={(e) => { addrName.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                  <input type="text" placeholder="Address Line 1 *" value={addr1.value} onInput$={(e) => { addr1.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                  <input type="text" placeholder="Address Line 2 (optional)" value={addr2.value} onInput$={(e) => { addr2.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
                    <input type="text" placeholder="City *" value={addrCity.value} onInput$={(e) => { addrCity.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                    <input type="text" placeholder="State" value={addrState.value} onInput$={(e) => { addrState.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
                    <input type="text" placeholder="Postal Code" value={addrZip.value} onInput$={(e) => { addrZip.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                    <input type="text" placeholder="Country" value={addrCountry.value} onInput$={(e) => { addrCountry.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                  </div>
                  <input type="tel" placeholder="Phone (optional)" value={addrPhone.value} onInput$={(e) => { addrPhone.value = (e.target as HTMLInputElement).value; }} style={inputStyle} />
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text-primary)", cursor: "pointer", marginTop: "0.25rem" }}>
                    <CustomCheckbox
                      checked={addrDefault.value}
                      onChange$={$((checked) => {
                        addrDefault.value = checked;
                      })}
                    />
                    Set as default address
                  </label>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <button
                      type="button"
                      onClick$={() => {
                        showAddAddress.value = false;
                        editingAddressId.value = null;
                      }}
                      style={{ padding: "0.35rem 0.75rem", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick$={handleSaveAddress}
                      style={{ padding: "0.35rem 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                    >
                      Save Address
                    </button>
                  </div>
                </div>
              )}

              {/* Address list */}
              {addressesList.value.length === 0 && !showAddAddress.value ? (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  No saved addresses.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {addressesList.value.map((addr) => (
                    <div
                      key={addr.id}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "var(--field-fill)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                          {addr.name || c.name}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          {onSelectShippingAddress$ && (
                            <button
                              type="button"
                              onClick$={$(async () => {
                                if (onSelectShippingAddress$) await onSelectShippingAddress$(addr);
                              })}
                              style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.72rem", cursor: "pointer", textDecoration: "underline" }}
                            >
                              Use for shipping
                            </button>
                          )}
                          <button
                            type="button"
                            onClick$={() => handleStartEditAddress(addr)}
                            style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.72rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "0.1rem 0.25rem" }}
                            title="Edit Address"
                          >
                            <LuPencil style={{ width: "0.75rem", height: "0.75rem" }} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick$={() => handleDeleteAddress(addr.id)}
                            style={{ background: "transparent", border: "none", color: "var(--error, #ef4444)", cursor: "pointer", padding: "0.1rem" }}
                            title="Delete Address"
                          >
                            <LuTrash2 style={{ width: "0.85rem", height: "0.85rem" }} />
                          </button>
                        </div>
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                        {addr.address1}
                        {addr.address2 ? `, ${addr.address2}` : ""}
                        {addr.city ? `, ${addr.city}` : ""}
                        {addr.state ? `, ${addr.state}` : ""}
                        {addr.zip ? ` ${addr.zip}` : ""}
                      </div>
                      {addr.is_default && (
                        <div style={{ marginTop: "0.2rem" }}>
                          <span style={{ fontSize: "0.68rem", color: "var(--accent)", fontWeight: "600" }}>Default address</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Notes ───────────────────────────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>Note</span>
                <button
                  type="button"
                  onClick$={() => { isEditingNote.value = !isEditingNote.value; }}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                >
                  {isEditingNote.value ? "Cancel" : noteText.value ? "Edit" : "Add note"}
                </button>
              </div>

              {isEditingNote.value ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <textarea
                    rows={3}
                    placeholder="Enter customer notes…"
                    value={noteText.value}
                    onInput$={(e) => { noteText.value = (e.target as HTMLTextAreaElement).value; }}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                  <button
                    type="button"
                    onClick$={$(async () => {
                      isEditingNote.value = false;
                      await persistPreferences({ notes: noteText.value.trim() });
                    })}
                    style={{ alignSelf: "flex-end", padding: "0.35rem 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Save Note
                  </button>
                </div>
              ) : noteText.value ? (
                <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                  {noteText.value}
                </div>
              ) : (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  No notes.
                </div>
              )}
            </div>

            {/* ── Tags ────────────────────────────────────────────────── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>Tags</span>
                <button
                  type="button"
                  onClick$={() => { showAddTag.value = !showAddTag.value; }}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                >
                  {showAddTag.value ? "Cancel" : "Add tags"}
                </button>
              </div>

              {showAddTag.value && (
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    type="text"
                    placeholder="Tag name (e.g. VIP, Wholesale)"
                    value={newTagInput.value}
                    onInput$={(e) => { newTagInput.value = (e.target as HTMLInputElement).value; }}
                    onKeyDown$={$(async (e: KeyboardEvent) => {
                      if (e.key === "Enter") await handleAddTag();
                    })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick$={handleAddTag}
                    style={{ padding: "0 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Add
                  </button>
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                {tagsList.value.length === 0 ? (
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontStyle: "italic" }}>No tags.</span>
                ) : (
                  tagsList.value.map(tag => (
                    <span
                      key={tag}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.2rem 0.5rem",
                        background: "var(--field-fill)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.25rem",
                        fontSize: "0.75rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      <LuTag style={{ width: "0.65rem", height: "0.65rem", color: "var(--text-secondary)" }} />
                      {tag}
                      <button
                        type="button"
                        onClick$={() => handleRemoveTag(tag)}
                        style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0 0.15rem", lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* ── Customer Options (Collect Taxes & GST Supply Classification) ── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", overflow: "hidden" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                Customer options
              </div>
              
              {/* GST Supply Classification */}
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>GST Supply Type</div>
                  {gstSupplyType.value !== "regular" && (
                    <span style={{ fontSize: "0.68rem", fontWeight: "600", padding: "0.15rem 0.5rem", borderRadius: "1rem", background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
                      Zero-Rated (LUT)
                    </span>
                  )}
                </div>
                <select
                  value={gstSupplyType.value}
                  onChange$={$(async (e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    gstSupplyType.value = val;
                    await persistPreferences({ gst_supply_type: val });
                  })}
                  style={{
                    ...inputStyle,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  <option value="regular">Regular / Domestic (Intra-state CGST+SGST / Inter-state IGST)</option>
                  <option value="sez">SEZ Unit (Zero-rated under LUT without payment of IGST)</option>
                  <option value="export">Export B2B (Zero-rated under LUT without payment of IGST)</option>
                  <option value="overseas_consumer">Overseas Consumer B2C (Zero-rated under LUT)</option>
                </select>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                  {gstSupplyType.value === "regular"
                    ? "Normal domestic tax calculation based on customer and business state."
                    : "Zero-rated 0% tax per GST law. Letter of Undertaking (LUT) declaration will print on invoices."}
                </div>
              </div>

              {/* Pricing Tier / Price List */}
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Pricing Tier / Price List</div>
                  {selectedPriceListId.value ? (
                    (() => {
                      const activePl = priceLists.value.find(p => p.id === selectedPriceListId.value);
                      return activePl && activePl.discount_pct > 0 ? (
                        <span style={{ fontSize: "0.68rem", fontWeight: "600", padding: "0.15rem 0.5rem", borderRadius: "1rem", background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
                          {activePl.discount_pct}% Off Catalog
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.68rem", fontWeight: "600", padding: "0.15rem 0.5rem", borderRadius: "1rem", background: "rgba(99, 102, 241, 0.12)", color: "#6366f1" }}>
                          Custom Rates
                        </span>
                      );
                    })()
                  ) : (
                    <span style={{ fontSize: "0.68rem", fontWeight: "500", color: "var(--text-secondary)" }}>
                      Base Price
                    </span>
                  )}
                </div>
                <select
                  value={selectedPriceListId.value}
                  onChange$={$(async (e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    selectedPriceListId.value = val;
                    await persistPreferences({ price_list_id: val || null });
                    await invoke("shop_assign_customer_price_list", {
                      customerId: customer.value?.id,
                      priceListId: val || null,
                    }).catch(() => {});
                  })}
                  style={{
                    ...inputStyle,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Standard Base Pricing (Default)</option>
                  {priceLists.value.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {`${pl.name}${pl.discount_pct > 0 ? ` (${pl.discount_pct}% off)` : ""}`}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                  {selectedPriceListId.value
                    ? (() => {
                        const pl = priceLists.value.find(p => p.id === selectedPriceListId.value);
                        return pl?.description || "Assigned price list automatically applies rate overrides & tier discounts during billing.";
                      })()
                    : "Customer is charged standard catalog item prices with no automated tier discount."}
                </div>
              </div>

              {/* Collect taxes toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Collect taxes</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                    {collectTaxes.value ? "Tax will be calculated per supply type & catalog rates" : "Explicitly tax exempt (0% tax)"}
                  </div>
                </div>
                <CustomCheckbox
                  checked={collectTaxes.value}
                  onChange$={$(async (checked) => {
                    collectTaxes.value = checked;
                    await persistPreferences({ collect_taxes: checked ? 1 : 0 });
                  })}
                />
              </div>
            </div>

          </div>
        )}
      </SlideOver>

      {/* Avatar Media Picker Modal - rendered outside SlideOver to avoid transform & clipping */}
      <MediaPickerModal
        open={showAvatarPicker}
        filterType="image"
        zIndex={zIndex ? zIndex + 50 : 600}
        onSelected$={handleAvatarSelected}
      />

      {/* Direct Upload Modal for Avatar */}
      <MediaModal
        open={showAvatarUpload}
        zIndex={zIndex ? zIndex + 50 : 600}
        onUploaded$={handleAvatarUploaded}
      />
    </>
  );
}
);
