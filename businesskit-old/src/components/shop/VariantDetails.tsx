// src/components/shop/VariantDetails.tsx
//
// WHAT: Shopify-style Variant Details editor component / SlideOver drawer.
//       Matches the exact visual layout and modal-grade quality of AddProductModal:
//         - Variant media box & sales channels header (clean top box, no ugly dividers)
//         - Slider gallery preview card with real image thumbnails strip (via sliders_get)
//         - Pricing card with Compare-at, Unit price calculation popover:
//             * var(--surface-2) background
//             * Dynamic Category-Filtered Base Measurement Units (only shows matching category options e.g. g -> mg, g, kg)
//             * No middle divider inside unit price popover
//             * Bottom divider touching popover edges
//             * Equal height (2rem / 32px) buttons with 0.5rem radius & high contrast
//         - Taxes & GST card:
//             * Header Charge Tax toggle switch (determines is_taxable)
//             * When Charge Tax toggle is OFF, the sub-fields collapse completely
//             * Inherits real taxRates array passed from parent AddProductModal (e.g. GST 28% — 28%)
//             * Selecting "None (tax-exempt)" sets is_taxable = 0; selecting any tax rate sets is_taxable = 1
//             * GST / Tax Rate select box with Tax Inclusive badge
//             * Selling price includes tax (Tax Inclusive) container card (transparent bg when inactive)
//         - Inventory card:
//             * Location stock table (transparent background, surface3 removed)
//             * Stock Table AND Backorders checkbox placed ABOVE SKU/Barcode
//             * BOTH Stock Table and Backorders checkbox COLLAPSE when Track Inventory is OFF
//             * Per-variant Track Inventory toggle switch, SKU auto-generator, Barcode
//         - Shipping card with interactive Physical Product toggle switch (transparent bg when digital, 2nd divider touches box edge end-to-end)

import {
  component$,
  useStore,
  useSignal,
  useTask$,
  $,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import {
  LuPlus,
  LuSliders,
  LuSave,
  LuImage,
  LuCheck,
  LuPackage,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import type { ShopItemVariant } from "~/components/shop/AddProductModal";
import { MediaPickerModal, type MediaItem as PickerMediaItem } from "~/components/media/MediaPickerModal";
import { SliderPickerModal, type Slider as PickerSlider } from "~/components/media/SliderPickerModal";

export interface VariantDetailsProps {
  open: { value: boolean };
  variant: ShopItemVariant | null;
  parentItem?: Partial<ShopItemVariant>;
  currencySymbol?: string;
  parentTaxRateId?: string;
  parentTaxInclusive?: boolean;
  taxRates?: { id: string; name: string; rate_pct: number }[];
  onSave$?: PropFunction<(updatedVariant: ShopItemVariant) => void>;
}

interface SliderItem {
  id: string;
  media_url?: string;
}

interface SliderData {
  id: string;
  title: string;
  items: SliderItem[];
}

type UnitCategory = "packaging" | "weight" | "volume" | "size" | "area" | "item";

const UNIT_CATEGORY_MAP: Record<string, UnitCategory> = {
  // Packaging & Pharma Units
  strip: "packaging",
  tab: "packaging",
  cap: "packaging",
  box: "packaging",
  pack: "packaging",
  bottle: "packaging",
  vial: "packaging",
  ampoule: "packaging",
  tube: "packaging",
  blister: "packaging",
  carton: "packaging",
  sachet: "packaging",
  jar: "packaging",
  tin: "packaging",
  // Weight
  mg: "weight",
  g: "weight",
  kg: "weight",
  lb: "weight",
  oz: "weight",
  // Volume
  ml: "volume",
  cl: "volume",
  l: "volume",
  "m³": "volume",
  // Size / Length
  mm: "size",
  cm: "size",
  m: "size",
  in: "size",
  ft: "size",
  // Area
  "m²": "area",
  "sq ft": "area",
  // Items & Pieces
  item: "item",
  piece: "item",
  unit: "item",
  pair: "item",
  dozen: "item",
};

const UNIT_OPTIONS: Record<UnitCategory, { value: string; label: string }[]> = {
  packaging: [
    { value: "strip", label: "Strip (strip)" },
    { value: "tab", label: "Tablet (tab)" },
    { value: "cap", label: "Capsule (cap)" },
    { value: "box", label: "Box (box)" },
    { value: "pack", label: "Pack (pack)" },
    { value: "bottle", label: "Bottle (btl)" },
    { value: "vial", label: "Vial (vial)" },
    { value: "ampoule", label: "Ampoule (amp)" },
    { value: "tube", label: "Tube (tube)" },
    { value: "blister", label: "Blister (blister)" },
    { value: "carton", label: "Carton (ctn)" },
    { value: "sachet", label: "Sachet (sachet)" },
    { value: "jar", label: "Jar (jar)" },
    { value: "tin", label: "Tin (tin)" },
  ],
  weight: [
    { value: "mg", label: "Milligram (mg)" },
    { value: "g", label: "Gram (g)" },
    { value: "kg", label: "Kilogram (kg)" },
    { value: "lb", label: "Pound (lb)" },
    { value: "oz", label: "Ounce (oz)" },
  ],
  volume: [
    { value: "ml", label: "Milliliter (ml)" },
    { value: "cl", label: "Centiliter (cl)" },
    { value: "l", label: "Liter (L)" },
    { value: "m³", label: "Cubic meter (m³)" },
  ],
  size: [
    { value: "mm", label: "Millimeter (mm)" },
    { value: "cm", label: "Centimeter (cm)" },
    { value: "m", label: "Meter (m)" },
    { value: "in", label: "Inch (in)" },
    { value: "ft", label: "Foot (ft)" },
  ],
  area: [
    { value: "m²", label: "Square meter (m²)" },
    { value: "sq ft", label: "Square foot (sq ft)" },
  ],
  item: [
    { value: "item", label: "Item (item)" },
    { value: "piece", label: "Piece (pc)" },
    { value: "unit", label: "Unit (unit)" },
    { value: "pair", label: "Pair (pr)" },
    { value: "dozen", label: "Dozen (doz)" },
  ],
};

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill, #1e293b)",
  border: "1px solid var(--border, #334155)",
  borderRadius: "0.375rem",
  color: "var(--text-primary, #f8fafc)",
  fontSize: "0.875rem",
  outline: "none",
};

const labelStyle = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: "600",
  color: "var(--text-secondary, #94a3b8)",
  marginBottom: "0.35rem",
};

const cardStyle = {
  padding: "1.25rem",
  borderRadius: "0.625rem",
  border: "1px solid var(--border, #334155)",
  background: "var(--surface-2, #0f172a)",
  display: "flex",
  flexDirection: "column" as const,
  gap: "1rem",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
};

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

export function generateSku(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const VariantDetails = component$<VariantDetailsProps>(
  ({ open, variant, parentItem, currencySymbol = "₹", parentTaxRateId, parentTaxInclusive, taxRates = [], onSave$ }) => {
    const mediaPickerOpen = useSignal(false);
    const sliderPickerOpen = useSignal(false);
    const unitPricePopoverOpen = useSignal(false);
    const selectedSlider = useSignal<SliderData | null>(null);
    const availableTaxRates = useSignal<{ id: string; name: string; rate_pct: number }[]>([]);
    const taxConfig = useSignal<any>(null);
    const defaultTaxRateId = useSignal<string>("");
    const isDrawerOpen = useSignal(false);
    const lastVariantKey = useSignal("");

    // Physical product expandable toggle state
    const isPhysical = useSignal(true);

    // Scheme & Bonus Promotion Signal
    const hasScheme = useSignal(false);

    // Unit price calculation states
    const unitTotalAmount = useSignal(100);
    const unitTotalUnit = useSignal("g");
    const unitBaseMeasure = useSignal(1);
    const unitBaseUnit = useSignal("kg");
    const isSaving = useSignal(false);

    const form = useStore<ShopItemVariant>({
      name: "",
      sku: "",
      barcode: "",
      price: 0,
      price_delta: 0,
      cost_price: 0,
      compare_price: undefined,
      default_mrp: 0,
      unit_price: 0,
      discount_pct: 0,
      extra_discount: 0,
      stock_qty: 0,
      media_id: "",
      media_url: "",
      slider_id: "",
      seo_og_image: "",
      hsn_sac_code: "",
      weight: 0,
      weight_unit: "kg",
      length: 0,
      width: 0,
      height: 0,
      dimension_unit: "cm",
      pack_size: "",
      conversion_factor: 1,
      country_of_origin: "",
      allow_backorder: 0,
      track_inventory: 1,
      tax_rate_id: "",
      is_taxable: 1,
      tax_inclusive: 0,
      scheme_on: 0,
      scheme_free: 0,
      attributes: "{}",
    });

    // Synchronize tax rates from props or backend
    useTask$(({ track }) => {
      const pRates = track(() => taxRates);
      if (pRates && pRates.length > 0) {
        availableTaxRates.value = pRates;
      }
    });

    // Reactive task updating form whenever drawer opens or variant selection changes
    useTask$(({ track }) => {
      const isOpen = track(() => open.value);
      const v = track(() => variant);
      const p = track(() => parentItem);
      const pTax = track(() => parentTaxRateId);
      const pTaxIncl = track(() => parentTaxInclusive);
      const defTax = track(() => defaultTaxRateId.value);

      if (!isOpen || !v) {
        isDrawerOpen.value = false;
        lastVariantKey.value = "";
        return;
      }

      const currentKey = `${v.id || ""}:${v.name}`;
      if (isDrawerOpen.value && lastVariantKey.value === currentKey) {
        // Drawer is already open for this variant: preserve active user edits in form!
        return;
      }

      isDrawerOpen.value = true;
      lastVariantKey.value = currentKey;

      const resolvedTaxRate = v?.tax_rate_id !== undefined
        ? (v.tax_rate_id || "")
        : (p?.tax_rate_id || (pTax !== undefined ? (pTax || "") : (defTax || "")));

      const baseSellingPrice = p?.price ?? 0;

      const resolvedPrice = (v.price !== undefined && v.price !== null && !isNaN(v.price))
        ? v.price
        : ((v.price_delta || 0) !== 0 ? (baseSellingPrice + v.price_delta) : baseSellingPrice);

      const resolvedDelta = (v.price_delta !== undefined && !isNaN(v.price_delta))
        ? v.price_delta
        : (baseSellingPrice > 0 ? Number((resolvedPrice - baseSellingPrice).toFixed(2)) : 0);

      const resolvedSku = (v.sku && v.sku.trim().length > 0) ? v.sku.trim() : generateSku();

      Object.assign(form, {
        ...v,
        price: resolvedPrice,
        price_delta: resolvedDelta,
        sku: resolvedSku,
        barcode: v.barcode || "",
        cost_price: (v.cost_price && v.cost_price > 0) ? v.cost_price : (p?.cost_price || 0),
        compare_price: (v.compare_price && v.compare_price > 0) ? v.compare_price : undefined,
        default_mrp: (v.default_mrp && v.default_mrp > 0) ? v.default_mrp : (p?.default_mrp || 0),
        discount_pct: (v.discount_pct && v.discount_pct > 0) ? v.discount_pct : (p?.discount_pct || 0),
        extra_discount: (v.extra_discount && v.extra_discount > 0) ? v.extra_discount : (p?.extra_discount || 0),
        pack_size: v.pack_size || p?.pack_size || "",
        conversion_factor: (v.conversion_factor && v.conversion_factor > 0) ? v.conversion_factor : (p?.conversion_factor || 1),
        scheme_on: (v.scheme_on && v.scheme_on > 0) ? v.scheme_on : (p?.scheme_on || 0),
        scheme_free: (v.scheme_free && v.scheme_free > 0) ? v.scheme_free : (p?.scheme_free || 0),
        hsn_sac_code: v.hsn_sac_code || p?.hsn_sac_code || "",
        weight: (v.weight && v.weight > 0) ? v.weight : (p?.weight || 0),
        weight_unit: v.weight_unit || p?.weight_unit || "kg",
        length: ((v as any)?.dim_length || v.length || 0) > 0 ? ((v as any)?.dim_length || v.length) : ((p as any)?.dim_length || p?.length || 0),
        width: (v.width && v.width > 0) ? v.width : (p?.width || 0),
        height: (v.height && v.height > 0) ? v.height : (p?.height || 0),
        dimension_unit: v.dimension_unit || p?.dimension_unit || "cm",
        media_id: v.media_id || "",
        media_url: v.media_url || "",
        slider_id: v.slider_id || "",
        seo_og_image: v.seo_og_image || "",
        unit_price: (v.unit_price && v.unit_price > 0) ? v.unit_price : (p?.unit_price || 0),
        country_of_origin: v.country_of_origin || p?.country_of_origin || "",
        allow_backorder: v.allow_backorder ?? 0,
        track_inventory: v.track_inventory ?? (p?.track_inventory ?? 1),
        tax_rate_id: resolvedTaxRate,
        is_taxable: v.is_taxable ?? (p?.is_taxable ?? (resolvedTaxRate ? 1 : 1)),
        tax_inclusive: v.tax_inclusive ?? (pTaxIncl ? 1 : (p?.tax_inclusive ? 1 : 0)),
      });

      hasScheme.value = Boolean((form.scheme_on || 0) > 0 || (form.scheme_free || 0) > 0);
      isPhysical.value = (form.weight || 0) > 0 || (form.length || 0) > 0 || (form.width || 0) > 0 || (form.height || 0) > 0;
    });

    // Load available tax rates & default tax rate from backend if not passed from parent
    useTask$(() => {
      invoke<any>("fin_get_tax_config")
        .then((cfg) => { taxConfig.value = cfg; })
        .catch(() => {});

      if (availableTaxRates.value.length === 0) {
        invoke<{ id: string; name: string; rate_pct: number }[]>("fin_list_tax_rates")
          .then((rates) => {
            if (rates && rates.length > 0) {
              availableTaxRates.value = rates;
              if (!form.tax_rate_id) {
                const matched = parentTaxRateId || defaultTaxRateId.value || "";
                if (matched) {
                  form.tax_rate_id = matched;
                  form.is_taxable = 1;
                }
              }
            }
          })
          .catch(() => {});
      }

      invoke<string | null>("fin_get_default_tax_rate")
        .then((def) => {
          if (def) {
            defaultTaxRateId.value = def;
            if (!form.tax_rate_id) {
              form.tax_rate_id = parentTaxRateId || def;
              if (form.tax_rate_id) form.is_taxable = 1;
            }
          }
        })
        .catch(() => {});
    });

    // Load slider details using sliders_get command
    useTask$(({ track }) => {
      const sliderId = track(() => form.slider_id);
      if (sliderId) {
        invoke<SliderData>("sliders_get", { sliderId })
          .then((s) => { selectedSlider.value = s; })
          .catch(() => { selectedSlider.value = null; });
      } else {
        selectedSlider.value = null;
      }
    });

    // Keep Base Measure unit strictly aligned to matching Total Amount Unit category
    useTask$(({ track }) => {
      const totalUnit = track(() => unitTotalUnit.value);
      const cat = UNIT_CATEGORY_MAP[totalUnit] || "weight";
      const allowed = UNIT_OPTIONS[cat];
      if (allowed && !allowed.some(o => o.value === unitBaseUnit.value)) {
        unitBaseUnit.value = allowed[0].value;
      }
    });

    let parsedAttrs: Record<string, string> = {};
    try {
      parsedAttrs = JSON.parse(form.attributes || "{}");
    } catch {
      parsedAttrs = {};
    }

    const handleSave$ = $(async () => {
      if (isSaving.value) return;
      isSaving.value = true;
      try {
        if (onSave$) {
          const base = parentItem?.price || 0;
          const currentPrice = (form.price !== undefined && form.price !== null && !isNaN(form.price))
            ? form.price
            : (base + (form.price_delta || 0));
          const currentDelta = form.price_delta !== undefined
            ? form.price_delta
            : (base > 0 ? Number((currentPrice - base).toFixed(2)) : 0);

          await onSave$({
            ...form,
            price: currentPrice,
            price_delta: currentDelta,
            scheme_on: hasScheme.value ? Number(form.scheme_on) || 0 : 0,
            scheme_free: hasScheme.value ? Number(form.scheme_free) || 0 : 0,
          });
        }
        isDrawerOpen.value = false;
        lastVariantKey.value = "";
        open.value = false;
      } finally {
        isSaving.value = false;
      }
    });

    // Profit & Margin calculations
    const cost = form.cost_price || 0;
    const baseSellingPrice = parentItem?.price || 0;
    const currentSellingPrice = (form.price !== undefined && form.price !== 0)
      ? form.price
      : (baseSellingPrice + (form.price_delta || 0));
    const profit = currentSellingPrice - cost;
    const margin = currentSellingPrice > 0 ? ((profit / currentSellingPrice) * 100).toFixed(1) : "0";

    const currentTotalCat = UNIT_CATEGORY_MAP[unitTotalUnit.value] || "weight";
    const allowedBaseUnits = UNIT_OPTIONS[currentTotalCat];

    return (
      <>
        <SlideOver
          open={open}
          title={`Variant: ${form.name || "Edit Variant"}`}
          subtitle="Configure pricing, inventory, shipping dimensions and tax settings for this variant."
          width="580px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "2rem" }}>
            
            {/* ═══ Card 1 — Media & Attributes Header (Both top dividers removed) ═══ */}
            <div style={cardStyle}>
              {/* Variant Name & Colour Hash (#) Input Row */}
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Variant Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onInput$={(e) => { form.name = (e.target as HTMLInputElement).value; }}
                    placeholder="e.g. Lime Green / S"
                    style={inputStyle}
                  />
                </div>

                <div style={{ width: "160px" }}>
                  <label style={labelStyle}>Colour Hash (#)</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {/* Color Hex Live Preview Dot */}
                    <span
                      style={{
                        position: "absolute",
                        left: "0.6rem",
                        width: "0.875rem",
                        height: "0.875rem",
                        borderRadius: "50%",
                        background: form.color_hex || "#9ca3af",
                        border: "1px solid rgba(255,255,255,0.3)",
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      type="text"
                      value={form.color_hex || ""}
                      onInput$={(e) => { form.color_hex = (e.target as HTMLInputElement).value; }}
                      placeholder="#a3e635"
                      style={{ ...inputStyle, paddingLeft: "1.85rem" }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                {/* Media Image Box */}
                <div style={{ position: "relative", width: "4.5rem", height: "4.5rem", flexShrink: 0 }}>
                  {form.media_url ? (
                    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "0.5rem", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-3)" }}>
                      <img src={form.media_url} alt="" width="72" height="72" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        type="button"
                        onClick$={() => { form.media_id = ""; form.media_url = ""; form.seo_og_image = ""; }}
                        style={{ position: "absolute", top: "2px", right: "2px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: "1.25rem", height: "1.25rem", fontSize: "0.7rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick$={() => { mediaPickerOpen.value = true; }}
                      style={{ width: "100%", height: "100%", borderRadius: "0.5rem", border: "1.5px dashed var(--border)", background: "var(--surface-3)", color: "var(--text-secondary)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px" }}
                      title="Add variant image"
                    >
                      <LuPlus style={{ width: "1.25rem", height: "1.25rem" }} />
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", flex: 1 }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <LuSliders style={{ width: "0.875rem", height: "0.875rem", color: "var(--accent)" }} />
                      All sales channels
                    </span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Configure specific image, gallery slider, pricing, and stock for this variant.
                  </span>
                </div>
              </div>

              {/* Slider Gallery Card Preview — Divider Removed */}
              <div>
                <label style={labelStyle}>Gallery Image Slider (Product Carousel)</label>

                {form.slider_id ? (
                  /* Selected Slider Card with Thumbnail Strip Preview */
                  <div
                    style={{
                      padding: "0.875rem",
                      borderRadius: "0.5rem",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.625rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
                          {selectedSlider.value?.title || `Slider: ${form.slider_id}`}
                        </span>
                        {selectedSlider.value && (
                          <span style={{ padding: "0.15rem 0.4rem", borderRadius: "0.25rem", background: "var(--surface-2)", color: "var(--text-secondary)", fontSize: "0.7rem", fontWeight: "600" }}>
                            {selectedSlider.value.items.length} {selectedSlider.value.items.length === 1 ? "image" : "images"}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <button
                          type="button"
                          onClick$={() => { sliderPickerOpen.value = true; }}
                          style={{ padding: "0.3rem 0.6rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer" }}
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick$={() => { form.slider_id = ""; selectedSlider.value = null; }}
                          style={{ padding: "0.3rem 0.6rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--error)", cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Image Thumbnails Strip */}
                    <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
                      {!selectedSlider.value || selectedSlider.value.items.length === 0 ? (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                          No images in this slider
                        </div>
                      ) : (
                        selectedSlider.value.items.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            style={{
                              width: "3.5rem",
                              height: "3.5rem",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              overflow: "hidden",
                              background: "var(--surface-2)",
                              flexShrink: 0,
                            }}
                          >
                            {item.media_url ? (
                              <img src={item.media_url} alt="Slide preview" width="48" height="48" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                                <LuImage style={{ width: "1rem", height: "1rem" }} />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick$={() => { sliderPickerOpen.value = true; }}
                    style={{
                      width: "100%",
                      padding: "0.625rem",
                      borderRadius: "0.5rem",
                      border: "1.5px dashed var(--border)",
                      background: "var(--surface-3)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      fontWeight: "500",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <LuSliders style={{ width: "1rem", height: "1rem", color: "var(--accent)" }} />
                    + Select Image Gallery Slider for Variant
                  </button>
                )}
              </div>

              {/* Option Key/Values List — Divider Removed */}
              {Object.keys(parsedAttrs).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {Object.entries(parsedAttrs).map(([optKey, optVal]) => {
                    if (optKey === "color" || optKey === "color_name") return null;
                    return (
                      <div key={optKey}>
                        <label style={{ ...labelStyle, textTransform: "capitalize" }}>{optKey}</label>
                        <input
                          type="text"
                          value={optVal}
                          readOnly
                          style={{ ...inputStyle, background: "var(--surface-3)", cursor: "not-allowed" }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═══ Card 2 — Price (Polished Surface-2 Background & Theme Colors) ═══ */}
            <div style={cardStyle}>
              <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                Pricing
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Variant Price (Selling Price)</label>
                    {parentItem?.price !== undefined && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                        Base: {currencySymbol}{parentItem.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontWeight: "600", fontSize: "0.875rem" }}>
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.price !== undefined && form.price !== null ? form.price : ""}
                      onInput$={(e) => {
                        const val = parseFloat((e.target as HTMLInputElement).value);
                        form.price = isNaN(val) ? 0 : val;
                        const base = parentItem?.price || 0;
                        form.price_delta = Number((form.price - base).toFixed(2));
                      }}
                      placeholder="0.00"
                      style={{ ...inputStyle, paddingLeft: "1.75rem" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Price Delta (+/- from base)</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontWeight: "600", fontSize: "0.875rem" }}>
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.price_delta}
                      onInput$={(e) => {
                        const delta = parseFloat((e.target as HTMLInputElement).value) || 0;
                        form.price_delta = delta;
                        const base = parentItem?.price || 0;
                        form.price = Number((base + delta).toFixed(2));
                      }}
                      placeholder="0.00"
                      style={{ ...inputStyle, paddingLeft: "1.75rem" }}
                    />
                  </div>
                </div>
              </div>

              {/* Additional Display Prices Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Additional display prices
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {/* Compare-at Price */}
                  <div>
                    <label style={labelStyle}>Compare-at price</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontWeight: "600", fontSize: "0.875rem" }}>
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        name="variant_compare_price"
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-form-type="other"
                        step="0.01"
                        value={form.compare_price || ""}
                        onInput$={(e) => {
                          const val = parseFloat((e.target as HTMLInputElement).value);
                          form.compare_price = isNaN(val) || val <= 0 ? undefined : val;
                        }}
                        placeholder="0.00"
                        style={{ ...inputStyle, paddingLeft: "1.75rem" }}
                      />
                    </div>
                  </div>

                  {/* Unit price with Popover Selector — No middle divider, dynamic base measure filtering */}
                  <div style={{ position: "relative" }}>
                    <label style={labelStyle}>Unit price</label>
                    <button
                      type="button"
                      onClick$={() => { unitPricePopoverOpen.value = !unitPricePopoverOpen.value; }}
                      style={{
                        ...inputStyle,
                        background: "var(--surface-2, #0f172a)",
                        textAlign: "left" as const,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "var(--text-primary)" }}>
                        {(form.unit_price || 0) > 0 ? `${currencySymbol}${(form.unit_price || 0).toFixed(2)} / ${unitTotalAmount.value}${unitTotalUnit.value}` : "--"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>▼</span>
                    </button>

                    {/* Popover Card */}
                    {unitPricePopoverOpen.value && (
                      <div style={{ position: "absolute", top: "100%", right: "0", marginTop: "0.375rem", width: "310px", padding: "1rem", background: "var(--surface-2, #0f172a)", border: "1px solid var(--border, #334155)", borderRadius: "0.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", zIndex: 10, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {/* Total amount section */}
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                            Total amount
                          </div>
                          <div style={{ display: "flex", gap: "0.375rem" }}>
                            <input
                              type="number"
                              value={unitTotalAmount.value}
                              onInput$={(e) => { unitTotalAmount.value = parseFloat((e.target as HTMLInputElement).value) || 1; }}
                              style={{ ...inputStyle, height: "32px", flex: 1, fontSize: "0.8125rem" }}
                            />
                            <select
                              value={unitTotalUnit.value}
                              onChange$={(e) => { unitTotalUnit.value = (e.target as HTMLSelectElement).value; }}
                              style={{
                                ...inputStyle,
                                height: "32px",
                                width: "135px",
                                fontSize: "0.75rem",
                                backgroundImage: SELECT_ARROW,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right 0.5rem center",
                                appearance: "none" as const,
                                paddingRight: "1.5rem",
                              }}
                            >
                              <optgroup label="Packaging & Pharma">
                                <option value="strip">Strip (strip)</option>
                                <option value="tab">Tablet (tab)</option>
                                <option value="cap">Capsule (cap)</option>
                                <option value="box">Box (box)</option>
                                <option value="pack">Pack (pack)</option>
                                <option value="bottle">Bottle (btl)</option>
                                <option value="vial">Vial (vial)</option>
                                <option value="ampoule">Ampoule (amp)</option>
                                <option value="tube">Tube (tube)</option>
                                <option value="blister">Blister (blister)</option>
                                <option value="carton">Carton (ctn)</option>
                                <option value="sachet">Sachet (sachet)</option>
                              </optgroup>
                              <optgroup label="Weight">
                                <option value="mg">Milligram (mg)</option>
                                <option value="g">Gram (g)</option>
                                <option value="kg">Kilogram (kg)</option>
                                <option value="lb">Pound (lb)</option>
                                <option value="oz">Ounce (oz)</option>
                              </optgroup>
                              <optgroup label="Volume">
                                <option value="ml">Milliliter (ml)</option>
                                <option value="cl">Centiliter (cl)</option>
                                <option value="l">Liter (L)</option>
                                <option value="m³">Cubic meter (m³)</option>
                              </optgroup>
                              <optgroup label="Size & Length">
                                <option value="mm">Millimeter (mm)</option>
                                <option value="cm">Centimeter (cm)</option>
                                <option value="m">Meter (m)</option>
                                <option value="in">Inch (in)</option>
                                <option value="ft">Foot (ft)</option>
                              </optgroup>
                              <optgroup label="Area">
                                <option value="m²">Square meter (m²)</option>
                                <option value="sq ft">Square foot (sq ft)</option>
                              </optgroup>
                              <optgroup label="Per item / Pieces">
                                <option value="item">Item (item)</option>
                                <option value="piece">Piece (pc)</option>
                                <option value="unit">Unit (unit)</option>
                                <option value="pair">Pair (pr)</option>
                                <option value="dozen">Dozen (doz)</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>

                        {/* Base measure section (NO MIDDLE DIVIDER, ONLY SHOWS MATCHING CATEGORY UNITS) */}
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                            Base measure
                          </div>
                          <div style={{ display: "flex", gap: "0.375rem" }}>
                            <input
                              type="number"
                              value={unitBaseMeasure.value}
                              onInput$={(e) => { unitBaseMeasure.value = parseFloat((e.target as HTMLInputElement).value) || 1; }}
                              style={{ ...inputStyle, height: "32px", flex: 1, fontSize: "0.8125rem" }}
                            />
                            <select
                              value={unitBaseUnit.value}
                              onChange$={(e) => { unitBaseUnit.value = (e.target as HTMLSelectElement).value; }}
                              style={{
                                ...inputStyle,
                                height: "32px",
                                width: "135px",
                                fontSize: "0.75rem",
                                backgroundImage: SELECT_ARROW,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right 0.5rem center",
                                appearance: "none" as const,
                                paddingRight: "1.5rem",
                              }}
                            >
                              {allowedBaseUnits.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Footer buttons with divider touching edge & 0.5rem radius equal height */}
                        <div style={{ margin: "0.5rem -1rem 0 -1rem", padding: "0.75rem 1rem 0 1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick$={() => {
                              form.unit_price = 0;
                              unitPricePopoverOpen.value = false;
                            }}
                            style={{ height: "2rem", padding: "0 0.75rem", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.5rem", color: "var(--error, #ef4444)", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                          >
                            Clear
                          </button>
                          <div style={{ display: "flex", gap: "0.375rem" }}>
                            <button
                              type="button"
                              onClick$={() => { unitPricePopoverOpen.value = false; }}
                              style={{ height: "2rem", padding: "0 0.75rem", background: "var(--surface-3, #1e293b)", border: "1px solid var(--border, #334155)", borderRadius: "0.5rem", color: "var(--text-primary, #f8fafc)", fontSize: "0.75rem", fontWeight: "500", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick$={() => {
                                const base = parentItem?.price || 0;
                                const effectivePrice = (form.price !== undefined && form.price !== 0)
                                  ? form.price
                                  : (base + (form.price_delta || 0));
                                const calc = effectivePrice > 0 ? Number(((effectivePrice / (unitTotalAmount.value || 1)) * (unitBaseMeasure.value || 1)).toFixed(2)) : 0;
                                form.unit_price = calc;
                                unitPricePopoverOpen.value = false;
                              }}
                              style={{ height: "2rem", padding: "0 0.75rem", background: "var(--button-primary-bg, #2563eb)", border: "none", borderRadius: "0.5rem", color: "var(--button-primary-text, #ffffff)", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost, Profit & Margin Cards */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ padding: "0.35rem 0.75rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    Cost <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{currencySymbol}{cost.toFixed(2)}</span>
                  </div>
                  <div style={{ padding: "0.35rem 0.75rem", borderRadius: "0.375rem", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    Profit <span style={{ fontWeight: "600", color: "#22c55e" }}>{profit >= 0 ? `+${currencySymbol}${profit.toFixed(2)}` : `-${currencySymbol}${Math.abs(profit).toFixed(2)}`}</span>
                  </div>
                  <div style={{ padding: "0.35rem 0.75rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    Margin <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{margin}%</span>
                  </div>
                </div>

                {/* MRP Ceiling & Cost Price Inputs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={labelStyle}>Default MRP Ceiling</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.default_mrp || 0}
                      onInput$={(e) => { form.default_mrp = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      placeholder="MRP"
                      style={{ ...inputStyle, fontSize: "0.8125rem" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cost per item (Purchase/Mfg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.cost_price || 0}
                      onInput$={(e) => { form.cost_price = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      placeholder="Cost"
                      style={{ ...inputStyle, fontSize: "0.8125rem" }}
                    />
                  </div>
                </div>

                {/* Discounts Row: dis1 & dis2 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={labelStyle}>Primary Discount % (dis1)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={form.discount_pct || 0}
                      onInput$={(e) => { form.discount_pct = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      placeholder="dis1 %"
                      style={{ ...inputStyle, fontSize: "0.8125rem" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Extra Discount % (dis2)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={form.extra_discount || 0}
                      onInput$={(e) => { form.extra_discount = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      placeholder="dis2 %"
                      style={{ ...inputStyle, fontSize: "0.8125rem" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Card 2.5 — Taxes & GST (HEADER CHARGE TAX TOGGLE + SUB-FIELDS COLLAPSED WHEN OFF) ════ */}
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                  Taxes & GST
                </div>

                {/* Header Charge Tax Toggle Switch */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: form.is_taxable === 1 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600" }}>
                    Charge tax
                  </span>
                  <button
                    type="button"
                    onClick$={() => {
                      const next = form.is_taxable === 1 ? 0 : 1;
                      form.is_taxable = next;
                      if (next === 0) {
                        form.tax_rate_id = "";
                      } else if (!form.tax_rate_id) {
                        form.tax_rate_id = parentTaxRateId || defaultTaxRateId.value || availableTaxRates.value[0]?.id || "";
                      }
                    }}
                    style={{
                      width: "2.25rem",
                      height: "1.25rem",
                      borderRadius: "9999px",
                      background: form.is_taxable === 1 ? "var(--accent, #2563eb)" : "var(--border, #475569)",
                      position: "relative",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                    title="Toggle tax charging for this variant"
                  >
                    <span
                      style={{
                        width: "0.875rem",
                        height: "0.875rem",
                        borderRadius: "50%",
                        background: form.is_taxable === 1 ? "var(--surface-1, #090d16)" : "#ffffff",
                        position: "absolute",
                        top: "50%",
                        transform: "translateY(-50%)",
                        left: form.is_taxable === 1 ? "1.125rem" : "0.1875rem",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* COLLAPSE SUB-FIELDS WHEN CHARGE TAX IS OFF */}
              {form.is_taxable === 1 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* GST / Tax Rate Dropdown Selector matching AddProductModal */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>GST / Tax Rate</label>
                      {form.tax_inclusive === 1 && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: "600",
                            color: "var(--accent)",
                            background: "rgba(59, 130, 246, 0.12)",
                            border: "1px solid var(--accent)",
                            borderRadius: "0.25rem",
                            padding: "0.1rem 0.4rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <LuCheck style={{ width: "0.75rem", height: "0.75rem", strokeWidth: 3 }} />
                          Tax Inclusive
                        </span>
                      )}
                    </div>
                    <select
                      value={form.tax_rate_id || ""}
                      onChange$={(e) => {
                        const val = (e.target as HTMLSelectElement).value;
                        form.tax_rate_id = val;
                        if (val === "exempt" || val === "nil") {
                          form.is_taxable = 0;
                        } else {
                          form.is_taxable = 1;
                        }
                      }}
                      style={{
                        ...inputStyle,
                        height: "38px",
                        backgroundImage: SELECT_ARROW,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 0.75rem center",
                        appearance: "none" as const,
                        paddingRight: "2rem",
                        borderColor: form.tax_inclusive === 1 ? "var(--accent)" : "var(--border)",
                      }}
                    >
                      <option value="">
                        {taxConfig.value?.tax_mode === "global" ? "Global Tax Settings" : "None"}
                      </option>
                      {!availableTaxRates.value.some(r => r.id === "exempt" || r.id === "nil" || r.rate_pct === 0) && (
                        <option value="exempt">Exempt / Nil — 0%</option>
                      )}
                      {availableTaxRates.value.map(r => (
                        <option key={r.id} value={r.id}>
                          {`${r.name} — ${r.rate_pct}%`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tax Inclusive Container Box (Transparent bg when unselected) */}
                  <div
                    style={{
                      padding: "0.625rem 0.875rem",
                      borderRadius: "0.5rem",
                      border: form.tax_inclusive === 1 ? "1px solid rgba(59, 130, 246, 0.5)" : "1px solid var(--border)",
                      background: form.tax_inclusive === 1 ? "rgba(59, 130, 246, 0.08)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onClick$={() => { form.tax_inclusive = form.tax_inclusive === 1 ? 0 : 1; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      <div
                        style={{
                          width: "1.125rem",
                          height: "1.125rem",
                          borderRadius: "0.25rem",
                          border: form.tax_inclusive === 1 ? "1.5px solid #3b82f6" : "1.5px solid var(--text-secondary)",
                          background: form.tax_inclusive === 1 ? "#3b82f6" : "transparent",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {form.tax_inclusive === 1 && (
                          <LuCheck style={{ width: "0.75rem", height: "0.75rem", strokeWidth: 3 }} />
                        )}
                      </div>
                      <div>
                        <span style={{ fontSize: "0.875rem", fontWeight: "500", color: form.tax_inclusive === 1 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                          Selling price includes tax (Tax Inclusive)
                        </span>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                          All prices shown for this variant include tax in calculation
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "0.625rem 0.875rem", borderRadius: "0.375rem", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Tax calculations disabled for this variant.
                </div>
              )}
            </div>

            {/* ═══ Card 3 — Inventory (Backorders & Stock Table placed ABOVE SKU/Barcode; Both collapse when tracking is OFF) ═══ */}
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                  Inventory
                </div>

                {/* Per-Variant Track Inventory Switch Toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8125rem", color: form.track_inventory === 1 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600" }}>
                    Track inventory
                  </span>
                  <button
                    type="button"
                    onClick$={() => { form.track_inventory = form.track_inventory === 1 ? 0 : 1; }}
                    style={{
                      width: "2.25rem",
                      height: "1.25rem",
                      borderRadius: "9999px",
                      background: form.track_inventory === 1 ? "var(--accent, #2563eb)" : "var(--border, #475569)",
                      position: "relative",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                    title="Toggle inventory tracking for this variant"
                  >
                    <span
                      style={{
                        width: "0.875rem",
                        height: "0.875rem",
                        borderRadius: "50%",
                        background: form.track_inventory === 1 ? "var(--surface-1, #090d16)" : "#ffffff",
                        position: "absolute",
                        top: "50%",
                        transform: "translateY(-50%)",
                        left: form.track_inventory === 1 ? "1.125rem" : "0.1875rem",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Both Stock Table AND Backorders Row COLLAPSE when Track Inventory is OFF */}
              {form.track_inventory === 1 ? (
                <>
                  {/* Location Stock Table (Transparent background, surface3 fill removed) */}
                  <div style={{ borderRadius: "0.375rem", border: "1px solid var(--border)", background: "transparent", padding: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)" }}>
                        Primary Store Location / Warehouse
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                        Available Stock Quantity
                      </div>
                    </div>
                    <input
                      type="number"
                      value={form.stock_qty || 0}
                      onInput$={(e) => { form.stock_qty = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      style={{ ...inputStyle, width: "100px", height: "2.25rem", textAlign: "right" as const, fontWeight: "600", fontSize: "0.9375rem" }}
                    />
                  </div>

                  {/* Continue selling when out of stock (Backorders) — PLACED ABOVE SKU & BARCODE */}
                  <div
                    onClick$={() => { form.allow_backorder = form.allow_backorder === 1 ? 0 : 1; }}
                    style={{
                      padding: "0.625rem 0.875rem",
                      borderRadius: "0.375rem",
                      background: form.allow_backorder === 1 ? "rgba(59,130,246,0.08)" : "transparent",
                      border: form.allow_backorder === 1 ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      <div
                        style={{
                          width: "1.125rem",
                          height: "1.125rem",
                          borderRadius: "0.25rem",
                          border: form.allow_backorder === 1 ? "1.5px solid #3b82f6" : "1.5px solid var(--text-secondary)",
                          background: form.allow_backorder === 1 ? "#3b82f6" : "transparent",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {form.allow_backorder === 1 && (
                          <LuCheck style={{ width: "0.75rem", height: "0.75rem", strokeWidth: 3 }} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: form.allow_backorder === 1 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                          Continue selling when out of stock (Backorders)
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                          Allow customers to order this variant when stock reaches 0
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: "0.625rem 0.875rem", borderRadius: "0.375rem", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Inventory tracking disabled for this variant. Stock quantity & backorders are not managed.
                </div>
              )}

              {/* Prominent SKU & Barcode Fields with Auto-Generator */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>SKU (Stock Keeping Unit)</label>
                    <button
                      type="button"
                      onClick$={() => { form.sku = generateSku(); }}
                      style={{ fontSize: "0.7rem", fontWeight: "600", color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: "0" }}
                      title="Auto-generate SKU for this variant"
                    >
                      ✦ Auto-generate
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 8WPEF7F2B1"
                    value={form.sku || ""}
                    onInput$={(e) => { form.sku = (e.target as HTMLInputElement).value; }}
                    style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8125rem" }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Barcode (ISBN, UPC, GTIN)</label>
                  <input
                    type="text"
                    placeholder="Barcode"
                    value={form.barcode || ""}
                    onInput$={(e) => { form.barcode = (e.target as HTMLInputElement).value; }}
                    style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8125rem" }}
                  />
                </div>
              </div>
            </div>

            {/* ═══ Card 4 — Shipping, Dimensions, & Customs (Transparent bg when inactive) ════ */}
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <LuPackage style={{ width: "1rem", height: "1rem", color: "var(--accent)" }} />
                  Physical Product Shipping & Customs
                </div>

                {/* Physical Product Toggle Switch */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: isPhysical.value ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600" }}>
                    Physical product
                  </span>
                  <button
                    type="button"
                    onClick$={() => { isPhysical.value = !isPhysical.value; }}
                    style={{
                      width: "2.25rem",
                      height: "1.25rem",
                      borderRadius: "9999px",
                      background: isPhysical.value ? "var(--accent, #2563eb)" : "var(--border, #475569)",
                      position: "relative",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                    title="Toggle physical product shipping dimensions"
                  >
                    <span
                      style={{
                        width: "0.875rem",
                        height: "0.875rem",
                        borderRadius: "50%",
                        background: isPhysical.value ? "var(--surface-1, #090d16)" : "#ffffff",
                        position: "absolute",
                        top: "50%",
                        transform: "translateY(-50%)",
                        left: isPhysical.value ? "1.125rem" : "0.1875rem",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Physical Product Section (Top divider removed) */}
              {isPhysical.value ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Package Dimensions (LxWxH) & Weight Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={labelStyle}>Product Dimensions (L × W × H)</label>
                      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                        <input
                          type="number"
                          placeholder="Length"
                          value={form.length || ""}
                          onInput$={(e) => { form.length = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                          style={{ ...inputStyle, fontSize: "0.8125rem" }}
                        />
                        <span style={{ color: "var(--text-secondary)", fontWeight: "600" }}>×</span>
                        <input
                          type="number"
                          placeholder="Width"
                          value={form.width || ""}
                          onInput$={(e) => { form.width = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                          style={{ ...inputStyle, fontSize: "0.8125rem" }}
                        />
                        <span style={{ color: "var(--text-secondary)", fontWeight: "600" }}>×</span>
                        <input
                          type="number"
                          placeholder="Height"
                          value={form.height || ""}
                          onInput$={(e) => { form.height = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                          style={{ ...inputStyle, fontSize: "0.8125rem" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Dimension Unit</label>
                      <select
                        value={form.dimension_unit || "cm"}
                        onChange$={(e) => { form.dimension_unit = (e.target as HTMLSelectElement).value; }}
                        style={{ ...inputStyle, height: "38px", backgroundImage: SELECT_ARROW, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", appearance: "none" as const, paddingRight: "2rem" }}
                      >
                        <option value="cm">cm</option>
                        <option value="in">in</option>
                        <option value="mm">mm</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                  </div>

                  {/* Weight Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={labelStyle}>Product Weight</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.0"
                        value={form.weight || 0}
                        onInput$={(e) => { form.weight = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Weight Unit</label>
                      <select
                        value={form.weight_unit || "kg"}
                        onChange$={(e) => { form.weight_unit = (e.target as HTMLSelectElement).value; }}
                        style={{ ...inputStyle, height: "38px", backgroundImage: SELECT_ARROW, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", appearance: "none" as const, paddingRight: "2rem" }}
                      >
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="lb">lb</option>
                        <option value="oz">oz</option>
                      </select>
                    </div>
                  </div>

                  {/* Packaging Spec & Units per Pack (Conversion Factor) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={labelStyle}>
                        Packaging Size
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginLeft: "0.375rem" }}>(e.g. 10 TAB / Box of 24)</span>
                      </label>
                      <input
                        type="text"
                        value={form.pack_size || ""}
                        onInput$={(e) => { form.pack_size = (e.target as HTMLInputElement).value; }}
                        placeholder="e.g. 10 TAB / 15x1x10 / Box of 24"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Units per Pack
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginLeft: "0.375rem" }}>(Conversion Factor)</span>
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.conversion_factor || 1}
                        onInput$={(e) => { form.conversion_factor = parseFloat((e.target as HTMLInputElement).value) || 1; }}
                        placeholder="1"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* 2nd Divider Touches Box Edge (full width margin/padding trick) */}
                  <div style={{ margin: "0.5rem -1.25rem 0 -1.25rem", padding: "0.875rem 1.25rem 0 1.25rem", borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={labelStyle}>Country code of origin</label>
                        <select
                          value={form.country_of_origin || ""}
                          onChange$={(e) => { form.country_of_origin = (e.target as HTMLSelectElement).value; }}
                          style={{ ...inputStyle, height: "38px", backgroundImage: SELECT_ARROW, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", appearance: "none" as const, paddingRight: "2rem" }}
                        >
                          <option value="">Select country</option>
                          <option value="IN">India (IN)</option>
                          <option value="US">United States (US)</option>
                          <option value="GB">United Kingdom (GB)</option>
                          <option value="CN">China (CN)</option>
                          <option value="DE">Germany (DE)</option>
                          <option value="JP">Japan (JP)</option>
                          <option value="AE">United Arab Emirates (AE)</option>
                        </select>
                      </div>

                      <div>
                        <label style={labelStyle}>HSN / SAC Customs Code</label>
                        <input
                          type="text"
                          placeholder="e.g. 30049099"
                          value={form.hsn_sac_code || ""}
                          onInput$={(e) => { form.hsn_sac_code = (e.target as HTMLInputElement).value.toUpperCase(); }}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Digital product or service — no shipping or physical package dimensions required.
                </div>
              )}
            </div>

            {/* ═══ Card 5 — Scheme & Promotional Offer (Buy X Get Y Free) ════ */}
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                    Scheme & Promotional Offers
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Buy X Get Y Free promotion rules for this variant
                  </div>
                </div>

                {/* Scheme Toggle Switch */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: hasScheme.value ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600" }}>
                    {hasScheme.value ? "Active" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    onClick$={() => { hasScheme.value = !hasScheme.value; }}
                    style={{
                      width: "2.25rem",
                      height: "1.25rem",
                      borderRadius: "9999px",
                      background: hasScheme.value ? "var(--accent, #2563eb)" : "var(--border, #475569)",
                      position: "relative",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                    title="Toggle promotional buy/get scheme for this variant"
                  >
                    <span
                      style={{
                        width: "0.875rem",
                        height: "0.875rem",
                        borderRadius: "50%",
                        background: hasScheme.value ? "var(--surface-1, #090d16)" : "#ffffff",
                        position: "absolute",
                        top: "50%",
                        transform: "translateY(-50%)",
                        left: hasScheme.value ? "1.125rem" : "0.1875rem",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  </button>
                </div>
              </div>

              {hasScheme.value ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={labelStyle}>Buy Quantity (Scheme On)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 10"
                        value={form.scheme_on || ""}
                        onInput$={(e) => { form.scheme_on = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                        style={inputStyle}
                      />
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                        Minimum purchase units required
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Bonus Free Units (Scheme Free)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 1"
                        value={form.scheme_free || ""}
                        onInput$={(e) => { form.scheme_free = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                        style={inputStyle}
                      />
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                        Free units added on bill
                      </div>
                    </div>
                  </div>

                  {(form.scheme_on || 0) > 0 && (form.scheme_free || 0) > 0 && (
                    <div
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "rgba(139, 92, 246, 0.08)",
                        border: "1px solid rgba(139, 92, 246, 0.25)",
                        borderRadius: "0.375rem",
                        color: "#8b5cf6",
                        fontSize: "0.8125rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>🎁 Scheme Offer:</span>
                      <span style={{ color: "var(--text-primary)" }}>
                        Buy {form.scheme_on} → Get {form.scheme_free} FREE units
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  No active promotional scheme for this variant. Toggle on to configure Buy X Get Y Free.
                </div>
              )}
            </div>

          </div>

          {/* ── Pinned Save Footer (Fixed at Bottom matching AddProductModal) ── */}
          <div
            q:slot="footer"
            style={{
              position: "relative",
              zIndex: "200",
              padding: "1rem 1.5rem",
              background: "var(--surface-2)",
              borderTop: "1px solid var(--border)",
              boxSizing: "border-box",
              width: "100%",
            }}
          >
            <button
              type="button"
              onClick$={handleSave$}
              disabled={isSaving.value}
              style={{
                width: "100%",
                height: "2.75rem",
                background: isSaving.value ? "var(--muted)" : "var(--button-primary-bg, #2563eb)",
                color: isSaving.value ? "var(--text-secondary)" : "var(--button-primary-text, #ffffff)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: isSaving.value ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                boxShadow: isSaving.value ? "none" : "0 4px 14px rgba(37, 99, 235, 0.35)",
                opacity: isSaving.value ? 0.7 : 1,
              }}
            >
              <LuSave style={{ width: "1rem", height: "1rem" }} />
              {isSaving.value ? "Saving Variant..." : "Save Variant Details"}
            </button>
          </div>
        </SlideOver>

        {/* Media Picker Modal for Variant */}
        <MediaPickerModal
          open={mediaPickerOpen}
          filterType="image"
          onSelected$={$((media: PickerMediaItem) => {
            form.media_id = media.id;
            form.media_url = media.url;
            form.seo_og_image = media.url;
            mediaPickerOpen.value = false;
          })}
        />

        {/* Slider Picker Modal for Variant */}
        <SliderPickerModal
          open={sliderPickerOpen}
          selectedSliderId={form.slider_id}
          onSelected$={$((slider: PickerSlider) => {
            form.slider_id = slider.id;
            sliderPickerOpen.value = false;
          })}
          onCreateRequested$={$(() => {
            sliderPickerOpen.value = false;
          })}
        />
      </>
    );
  }
);
