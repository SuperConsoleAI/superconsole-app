// src/components/shop/AddProductModal.tsx
//
// WHAT:  Create / Edit product SlideOver for the Shop Products page.
//        Matches the exact design language of LinkModal.tsx:
//          - SlideOver wrapper, SectionTitle dividers, var(--field-fill) inputs
//          - var(--button-primary-bg) / var(--button-primary-text) save button
//          - Accent-border focus ring on every field
//          - Sticky save footer
//
// SECTIONS:
//   Basic     — name, item_type, category, collection, brand, unit, sku, description
//   Media     — main product image (MediaPicker / MediaModal), slider_id, video_url (Shorts/YouTube/Direct), video_media_id
//   Pricing   — selling price, cost price, MRP, discount, GST tax rate
//   Settings  — active toggle (is_active), track inventory toggle

import {
  component$,
  useStore,
  useSignal,
  useComputed$,
  useTask$,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuSave, LuLoader, LuImage, LuVideo, LuPlus, LuPackage, LuCheck, LuTrash2, LuChevronDown, LuChevronUp, LuSearch, LuPencil } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { ShopStaffSelector } from "~/components/shop/ShopStaffSelector";
import { CategorySelect } from "~/components/shop/CategorySelect";
import { CollectionSelect } from "~/components/shop/CollectionSelect";
import { ShopProductPickerModal } from "~/components/shop/ShopProductPickerModal";
import { MediaPickerModal, type MediaItem as PickerMediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";
import { SliderPickerModal, type Slider as PickerSlider } from "~/components/media/SliderPickerModal";
import { SliderModal } from "~/components/media/SliderModal";
import { VariantDetails } from "~/components/shop/VariantDetails";
import { LuSliders } from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "~/lib/app-context";
import { getCurrency, setGlobalCurrency, fmtMoney } from "~/lib/fin-format";

import { CountryCurrencySelect } from "~/components/common/CountryCurrency";

export type { ShopItem } from "~/components/shop/ShopProductTable";
import type { ShopItem } from "~/components/shop/ShopProductTable";
export type { ShopCollection } from "~/components/shop/CollectionSelect";
import type { ShopCollection } from "~/components/shop/CollectionSelect";

export interface ShopItemVariant {
  id?: string;
  item_id?: string;
  name: string;
  sku?: string;
  barcode?: string;
  price?: number;
  price_delta: number;
  cost_price: number;
  compare_price?: number;
  default_mrp?: number;
  unit_price?: number;
  discount_pct?: number;
  extra_discount?: number;
  stock_qty: number;
  media_id?: string;
  media_url?: string;
  slider_id?: string;
  seo_og_image?: string;
  hsn_sac_code?: string;
  weight?: number;
  weight_unit?: string;
  length?: number;
  width?: number;
  height?: number;
  dimension_unit?: string;
  pack_size?: string;
  conversion_factor?: number;
  scheme_on?: number;
  scheme_free?: number;
  country_of_origin?: string;
  allow_backorder?: number;
  track_inventory?: number;
  tax_rate_id?: string;
  is_taxable?: number;
  tax_inclusive?: number;
  color_hex?: string;
  seo_title?: string;
  seo_description?: string;
  seo_robots?: string;
  seo_block_indexing?: number;
  is_active?: number;
  sort_order?: number;
  attributes: string;
}

export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  sort_order: number;
  is_default?: number;
  is_active: number;
}

export interface ShopUnit {
  id: string;
  name: string;
  symbol: string;
  unit_type?: string;
  is_decimal?: number;
  is_default?: number;
  is_active?: number;
}

export interface AddProductModalProps {
  open: Signal<boolean>;
  editingItem: Signal<ShopItem | null>;
  categories: Signal<ShopCategory[]>;
  collections: Signal<ShopCollection[]>;
  units: Signal<ShopUnit[]>;
  defaultCategoryId?: string;
  defaultItemType?: string;
  onSaved$: PropFunction<(item: ShopItem) => void>;
}

function fmtAuditDate(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const dt = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const tm = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${dt} ${tm}`;
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  slug: string;
  category_id: string;
  shop_category_id: string;
  parent_id: string;
  collection_id: string;
  brand_id: string;
  unit_id: string;
  sku: string;
  barcode: string;
  hsn_sac_code: string;
  description: string;
  media_id: string;
  media_url: string;
  seo_og_image: string;
  slider_id: string;
  video_url: string;
  video_media_id: string;
  price: string;
  cost_price: string;
  compare_price: string;
  default_mrp: string;
  unit_price: string;
  discount_pct: string;
  extra_discount: string;
  weight: string;
  weight_unit: string;
  dim_length: string;
  width: string;
  height: string;
  dimension_unit: string;
  pack_size: string;
  conversion_factor: string;
  scheme_on: string;
  scheme_free: string;
  country_of_origin: string;
  currency: string;
  tax_rate_id: string;
  tax_inclusive: boolean;
  is_active: boolean;
  track_inventory: boolean;
  notes: string;
  agent_notes: string;
}

const EMPTY: FormState = {
  name: "",
  slug: "",
  category_id: "cat_6",
  shop_category_id: "",
  parent_id: "",
  collection_id: "",
  brand_id: "",
  unit_id: "",
  sku: "",
  barcode: "",
  hsn_sac_code: "",
  description: "",
  media_id: "",
  media_url: "",
  seo_og_image: "",
  slider_id: "",
  video_url: "",
  video_media_id: "",
  price: "",
  cost_price: "",
  compare_price: "",
  default_mrp: "",
  unit_price: "",
  discount_pct: "",
  extra_discount: "",
  weight: "",
  weight_unit: "kg",
  dim_length: "",
  width: "",
  height: "",
  dimension_unit: "cm",
  pack_size: "",
  conversion_factor: "1",
  scheme_on: "",
  scheme_free: "",
  country_of_origin: "",
  currency: "INR",
  tax_rate_id: "",
  tax_inclusive: false,
  is_active: true,
  track_inventory: true,
  notes: "",
  agent_notes: "",
};

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

const STANDARD_UNIT_SCALE: Record<string, number> = {
  // Weight (base: g)
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.349523,
  lb: 453.59237,
  // Volume (base: ml)
  ml: 1,
  cl: 10,
  l: 1000,
  "m³": 1000000,
  // Size (base: cm)
  mm: 0.1,
  cm: 1,
  m: 100,
  in: 2.54,
  ft: 30.48,
  // Area (base: m²)
  "m²": 1,
  "sq ft": 0.092903,
  // Item (base: 1)
  item: 1,
  piece: 1,
  unit: 1,
  pair: 2,
  dozen: 12,
};

function computeUnitPrice(sellPrice: number, totalQty: number, totalUnit: string, baseMeasure: number, baseUnit: string): number {
  if (sellPrice <= 0 || totalQty <= 0 || baseMeasure <= 0) return 0;
  const scaleTotal = STANDARD_UNIT_SCALE[totalUnit];
  const scaleBase = STANDARD_UNIT_SCALE[baseUnit];
  if (scaleTotal !== undefined && scaleBase !== undefined && UNIT_CATEGORY_MAP[totalUnit] === UNIT_CATEGORY_MAP[baseUnit]) {
    const totalInBase = totalQty * scaleTotal;
    const measureInBase = baseMeasure * scaleBase;
    return (sellPrice / totalInBase) * measureInBase;
  }
  return (sellPrice / totalQty) * baseMeasure;
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

const COLOR_HEX_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  lime: "#84cc16",
  "lime green": "#a3e635",
  "#a3e635": "Lime Green",
  white: "#ffffff",
  "#ffffff": "White",
  black: "#000000",
  "#000000": "Black",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#6b7280",
  grey: "#6b7280",
  navy: "#1e3a8a",
  "navy blue": "#1e3a8a",
  "#1e3a8a": "Navy Blue",
  brown: "#78350f",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  gold: "#d97706",
  silver: "#9ca3af",
  rose: "#f43f5e",
};

function formatColorName(val: string): string {
  if (!val) return "";
  const clean = val.replace(/\s*\(?#[0-9a-fA-F]{3,6}\)?/, "").trim();
  if (clean.startsWith("#")) {
    const hex = clean.toLowerCase();
    if (COLOR_HEX_MAP[hex]) return COLOR_HEX_MAP[hex];
    return "Colour (" + clean.replace("#", "") + ")";
  }
  return clean || val;
}

function generateSku(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

export const AddProductModal = component$<AddProductModalProps>(
  ({ open, editingItem, categories, collections, units, defaultCategoryId, defaultItemType, onSaved$ }) => {
    const app = useAppContext();
    const form = useStore<FormState>({ ...EMPTY });
    const saving = useSignal(false);
    const error = useSignal<string | null>(null);
    const activeStaffId = useSignal<string | null>(null);
    const isEdit = useComputed$(() => Boolean(editingItem.value?.id || editingItem.value));
    const taxRates = useSignal<{ id: string; name: string; rate_pct: number }[]>([]);
    const taxConfig = useSignal<any>(null);
    const brands = useSignal<{ id: string; name: string }[]>([]);
    const supportedCurrencies = useSignal<string[]>(["INR", "USD", "EUR", "GBP"]);
    const defaultTaxInclusive = useSignal(false);

    // Unit price calculation states
    const unitPricePopoverOpen = useSignal(false);
    const unitTotalAmount = useSignal(100);
    const unitTotalUnit = useSignal("g");
    const unitBaseMeasure = useSignal(1);
    const unitBaseUnit = useSignal("kg");

    // Keep Base Measure unit strictly aligned to matching Total Amount Unit category
    useTask$(({ track }) => {
      const totalUnit = track(() => unitTotalUnit.value);
      const cat = UNIT_CATEGORY_MAP[totalUnit] || "weight";
      const allowed = UNIT_OPTIONS[cat];
      if (allowed && !allowed.some(o => o.value === unitBaseUnit.value)) {
        unitBaseUnit.value = allowed[0].value;
      }
    });

    // Packaging & Dimensions Modal Signal
    const hasPackaging = useSignal(false);

    // Scheme & Bonus Promotion Signal
    const hasScheme = useSignal(false);

    // Notes & Agent Memory Signal
    const hasNotes = useSignal(false);

    // Media & Slider Modal Signals
    const hasMedia = useSignal(false);
    const mediaPickerOpen = useSignal(false);
    const mediaModalOpen = useSignal(false);
    const mediaPickerFilter = useSignal<"all" | "image" | "video" | "document">("image");
    const pickerTarget = useSignal<"main_image" | "video">("main_image");

    const sliderPickerOpen = useSignal(false);
    const sliderModalOpen = useSignal(false);
    const selectedSlider = useSignal<PickerSlider | null>(null);

    const parentPickerOpen = useSignal(false);
    const parentProductName = useSignal("");

    // Category & Collection Creation Drawer Signals
    const categoryShowNew = useSignal(false);
    const collectionShowNew = useSignal(false);

    // Category Metafield & Variant Signals
    const hasVariants = useSignal(false);
    const optionsStale = useSignal(false);
    const itemVariants = useSignal<ShopItemVariant[]>([]);
    const variantOptions = useSignal<{ name: string; values: string }[]>([]);

    const variantMediaIndex = useSignal<number | null>(null);
    const variantSliderIndex = useSignal<number | null>(null);
    const activeGroupImageKey = useSignal<string | null>(null);

    const variantDetailsOpen = useSignal(false);
    const variantDetailsIndex = useSignal<number | null>(null);
    const selectedVariantForDetails = useSignal<ShopItemVariant | null>(null);

    const editingOptionIndex = useSignal<number | null>(null);
    const selectedGroupBy = useSignal<string>("Colour");
    const expandedGroups = useSignal<Record<string, boolean>>({});
    const newValueInputs = useSignal<Record<number, string>>({});
    const variantSearchQuery = useSignal("");
    const variantSearchOpen = useSignal(false);

    const generateVariantsMatrix$ = $(() => {
      optionsStale.value = false;
      const activeOptions = variantOptions.value
        .map((o) => ({
          name: o.name.trim(),
          values: o.values.split(",").map((v) => v.trim()).filter(Boolean),
        }))
        .filter((o) => o.name && o.values.length > 0);

      if (activeOptions.length === 0) {
        itemVariants.value = [];
        selectedGroupBy.value = "None";
        return;
      }

      const activeOptNames = activeOptions.map((o) => o.name);
      if (!selectedGroupBy.value || !activeOptNames.includes(selectedGroupBy.value)) {
        selectedGroupBy.value = activeOptNames[0];
      }

      const cartesian = (args: string[][]): string[][] => {
        const r: string[][] = [];
        const max = args.length - 1;
        function helper(arr: string[], i: number) {
          for (let j = 0, l = args[i].length; j < l; j++) {
            const a = [...arr, args[i][j]];
            if (i === max) r.push(a);
            else helper(a, i + 1);
          }
        }
        helper([], 0);
        return r;
      };

      const optionValuesList = activeOptions.map((o) => o.values);
      const combinations = cartesian(optionValuesList);

      // Map existing variant items by name to preserve custom SKUs, price deltas, media, sliders, discounts, etc.
      const existingMap = new Map<string, ShopItemVariant>();
      itemVariants.value.forEach((v) => {
        if (v.name) {
          existingMap.set(v.name.trim(), v);
        }
      });

      const list: ShopItemVariant[] = combinations.map((combo) => {
        const name = combo.join(" / ");
        const attrs: Record<string, string> = {};

        let computedColorHex: string | undefined = undefined;
        activeOptions.forEach((opt, i) => {
          const valStr = combo[i];
          const hexMatch = valStr.match(/#([0-9a-fA-F]{3,6})/);
          const cleanName = valStr.replace(/\s*\(?#[0-9a-fA-F]{3,6}\)?/, "").trim();
          attrs[opt.name.toLowerCase()] = cleanName;
          if (opt.name.toLowerCase().includes("color") || opt.name.toLowerCase().includes("colour")) {
            const hex = hexMatch ? `#${hexMatch[1]}` : (COLOR_HEX_MAP[cleanName.toLowerCase()] || "#9ca3af");
            attrs.color = hex;
            attrs.color_name = cleanName;
            computedColorHex = hex;
          }
        });

        // Preserve existing fields if variant existed previously
        const existing = existingMap.get(name.trim());
        const preservedSku = (existing?.sku && existing.sku.trim().length > 0) ? existing.sku.trim() : generateSku();
        const preservedPriceDelta = existing ? existing.price_delta : 0;
        const preservedStockQty = existing ? existing.stock_qty : 10;
        const baseSellingPrice = parseFloat(form.price) || 0;
        const preservedPrice = existing?.price !== undefined ? existing.price : (baseSellingPrice + preservedPriceDelta);

        return {
          id: existing?.id,
          name,
          sku: preservedSku,
          barcode: existing?.barcode || "",
          price: preservedPrice,
          price_delta: preservedPriceDelta,
          cost_price: existing ? existing.cost_price : (parseFloat(form.cost_price) || 0),
          compare_price: existing?.compare_price ?? (parseFloat(form.compare_price) || undefined),
          default_mrp: (existing?.default_mrp && existing.default_mrp > 0) ? existing.default_mrp : (parseFloat(form.default_mrp) || 0),
          discount_pct: (existing?.discount_pct && existing.discount_pct > 0) ? existing.discount_pct : (parseFloat(form.discount_pct) || 0),
          extra_discount: (existing?.extra_discount && existing.extra_discount > 0) ? existing.extra_discount : (parseFloat(form.extra_discount) || 0),
          unit_price: (existing?.unit_price && existing.unit_price > 0) ? existing.unit_price : (parseFloat(form.unit_price) || 0),
          stock_qty: preservedStockQty,
          media_id: existing?.media_id || "",
          media_url: existing?.media_url || "",
          slider_id: existing?.slider_id || "",
          seo_og_image: existing?.seo_og_image || "",
          hsn_sac_code: existing?.hsn_sac_code || form.hsn_sac_code || "",
          weight: (existing?.weight && existing.weight > 0) ? existing.weight : (parseFloat(form.weight) || 0),
          weight_unit: existing?.weight_unit || form.weight_unit || "kg",
          length: (existing?.length && existing.length > 0) ? existing.length : (parseFloat(form.dim_length) || 0),
          width: (existing?.width && existing.width > 0) ? existing.width : (parseFloat(form.width) || 0),
          height: (existing?.height && existing.height > 0) ? existing.height : (parseFloat(form.height) || 0),
          dimension_unit: existing?.dimension_unit || form.dimension_unit || "cm",
          pack_size: existing?.pack_size || form.pack_size || "",
          conversion_factor: (existing?.conversion_factor && existing.conversion_factor > 0) ? existing.conversion_factor : (parseFloat(form.conversion_factor) || 1),
          scheme_on: (existing?.scheme_on && existing.scheme_on > 0) ? existing.scheme_on : (parseFloat(form.scheme_on) || 0),
          scheme_free: (existing?.scheme_free && existing.scheme_free > 0) ? existing.scheme_free : (parseFloat(form.scheme_free) || 0),
          country_of_origin: existing?.country_of_origin || form.country_of_origin || "",
          allow_backorder: existing?.allow_backorder ?? 0,
          track_inventory: existing?.track_inventory ?? (form.track_inventory ? 1 : 0),
          tax_rate_id: existing?.tax_rate_id || form.tax_rate_id || "",
          is_taxable: existing?.is_taxable ?? (form.tax_rate_id ? 1 : 1),
          tax_inclusive: existing?.tax_inclusive ?? (form.tax_inclusive ? 1 : 0),
          color_hex: existing?.color_hex || computedColorHex,
          attributes: JSON.stringify(attrs),
        };
      });

      itemVariants.value = list;
      hasVariants.value = true;
    });

    const generateAllVariantSkus$ = $(() => {
      const updated = itemVariants.value.map((v) => ({
        ...v,
        sku: generateSku(),
      }));
      itemVariants.value = updated;
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async () => {
      try {
        const [rates, cfg] = await Promise.all([
          invoke<{ id: string; name: string; rate_pct: number }[]>("fin_list_tax_rates").catch(() => []),
          invoke<any>("fin_get_tax_config").catch(() => null),
        ]);
        taxRates.value = rates;
        taxConfig.value = cfg;
        if (cfg && cfg.tax_inclusive !== undefined) {
          defaultTaxInclusive.value = cfg.tax_inclusive === 1;
        }
        if (!editingItem.value) {
          const def = await invoke<string | null>("fin_get_default_tax_rate").catch(() => null);
          if (def) form.tax_rate_id = def;
          if (cfg && cfg.tax_inclusive !== undefined) {
            form.tax_inclusive = cfg.tax_inclusive === 1;
          }
        }
      } catch { /* tax not configured */ }

      try {
        const b = await invoke<{ id: string; name: string }[]>("shop_list_brands");
        brands.value = b;
      } catch { /* brands not loaded */ }

      try {
        const s: any = await invoke("get_settings");
        if (s?.currency) {
          setGlobalCurrency(s.currency);
          if (!editingItem.value) {
            form.currency = s.currency;
          }
        }
        if (s?.supported_currencies) {
          const parsed = JSON.parse(s.supported_currencies);
          if (Array.isArray(parsed) && parsed.length > 0) {
            supportedCurrencies.value = parsed;
          }
        }
      } catch { /* settings load ignore */ }
    });

    useTask$(({ track }) => {
      const item = track(() => editingItem.value);
      const isOpen = track(() => open.value);
      track(() => categories.value);

      if (!isOpen) {
        Object.assign(form, EMPTY);
        error.value = null;
        saving.value = false;
        selectedSlider.value = null;
        hasMedia.value = false;
        hasPackaging.value = false;
        unitTotalAmount.value = 100;
        unitTotalUnit.value = "g";
        unitBaseMeasure.value = 1;
        unitBaseUnit.value = "kg";
        return;
      }

      (async () => {
        try {
          const b = await invoke<{ id: string; name: string }[]>("shop_list_brands");
          brands.value = b;
        } catch { /* brands not loaded */ }
      })();

      const defaultUnit = units.value[0]?.id ?? "";

      if (item) {
        hasMedia.value = Boolean(
          item.media_id ||
          item.media_url ||
          item.slider_id ||
          item.video_url ||
          item.video_media_id ||
          item.seo_og_image
        );
        form.name = item.name;
        form.slug = item.slug;
        form.category_id = item.category_id || "cat_6";
        form.shop_category_id = item.shop_category_id ?? "";
        form.parent_id = item.parent_id ?? "";
        form.collection_id = item.collection_id ?? "";
        form.brand_id = item.brand_id ?? "";
        form.unit_id = item.unit_id ?? defaultUnit;
        form.track_inventory = item.track_inventory === 1;
        form.sku = item.sku ?? "";
        form.barcode = item.barcode ?? "";
        form.hsn_sac_code = item.hsn_sac_code ?? "";
        form.description = item.description ?? "";
        form.notes = item.notes ?? "";
        form.agent_notes = item.agent_notes ?? "";
        form.media_id = item.media_id ?? "";
        form.seo_og_image = item.seo_og_image ?? "";
        form.slider_id = item.slider_id ?? "";
        form.video_url = item.video_url ?? "";
        form.video_media_id = item.video_media_id ?? "";
        form.price = String(item.price);
        form.cost_price = (item.cost_price || 0) > 0 ? String(item.cost_price) : "";
        form.compare_price = item.compare_price && item.compare_price > 0 ? String(item.compare_price) : "";
        form.default_mrp = (item.default_mrp || 0) > 0 ? String(item.default_mrp) : "";
        form.unit_price = item.unit_price && item.unit_price > 0 ? String(item.unit_price) : "";

        // Restore unit price configuration if available in additional_details
        let parsedDetails: any = {};
        if (item.additional_details) {
          try {
            parsedDetails = typeof item.additional_details === "string" ? JSON.parse(item.additional_details) : item.additional_details;
          } catch { /* ignore */ }
        }
        if (parsedDetails?.unit_price_config) {
          unitTotalAmount.value = Number(parsedDetails.unit_price_config.total_amount) || 100;
          unitTotalUnit.value = parsedDetails.unit_price_config.total_unit || "g";
          unitBaseMeasure.value = Number(parsedDetails.unit_price_config.base_measure) || 1;
          unitBaseUnit.value = parsedDetails.unit_price_config.base_unit || "kg";
        } else {
          unitTotalAmount.value = 100;
          unitTotalUnit.value = "g";
          unitBaseMeasure.value = 1;
          unitBaseUnit.value = "kg";
        }
        form.discount_pct = item.discount_pct > 0 ? String(item.discount_pct) : "";
        form.extra_discount = item.extra_discount && item.extra_discount > 0 ? String(item.extra_discount) : "";
        form.weight = item.weight && item.weight > 0 ? String(item.weight) : "";
        form.weight_unit = item.weight_unit ?? "kg";
        form.dim_length = item.dim_length && item.dim_length > 0 ? String(item.dim_length) : "";
        form.width = item.width && item.width > 0 ? String(item.width) : "";
        form.height = item.height && item.height > 0 ? String(item.height) : "";
        form.dimension_unit = item.dimension_unit ?? "cm";
        form.pack_size = item.pack_size ?? "";
        form.conversion_factor = item.conversion_factor ? String(item.conversion_factor) : "1";
        form.scheme_on = item.scheme_on && item.scheme_on > 0 ? String(item.scheme_on) : "";
        form.scheme_free = item.scheme_free && item.scheme_free > 0 ? String(item.scheme_free) : "";
        form.country_of_origin = item.country_of_origin ?? "";
        hasPackaging.value = Boolean(
          (item.weight && item.weight > 0) ||
          (item.dim_length && item.dim_length > 0) ||
          (item.width && item.width > 0) ||
          (item.height && item.height > 0) ||
          item.pack_size ||
          (item.conversion_factor && item.conversion_factor > 1) ||
          item.country_of_origin
        );
        hasScheme.value = Boolean(
          (item.scheme_on && item.scheme_on > 0) ||
          (item.scheme_free && item.scheme_free > 0)
        );
        hasNotes.value = Boolean(
          (item.notes && item.notes.trim().length > 0) ||
          (item.agent_notes && item.agent_notes.trim().length > 0)
        );
        form.media_url = item.media_url ?? "";
        form.currency = item.currency ?? "INR";
        form.is_active = item.is_active === 1;
        form.tax_inclusive = item.tax_inclusive === 1;

        // Async fetches run in background, NOT blocking synchronous modal popup render
        (async () => {
          if (item.slider_id) {
            try {
              const s = await invoke<PickerSlider>("sliders_get", { sliderId: item.slider_id });
              selectedSlider.value = s;
            } catch { selectedSlider.value = null; }
          } else {
            selectedSlider.value = null;
          }

          if (item.media_id) {
            try {
              const mediaList = await invoke<PickerMediaItem[]>("media_list", { fileType: "all" });
              const found = mediaList.find((m) => m.id === item.media_id);
              if (found) {
                form.media_url = found.url;
                if (!form.seo_og_image) form.seo_og_image = found.url;
              }
            } catch { /* media fetch ignore */ }
          }

          if (item.parent_id) {
            try {
              const p = await invoke<ShopItem>("shop_get_item", { itemId: item.parent_id });
              parentProductName.value = p?.name ?? "";
            } catch { parentProductName.value = ""; }
          } else {
            parentProductName.value = "";
          }

          try {
            const existing = await invoke<{ tax_rate_id: string } | null>("fin_get_item_tax_rate", { itemId: item.id });
            form.tax_rate_id = existing?.tax_rate_id ?? "";
          } catch { form.tax_rate_id = ""; }

          if (item.options) {
            try {
              const parsedOpts = JSON.parse(item.options);
              if (Array.isArray(parsedOpts) && parsedOpts.length > 0) {
                variantOptions.value = parsedOpts;
              }
            } catch { /* ignore */ }
          }
          if (item.variant_group_by) {
            selectedGroupBy.value = item.variant_group_by;
          }
          hasVariants.value = item.has_variants === 1;

          try {
            const vars = await invoke<ShopItemVariant[]>("shop_list_variants", { itemId: item.id });
            if (vars && vars.length > 0) {
              itemVariants.value = vars;
              hasVariants.value = true;
            } else if (item.has_variants === 1) {
              hasVariants.value = true;
              generateVariantsMatrix$();
            } else {
              itemVariants.value = [];
              hasVariants.value = false;
            }
          } catch {
            itemVariants.value = [];
            hasVariants.value = false;
          }
        })();
      } else {
        selectedSlider.value = null;
        parentProductName.value = "";
        hasMedia.value = false;
        hasPackaging.value = false;
        hasScheme.value = false;
        hasNotes.value = false;
        hasVariants.value = false;
        optionsStale.value = false;
        variantOptions.value = [];
        itemVariants.value = [];
        selectedGroupBy.value = "None";
        unitTotalAmount.value = 100;
        unitTotalUnit.value = "g";
        unitBaseMeasure.value = 1;
        unitBaseUnit.value = "kg";
        const findDefaultShopCat = () => {
          const itemType = defaultItemType || "";
          const catId = defaultCategoryId || "";
          if (itemType === "menu" || catId === "cat_29") {
            const found = categories.value.find(c =>
              c.id.includes("food_dishes") || c.slug.includes("food") || c.slug.includes("dishes") || c.name.toLowerCase().includes("food") || c.name.toLowerCase().includes("dish")
            );
            if (found) return found.id;
          }
          if (itemType === "stay" || catId === "cat_50" || catId === "cat_30") {
            const found = categories.value.find(c =>
              c.id.includes("stay_rooms") || c.slug.includes("stay") || c.slug.includes("room") || c.slug.includes("accommodation") || c.name.toLowerCase().includes("room") || c.name.toLowerCase().includes("stay")
            );
            if (found) return found.id;
          }
          return categories.value[0]?.id || "";
        };
        const defaultShopCat = findDefaultShopCat();
        const initialCatId = defaultCategoryId || "cat_6";
        const activeCur = getCurrency();
        Object.assign(form, {
          ...EMPTY,
          currency: activeCur,
          unit_id: defaultUnit,
          category_id: initialCatId,
          shop_category_id: defaultShopCat,
          tax_inclusive: defaultTaxInclusive.value,
        });

        (async () => {
          try {
            const def = await invoke<string | null>("fin_get_default_tax_rate").catch(() => null);
            if (def) form.tax_rate_id = def;
          } catch { /* ignore */ }
        })();
      }
      error.value = null;
    });

    const handleSave$ = $(async () => {
      if (!form.name.trim()) {
        error.value = "Product name is required.";
        return;
      }
      if (!form.price || isNaN(parseFloat(form.price))) {
        error.value = "A valid selling price is required.";
        return;
      }

      saving.value = true;
      error.value = null;

      try {
        let saved: ShopItem;

        const activeProfile = app.profiles.value.find((p: { id: string; user_id?: string }) => p.id === app.activeProfileId.value);

        let existingDetails: Record<string, any> = {};
        if (isEdit.value && editingItem.value?.additional_details) {
          try {
            existingDetails = typeof editingItem.value.additional_details === "string"
              ? JSON.parse(editingItem.value.additional_details)
              : (editingItem.value.additional_details || {});
          } catch { /* ignore */ }
        }

        if (form.unit_price && parseFloat(form.unit_price) > 0) {
          existingDetails.unit_price_config = {
            total_amount: unitTotalAmount.value || 1,
            total_unit: unitTotalUnit.value || "g",
            base_measure: unitBaseMeasure.value || 1,
            base_unit: unitBaseUnit.value || "kg",
          };
        } else {
          delete existingDetails.unit_price_config;
        }

        const additionalDetailsStr = Object.keys(existingDetails).length > 0 ? JSON.stringify(existingDetails) : undefined;

        const sharedData = {
          name: form.name.trim(),
          price: parseFloat(form.price),
          user_id: activeStaffId.value || activeProfile?.user_id || undefined,
          updated_by: activeStaffId.value || activeProfile?.user_id || undefined,
          cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
          compare_price: (form.compare_price && parseFloat(form.compare_price) > 0) ? parseFloat(form.compare_price) : 0,
          default_mrp: form.default_mrp ? parseFloat(form.default_mrp) : 0,
          unit_price: form.unit_price && parseFloat(form.unit_price) > 0 ? parseFloat(form.unit_price) : 0,
          additional_details: additionalDetailsStr,
          discount_pct: form.discount_pct ? parseFloat(form.discount_pct) : 0,
          extra_discount: form.extra_discount ? parseFloat(form.extra_discount) : 0,
          weight: hasPackaging.value && form.weight && parseFloat(form.weight) > 0 ? parseFloat(form.weight) : undefined,
          weight_unit: hasPackaging.value && form.weight && parseFloat(form.weight) > 0 ? (form.weight_unit.trim() || undefined) : undefined,
          dim_length: hasPackaging.value && form.dim_length && parseFloat(form.dim_length) > 0 ? parseFloat(form.dim_length) : undefined,
          width: hasPackaging.value && form.width && parseFloat(form.width) > 0 ? parseFloat(form.width) : undefined,
          height: hasPackaging.value && form.height && parseFloat(form.height) > 0 ? parseFloat(form.height) : undefined,
          dimension_unit: hasPackaging.value && (form.dim_length || form.width || form.height) ? (form.dimension_unit.trim() || undefined) : undefined,
          pack_size: hasPackaging.value ? (form.pack_size.trim() || undefined) : undefined,
          conversion_factor: hasPackaging.value && form.conversion_factor && parseFloat(form.conversion_factor) > 0 ? parseFloat(form.conversion_factor) : undefined,
          scheme_on: hasScheme.value && form.scheme_on && parseFloat(form.scheme_on) > 0 ? parseFloat(form.scheme_on) : 0,
          scheme_free: hasScheme.value && form.scheme_free && parseFloat(form.scheme_free) > 0 ? parseFloat(form.scheme_free) : 0,
          country_of_origin: hasPackaging.value ? (form.country_of_origin.trim() || undefined) : undefined,
          category_id: form.category_id || "cat_6",
          shop_category_id: form.shop_category_id || undefined,
          parent_id: form.parent_id || undefined,
          collection_id: form.collection_id || undefined,
          brand_id: form.brand_id || undefined,
          unit_id: form.unit_id || undefined,
          description: form.description.trim() || undefined,
          sku: form.sku.trim() || undefined,
          barcode: form.barcode.trim() || undefined,
          hsn_sac_code: form.hsn_sac_code.trim() || undefined,
          notes: form.notes.trim(),
          agent_notes: form.agent_notes.trim(),
          media_id: hasMedia.value ? (form.media_id || undefined) : undefined,
          media_url: hasMedia.value ? (form.media_url.trim() || undefined) : undefined,
          seo_og_image: hasMedia.value ? (form.seo_og_image.trim() || form.media_url.trim() || undefined) : undefined,
          slider_id: hasMedia.value ? (form.slider_id.trim() || undefined) : undefined,
          video_url: hasMedia.value ? (form.video_url.trim() || undefined) : undefined,
          video_media_id: hasMedia.value ? (form.video_media_id || undefined) : undefined,
          currency: form.currency,
          tax_rate_id: form.tax_rate_id && form.tax_rate_id !== "exempt" && form.tax_rate_id !== "nil" ? form.tax_rate_id : (form.tax_rate_id === "exempt" || form.tax_rate_id === "nil" ? "exempt" : undefined),
          is_taxable: form.tax_rate_id === "exempt" || form.tax_rate_id === "nil" ? false : true,
          tax_inclusive: form.tax_inclusive,
          track_inventory: form.track_inventory ? 1 : 0,
          options: JSON.stringify(variantOptions.value),
          variant_group_by: selectedGroupBy.value,
          has_variants: (hasVariants.value && itemVariants.value.length > 0) ? 1 : 0,
        };

        if (isEdit.value && editingItem.value) {
          saved = await invoke<ShopItem>("shop_update_item", {
            itemId: editingItem.value.id,
            data: { ...sharedData, is_active: form.is_active },
          });
        } else {
          saved = await invoke<ShopItem>("shop_create_item", {
            data: { ...sharedData, item_type: defaultItemType || "physical" },
          });
        }

        const baseSellingPrice = parseFloat(form.price) || 0;
        if (hasVariants.value && itemVariants.value.length > 0) {
          try {
            await invoke("shop_save_item_variants", {
              itemId: saved.id,
              variants: itemVariants.value.map((v) => {
                const finalPrice = (v.price !== undefined && v.price !== null && !isNaN(v.price))
                  ? v.price
                  : ((v.price_delta || 0) !== 0 ? (baseSellingPrice > 0 ? baseSellingPrice + v.price_delta : v.price_delta) : baseSellingPrice);
                const finalDelta = (v.price_delta !== undefined && !isNaN(v.price_delta))
                  ? v.price_delta
                  : (baseSellingPrice > 0 ? finalPrice - baseSellingPrice : 0);
                return {
                  item_id: saved.id,
                  name: v.name,
                  sku: (v.sku && v.sku.trim().length > 0) ? v.sku.trim() : generateSku(),
                  barcode: v.barcode || undefined,
                  price: finalPrice,
                  price_delta: finalDelta,
                  cost_price: (v.cost_price && v.cost_price > 0) ? v.cost_price : (parseFloat(form.cost_price) || 0),
                  compare_price: (v.compare_price && v.compare_price > 0) ? v.compare_price : 0,
                  default_mrp: (v.default_mrp && v.default_mrp > 0) ? v.default_mrp : (parseFloat(form.default_mrp) || 0),
                  unit_price: (v.unit_price && v.unit_price > 0) ? v.unit_price : (parseFloat(form.unit_price) || 0),
                  discount_pct: (v.discount_pct && v.discount_pct > 0) ? v.discount_pct : (parseFloat(form.discount_pct) || 0),
                  extra_discount: (v.extra_discount && v.extra_discount > 0) ? v.extra_discount : (parseFloat(form.extra_discount) || 0),
                  stock_qty: v.stock_qty || 0,
                  media_id: v.media_id || undefined,
                  media_url: v.media_url || undefined,
                  slider_id: v.slider_id || undefined,
                  seo_og_image: v.media_url || v.seo_og_image || undefined,
                  hsn_sac_code: v.hsn_sac_code || form.hsn_sac_code || undefined,
                  weight: (v.weight || 0) > 0 ? v.weight : (parseFloat(form.weight) || undefined),
                  weight_unit: (v.weight || 0) > 0 ? (v.weight_unit || form.weight_unit || undefined) : (form.weight_unit || undefined),
                  length: v.length || (parseFloat(form.dim_length) || 0),
                  width: v.width || (parseFloat(form.width) || 0),
                  height: v.height || (parseFloat(form.height) || 0),
                  dimension_unit: v.dimension_unit || form.dimension_unit || "cm",
                  pack_size: v.pack_size || (form.pack_size.trim() || undefined),
                  conversion_factor: (v.conversion_factor || 0) > 0 ? v.conversion_factor : (form.conversion_factor ? parseFloat(form.conversion_factor) : 1),
                  scheme_on: (v.scheme_on || 0) > 0 ? v.scheme_on : (form.scheme_on ? parseFloat(form.scheme_on) : 0),
                  scheme_free: (v.scheme_free || 0) > 0 ? v.scheme_free : (form.scheme_free ? parseFloat(form.scheme_free) : 0),
                  country_of_origin: v.country_of_origin || form.country_of_origin || undefined,
                  allow_backorder: v.allow_backorder ?? 0,
                  track_inventory: v.track_inventory ?? (form.track_inventory ? 1 : 0),
                  tax_rate_id: v.tax_rate_id || form.tax_rate_id || undefined,
                  is_taxable: v.is_taxable ?? (form.tax_rate_id ? 1 : 1),
                  tax_inclusive: v.tax_inclusive ?? (form.tax_inclusive ? 1 : 0),
                  color_hex: v.color_hex || undefined,
                  attributes: typeof v.attributes === "string" ? v.attributes : JSON.stringify(v.attributes),
                };
              }),
            });
          } catch (e) {
            console.error("[AddProductModal] shop_save_item_variants failed:", e);
          }
        } else if (isEdit.value && (editingItem.value?.has_variants === 1)) {
          try {
            await invoke("shop_save_item_variants", {
              itemId: saved.id,
              variants: [],
            });
          } catch (e) {
            console.error("[AddProductModal] shop_save_item_variants (empty) failed:", e);
          }
        }

        await onSaved$(saved);
        open.value = false;
      } catch (err) {
        error.value = String(err);
      } finally {
        saving.value = false;
      }
    });

    return (
      <>
        <SlideOver
          open={open}
          title={isEdit.value ? "Edit Product" : "Add New Product"}
          subtitle="Manage product details, pricing, and tax settings."
          width="540px"
        >
          {/* ── Top Bar Staff Selector (before close cross icon) ── */}
          <div q:slot="header-actions">
            <ShopStaffSelector selectedStaffId={activeStaffId} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <style>{`
              input[type=number]::-webkit-inner-spin-button,
              input[type=number]::-webkit-outer-spin-button {
                -webkit-appearance: none !important;
                margin: 0 !important;
              }
              input[type=number] {
                -moz-appearance: textfield !important;
                appearance: textfield !important;
              }
              .hide-scrollbar::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
              }
              .hide-scrollbar {
                -ms-overflow-style: none !important;
                scrollbar-width: none !important;
              }
            `}</style>
            {error.value && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "0.375rem",
                  color: "var(--error)",
                  fontSize: "0.8125rem",
                }}
              >
                {error.value}
              </div>
            )}

            {/* ═══ Section 1 — Basic Info ════════════════════════════════════ */}
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div>
                  <label style={labelStyle}>
                    Product Name <span style="color:var(--error);">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onInput$={(e) => {
                      form.name = (e.target as HTMLInputElement).value;
                      if (!isEdit.value && !form.sku) {
                        form.sku = generateSku();
                      }
                    }}
                    placeholder="e.g. Premium Cotton T-Shirt"
                    style={inputStyle}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Category</label>
                    <button
                      type="button"
                      onClick$={() => { categoryShowNew.value = true; }}
                      style={{ fontSize: "0.7rem", fontWeight: "600", color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: "0", letterSpacing: "0.02em" }}
                      title="Create new category"
                    >
                      + Create New
                    </button>
                  </div>
                  <CategorySelect
                    value={form.shop_category_id}
                    onChange$={$((id: string) => { form.shop_category_id = id; })}
                    categories={categories}
                    showNewSignal={categoryShowNew}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Collection</label>
                    <button
                      type="button"
                      onClick$={() => { collectionShowNew.value = true; }}
                      style={{ fontSize: "0.7rem", fontWeight: "600", color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: "0", letterSpacing: "0.02em" }}
                      title="Create new collection"
                    >
                      + Create New
                    </button>
                  </div>
                  <CollectionSelect
                    value={form.collection_id}
                    onChange$={$((id: string) => { form.collection_id = id; })}
                    collections={collections}
                    showNewSignal={collectionShowNew}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Parent Product (Outfit Set / Multi-item)</label>
                  <button
                    type="button"
                    onClick$={() => { parentPickerOpen.value = true; }}
                    style={{
                      ...inputStyle,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      textAlign: "left",
                      borderColor: form.parent_id ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
                      {form.parent_id && (
                        <div
                          style={{
                            width: "1.125rem",
                            height: "1.125rem",
                            borderRadius: "50%",
                            background: "var(--button-primary-bg, var(--accent))",
                            color: "var(--button-primary-text, #ffffff)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <LuCheck style={{ width: "0.75rem", height: "0.75rem", strokeWidth: 3 }} />
                        </div>
                      )}
                      <span style={{ color: form.parent_id ? "var(--text-primary)" : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {parentProductName.value || (form.parent_id ? "Selected Parent Item" : "None (Root / Standalone Product)")}
                      </span>
                    </div>
                    <LuPackage style={{ width: "1rem", height: "1rem", color: form.parent_id ? "var(--accent)" : "var(--text-tertiary)", flexShrink: 0 }} />
                  </button>
                </div>

                <div>
                  <label style={labelStyle}>Brand</label>
                  <select
                    value={form.brand_id}
                    onChange$={(e) => { form.brand_id = (e.target as HTMLSelectElement).value; }}
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                      appearance: "none",
                      backgroundImage: SELECT_ARROW,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 0.75rem center",
                      paddingRight: "2.25rem",
                    }}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  >
                    <option value="">No Brand</option>
                    {brands.value.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Unit</label>
                    <select
                      value={form.unit_id}
                      onChange$={(e) => { form.unit_id = (e.target as HTMLSelectElement).value; }}
                      style={{
                        ...inputStyle,
                        cursor: "pointer",
                        appearance: "none",
                        backgroundImage: SELECT_ARROW,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 0.75rem center",
                        paddingRight: "2.25rem",
                      }}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    >
                      {units.value.map(u => (
                        <option key={u.id} value={u.id}>{`${u.name} (${u.symbol})`}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: "1" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>SKU / Code</label>
                      <button type="button"
                        onClick$={() => { form.sku = generateSku(); }}
                        style={{ fontSize: "0.7rem", fontWeight: "600", color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: "0", letterSpacing: "0.02em" }}
                        title="Auto-generate SKU">
                        ✦ Generate
                      </button>
                    </div>
                    <input
                      type="text"
                      name="product_sku"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={form.sku}
                      onInput$={(e) => { form.sku = (e.target as HTMLInputElement).value; }}
                      placeholder="e.g. GN4KR82XP7"
                      style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.04em" }}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>
                      HSN / SAC Code
                      <span style={{ fontSize: "0.7rem", fontWeight: "400", color: "var(--text-secondary)", marginLeft: "0.375rem" }}>
                        (GST code)
                      </span>
                    </label>
                    <input
                      type="text"
                      name="product_hsn"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={form.hsn_sac_code}
                      onInput$={(e) => { form.hsn_sac_code = (e.target as HTMLInputElement).value.toUpperCase(); }}
                      placeholder="e.g. 30049099"
                      style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.04em" }}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>
                      Barcode
                      <span style={{ fontSize: "0.7rem", fontWeight: "400", color: "var(--text-secondary)", marginLeft: "0.375rem" }}>
                        (EAN/UPC/ISBN)
                      </span>
                    </label>
                    <input
                      type="text"
                      name="product_barcode"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={form.barcode}
                      onInput$={(e) => { form.barcode = (e.target as HTMLInputElement).value; }}
                      placeholder="e.g. 8901234567890"
                      style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.04em" }}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={form.description}
                    onInput$={(e) => { form.description = (e.target as HTMLTextAreaElement).value; }}
                    placeholder="Short description..."
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      minHeight: "4.5rem",
                      lineHeight: "1.5",
                    }}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>
              </div>
            </div>

            {/* ═══ Section 2 — Pricing & Taxes ═══════════════════════════════ */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {/* Row 1: Currency | Discounts */}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Currency</label>
                    <CountryCurrencySelect
                      allowedCodes={supportedCurrencies.value}
                      value={form.currency}
                      onChange$={(val) => { form.currency = val; }}
                      style={{
                        ...inputStyle,
                        height: "38px",
                        appearance: "none" as const,
                        paddingRight: "2rem",
                        backgroundImage: SELECT_ARROW,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 0.75rem center",
                      }}
                    />
                  </div>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Discounts (%)</label>
                    <input
                      type="number"
                      name="product_discount"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      min="0"
                      max="100"
                      step="0.5"
                      value={form.discount_pct}
                      onInput$={(e) => { form.discount_pct = (e.target as HTMLInputElement).value; }}
                      placeholder="0"
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                </div>

                {/* Row 2: Selling Price */}
                <div>
                  <label style={labelStyle}>
                    Selling Price (Rate) <span style="color:var(--error);">*</span>
                  </label>
                  <input
                    type="number"
                    name="product_price"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-form-type="other"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onInput$={(e) => { form.price = (e.target as HTMLInputElement).value; }}
                    placeholder="0.00"
                    style={inputStyle}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                </div>

                {/* Row 2.5: Additional Display Prices (Compare At Price & Unit Price Popover) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={labelStyle}>Compare At Price</label>
                    <input
                      type="number"
                      name="product_compare_price"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      min="0"
                      step="0.01"
                      value={form.compare_price}
                      onInput$={(e) => { form.compare_price = (e.target as HTMLInputElement).value; }}
                      placeholder="0.00 (Original price)"
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>

                  <div style={{ position: "relative" }}>
                    <label style={labelStyle}>Unit Price</label>
                    <button
                      type="button"
                      onClick$={() => { unitPricePopoverOpen.value = !unitPricePopoverOpen.value; }}
                      style={{
                        ...inputStyle,
                        background: "var(--field-fill)",
                        textAlign: "left" as const,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "var(--text-primary)" }}>
                        {form.unit_price && parseFloat(form.unit_price) > 0
                          ? `${fmtMoney(parseFloat(form.unit_price), form.currency)} / ${unitBaseMeasure.value && unitBaseMeasure.value !== 1 ? `${unitBaseMeasure.value}` : ""}${unitBaseUnit.value}`
                          : "--"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>▼</span>
                    </button>

                    {/* Popover Card */}
                    {unitPricePopoverOpen.value && (
                      <div style={{ position: "absolute", top: "100%", right: "0", marginTop: "0.375rem", width: "310px", padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", zIndex: 50, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {/* Total amount section */}
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                            Total Quantity
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
                              {units.value.length > 0 && (
                                <optgroup label="Store Profile Units">
                                  {units.value.map(u => (
                                    <option key={u.id} value={u.symbol || u.name.toLowerCase()}>
                                      {`${u.name} (${u.symbol})`}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        </div>

                        {/* Base measure section */}
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
                              {(UNIT_OPTIONS[UNIT_CATEGORY_MAP[unitTotalUnit.value] || "weight"] || []).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Footer buttons */}
                        <div style={{ margin: "0.5rem -1rem 0 -1rem", padding: "0.75rem 1rem 0 1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick$={() => {
                              form.unit_price = "";
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
                              style={{ height: "2rem", padding: "0 0.75rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.5rem", color: "var(--text-primary)", fontSize: "0.75rem", fontWeight: "500", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick$={() => {
                                const sellPrice = parseFloat(form.price) || 0;
                                const calc = computeUnitPrice(
                                  sellPrice,
                                  unitTotalAmount.value || 1,
                                  unitTotalUnit.value,
                                  unitBaseMeasure.value || 1,
                                  unitBaseUnit.value
                                );
                                form.unit_price = calc > 0 ? calc.toFixed(2) : "";
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

                {/* Row 3: Cost Price | MRP */}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Cost Price</label>
                    <input
                      type="number"
                      name="product_cost_price"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      min="0"
                      step="0.01"
                      value={form.cost_price}
                      onInput$={(e) => { form.cost_price = (e.target as HTMLInputElement).value; }}
                      placeholder="0.00 (Purchase / Mfg cost)"
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Default MRP (Ceiling Price)</label>
                    <input
                      type="number"
                      name="product_default_mrp"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      min="0"
                      step="0.01"
                      value={form.default_mrp}
                      onInput$={(e) => { form.default_mrp = (e.target as HTMLInputElement).value; }}
                      placeholder="0.00 (Max retail price)"
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                </div>

                {/* Row 3.5: Primary Discount (dis1) % | Extra Discount (dis2) % */}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Primary Discount % (dis1)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.discount_pct}
                      onInput$={(e) => { form.discount_pct = (e.target as HTMLInputElement).value; }}
                      placeholder="e.g. 10%"
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                  <div style={{ flex: "1" }}>
                    <label style={labelStyle}>Extra Discount % (dis2)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.extra_discount}
                      onInput$={(e) => { form.extra_discount = (e.target as HTMLInputElement).value; }}
                      placeholder="e.g. 5% (Promo / Seasonal)"
                      style={inputStyle}
                      onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                      onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                    />
                  </div>
                </div>


                {/* Row 4: GST / Tax Rate */}
                {taxRates.value.length > 0 && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>GST / Tax Rate</label>
                      {form.tax_inclusive && (
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
                      }}
                      style={{
                        ...inputStyle,
                        height: "38px",
                        backgroundImage: SELECT_ARROW,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 0.75rem center",
                        appearance: "none" as const,
                        paddingRight: "2rem",
                        borderColor: form.tax_inclusive ? "var(--accent)" : "var(--border)",
                      }}
                    >
                      <option value="">
                        {taxConfig.value?.tax_mode === "global" ? "Global Tax Settings" : "None"}
                      </option>
                      {!taxRates.value.some(r => r.id === "exempt" || r.id === "nil" || r.rate_pct === 0) && (
                        <option value="exempt">Exempt / Nil — 0%</option>
                      )}
                      {taxRates.value.map(r => (
                        <option key={r.id} value={r.id}>
                          {`${r.name} — ${r.rate_pct}%`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Row 5: Tax Inclusive Checkbox Container */}
                <div
                  style={{
                    padding: "0.625rem 0.875rem",
                    borderRadius: "0.5rem",
                    border: form.tax_inclusive ? "1px solid rgba(59, 130, 246, 0.5)" : "1px solid var(--border)",
                    background: form.tax_inclusive ? "rgba(59, 130, 246, 0.08)" : "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  onClick$={() => { form.tax_inclusive = !form.tax_inclusive; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <div
                      style={{
                        width: "1.125rem",
                        height: "1.125rem",
                        borderRadius: "0.25rem",
                        border: form.tax_inclusive ? "1.5px solid #3b82f6" : "1.5px solid var(--text-secondary)",
                        background: form.tax_inclusive ? "#3b82f6" : "transparent",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {form.tax_inclusive && (
                        <LuCheck style={{ width: "0.75rem", height: "0.75rem", strokeWidth: 3 }} />
                      )}
                    </div>
                    <span style={{ fontSize: "0.875rem", fontWeight: "500", color: form.tax_inclusive ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      Selling price includes tax (Tax Inclusive)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Modular Expandable Boxes Container (gap = 1rem) ═══════════════ */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
              {/* ═══ Section 2.5 — Category Metafields & Variants Matrix ════════════════ */}
              <div
                style={{
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  overflow: "hidden",
                }}
              >
                {/* Header Title with Toggle Switch (no + Add button) */}
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: hasVariants.value ? "1px solid var(--border)" : "none",
                    background: "var(--surface-2)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      Variants
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      This product has options, like size or color
                    </div>
                  </div>

                  {/* Top Header Toggle Switch */}
                  <button
                    type="button"
                    onClick$={() => {
                      hasVariants.value = !hasVariants.value;
                      if (hasVariants.value) {
                        form.track_inventory = true;
                        if (variantOptions.value.length === 0) {
                          variantOptions.value = [{ name: "", values: "" }];
                          editingOptionIndex.value = 0;
                        }
                      }
                    }}
                    role="switch"
                    aria-checked={hasVariants.value}
                    style={{
                      width: "2.75rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      border: "none",
                      cursor: "pointer",
                      background: hasVariants.value ? "var(--accent)" : "var(--border)",
                      position: "relative",
                      transition: "background 200ms ease",
                      flexShrink: "0",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "0.1875rem",
                        left: hasVariants.value ? "1.3125rem" : "0.1875rem",
                        width: "1.125rem",
                        height: "1.125rem",
                        background: hasVariants.value ? "var(--button-primary-text)" : "white",
                        borderRadius: "9999px",
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

                {/* Main Content Area inside Card */}
                {hasVariants.value && (
                  <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

                    {/* ═══ Option Groups Container Box (Screenshot 1 & 2) ═══ */}
                    <div style={{ borderRadius: "0.5rem", border: "1px solid var(--border)", background: "var(--surface-2)", overflow: "hidden" }}>
                      {variantOptions.value.map((opt, optIdx) => {
                        const isEditing = editingOptionIndex.value === optIdx;
                        const valsList = opt.values.split(",").map((s) => s.trim()).filter(Boolean);

                        if (isEditing) {
                          {/* Expanded / Edit Mode Option Row (Screenshot 2) */ }
                          return (
                            <div
                              key={optIdx}
                              style={{
                                padding: "1rem",
                                borderBottom: optIdx < variantOptions.value.length - 1 ? "1px solid var(--border)" : "none",
                                background: "var(--surface-2)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.875rem",
                              }}
                            >
                              {/* Option Name Input Header */}
                              <div>
                                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  {/* Up / Down Arrow buttons */}
                                  <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                    <button
                                      type="button"
                                      disabled={optIdx === 0}
                                      onClick$={(e) => {
                                        e.stopPropagation();
                                        if (optIdx === 0) return;
                                        const list = [...variantOptions.value];
                                        const [moved] = list.splice(optIdx, 1);
                                        list.splice(optIdx - 1, 0, moved);
                                        variantOptions.value = list;
                                        generateVariantsMatrix$();
                                      }}
                                      style={{ border: "none", background: "transparent", cursor: optIdx === 0 ? "default" : "pointer", opacity: optIdx === 0 ? 0.2 : 0.7, padding: 0, fontSize: "0.6rem", color: "var(--text-primary)", lineHeight: 1 }}
                                      title="Move option up"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      disabled={optIdx === variantOptions.value.length - 1}
                                      onClick$={(e) => {
                                        e.stopPropagation();
                                        if (optIdx === variantOptions.value.length - 1) return;
                                        const list = [...variantOptions.value];
                                        const [moved] = list.splice(optIdx, 1);
                                        list.splice(optIdx + 1, 0, moved);
                                        variantOptions.value = list;
                                        generateVariantsMatrix$();
                                      }}
                                      style={{ border: "none", background: "transparent", cursor: optIdx === variantOptions.value.length - 1 ? "default" : "pointer", opacity: optIdx === variantOptions.value.length - 1 ? 0.2 : 0.7, padding: 0, fontSize: "0.6rem", color: "var(--text-primary)", lineHeight: 1 }}
                                      title="Move option down"
                                    >
                                      ▼
                                    </button>
                                  </div>

                                  Option name
                                </label>
                                <input
                                  type="text"
                                  value={opt.name}
                                  onInput$={(e) => {
                                    const updated = [...variantOptions.value];
                                    updated[optIdx].name = (e.target as HTMLInputElement).value;
                                    variantOptions.value = updated;
                                    generateVariantsMatrix$();
                                  }}
                                  placeholder="e.g. Colour or Size"
                                  style={inputStyle}
                                />
                              </div>

                              {/* Option Values List with Individual Trash Icons */}
                              <div>
                                <label style={labelStyle}>Option values</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                  {valsList.map((valStr, valIdx) => (
                                    <div
                                      key={valIdx}
                                      style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
                                    >
                                      {/* Up / Down Arrow buttons */}
                                      <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                                        <button
                                          type="button"
                                          disabled={valIdx === 0}
                                          onClick$={(e) => {
                                            e.stopPropagation();
                                            if (valIdx === 0) return;
                                            const list = [...valsList];
                                            const [moved] = list.splice(valIdx, 1);
                                            list.splice(valIdx - 1, 0, moved);
                                            const updated = [...variantOptions.value];
                                            updated[optIdx].values = list.join(", ");
                                            variantOptions.value = updated;
                                            generateVariantsMatrix$();
                                          }}
                                          style={{ border: "none", background: "transparent", cursor: valIdx === 0 ? "default" : "pointer", opacity: valIdx === 0 ? 0.2 : 0.7, padding: 0, fontSize: "0.6rem", color: "var(--text-primary)", lineHeight: 1 }}
                                          title="Move value up"
                                        >
                                          ▲
                                        </button>
                                        <button
                                          type="button"
                                          disabled={valIdx === valsList.length - 1}
                                          onClick$={(e) => {
                                            e.stopPropagation();
                                            if (valIdx === valsList.length - 1) return;
                                            const list = [...valsList];
                                            const [moved] = list.splice(valIdx, 1);
                                            list.splice(valIdx + 1, 0, moved);
                                            const updated = [...variantOptions.value];
                                            updated[optIdx].values = list.join(", ");
                                            variantOptions.value = updated;
                                            generateVariantsMatrix$();
                                          }}
                                          style={{ border: "none", background: "transparent", cursor: valIdx === valsList.length - 1 ? "default" : "pointer", opacity: valIdx === valsList.length - 1 ? 0.2 : 0.7, padding: 0, fontSize: "0.6rem", color: "var(--text-primary)", lineHeight: 1 }}
                                          title="Move value down"
                                        >
                                          ▼
                                        </button>
                                      </div>

                                      <input
                                        type="text"
                                        value={valStr}
                                        onInput$={(e) => {
                                          const list = [...valsList];
                                          list[valIdx] = (e.target as HTMLInputElement).value;
                                          const updated = [...variantOptions.value];
                                          updated[optIdx].values = list.join(", ");
                                          variantOptions.value = updated;
                                          generateVariantsMatrix$();
                                        }}
                                        style={{ ...inputStyle, flex: 1 }}
                                      />
                                      <button
                                        type="button"
                                        onClick$={(e) => {
                                          e.stopPropagation();
                                          const list = valsList.filter((_, i) => i !== valIdx);
                                          const updated = [...variantOptions.value];
                                          updated[optIdx].values = list.join(", ");
                                          variantOptions.value = updated;
                                          generateVariantsMatrix$();
                                        }}
                                        style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0.25rem" }}
                                        title="Delete value"
                                      >
                                        <LuTrash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                                      </button>
                                    </div>
                                  ))}

                                  {/* Add another value input */}
                                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                    <div style={{ width: "16px" }} />
                                    <input
                                      type="text"
                                      placeholder="Add another value"
                                      value={newValueInputs.value[optIdx] || ""}
                                      onInput$={(e) => {
                                        const updated = { ...newValueInputs.value };
                                        updated[optIdx] = (e.target as HTMLInputElement).value;
                                        newValueInputs.value = updated;
                                      }}
                                      onKeyDown$={(e) => {
                                        if (e.key === "Enter" && (newValueInputs.value[optIdx] || "").trim()) {
                                          e.preventDefault();
                                          const valToAdd = (newValueInputs.value[optIdx] || "").trim();
                                          const list = [...valsList, valToAdd];
                                          const updatedOpts = [...variantOptions.value];
                                          updatedOpts[optIdx].values = list.join(", ");
                                          variantOptions.value = updatedOpts;
                                          const updatedInputs = { ...newValueInputs.value };
                                          updatedInputs[optIdx] = "";
                                          newValueInputs.value = updatedInputs;
                                          generateVariantsMatrix$();
                                        }
                                      }}
                                      style={inputStyle}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Action Footer: Delete & Done in Horizontal Flex (No divider borderTop) */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.75rem" }}>
                                <button
                                  type="button"
                                  onClick$={(e) => {
                                    e.stopPropagation();
                                    variantOptions.value = variantOptions.value.filter((_, i) => i !== optIdx);
                                    editingOptionIndex.value = null;
                                    generateVariantsMatrix$();
                                  }}
                                  style={{ padding: "0.35rem 0.875rem", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick$={(e) => {
                                    e.stopPropagation();
                                    if ((newValueInputs.value[optIdx] || "").trim()) {
                                      const valToAdd = (newValueInputs.value[optIdx] || "").trim();
                                      const list = [...valsList, valToAdd];
                                      const updatedOpts = [...variantOptions.value];
                                      updatedOpts[optIdx].values = list.join(", ");
                                      variantOptions.value = updatedOpts;
                                      const updatedInputs = { ...newValueInputs.value };
                                      updatedInputs[optIdx] = "";
                                      newValueInputs.value = updatedInputs;
                                    }
                                    editingOptionIndex.value = null;
                                    generateVariantsMatrix$();
                                  }}
                                  style={{ padding: "0.35rem 1rem", background: "var(--button-primary-bg, #2563eb)", color: "var(--button-primary-text, #ffffff)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          );
                        }

                        {/* Collapsed View Row */ }
                        return (
                          <div
                            key={optIdx}
                            onClick$={() => { editingOptionIndex.value = optIdx; }}
                            style={{
                              padding: "0.75rem 1rem",
                              borderBottom: optIdx < variantOptions.value.length - 1 ? "1px solid var(--border)" : "none",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            {/* Up / Down Arrow reorder buttons on left side (No surface3 bg, transparent!) */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "1px",
                                flexShrink: 0,
                                background: "transparent",
                                border: "none",
                                padding: 0,
                              }}
                              onClick$={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                disabled={optIdx === 0}
                                onClick$={(e) => {
                                  e.stopPropagation();
                                  if (optIdx === 0) return;
                                  const list = [...variantOptions.value];
                                  const [moved] = list.splice(optIdx, 1);
                                  list.splice(optIdx - 1, 0, moved);
                                  variantOptions.value = list;
                                  generateVariantsMatrix$();
                                }}
                                style={{ border: "none", background: "transparent", cursor: optIdx === 0 ? "default" : "pointer", opacity: optIdx === 0 ? 0.2 : 0.7, padding: 0, fontSize: "0.6rem", color: "var(--text-primary)", lineHeight: 1 }}
                                title="Move option up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={optIdx === variantOptions.value.length - 1}
                                onClick$={(e) => {
                                  e.stopPropagation();
                                  if (optIdx === variantOptions.value.length - 1) return;
                                  const list = [...variantOptions.value];
                                  const [moved] = list.splice(optIdx, 1);
                                  list.splice(optIdx + 1, 0, moved);
                                  variantOptions.value = list;
                                  generateVariantsMatrix$();
                                }}
                                style={{ border: "none", background: "transparent", cursor: optIdx === variantOptions.value.length - 1 ? "default" : "pointer", opacity: optIdx === variantOptions.value.length - 1 ? 0.2 : 0.7, padding: 0, fontSize: "0.6rem", color: "var(--text-primary)", lineHeight: 1 }}
                                title="Move option down"
                              >
                                ▼
                              </button>
                            </div>

                            {/* Option Name & Value Pills aligned with tight 0.375rem gap (reduced by >1rem!) */}
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flex: 1, flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", marginRight: "0.25rem" }}>
                                {opt.name || "Untitled Option"}
                              </span>
                              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                                {valsList.map((val, vIdx) => {
                                  const displayVal = formatColorName(val);
                                  const valHex = val.startsWith("#") ? val : (val.match(/#([0-9a-fA-F]{3,6})/) ? `#${val.match(/#([0-9a-fA-F]{3,6})/)![1]}` : undefined);
                                  return (
                                    <span
                                      key={vIdx}
                                      style={{
                                        padding: "0.2rem 0.5rem",
                                        borderRadius: "0.25rem",
                                        background: "var(--surface-1)",
                                        border: "1px solid var(--border)",
                                        fontSize: "0.75rem",
                                        fontWeight: "600",
                                        color: "var(--text-primary)",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.35rem",
                                      }}
                                    >
                                      <span>{displayVal}</span>
                                      {valHex && (
                                        <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: valHex, border: "1px solid rgba(255,255,255,0.3)" }} />
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add another option link */}
                      <div style={{ padding: "0.875rem 1rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
                        <button
                          type="button"
                          onClick$={() => {
                            variantOptions.value = [...variantOptions.value, { name: "", values: "" }];
                            editingOptionIndex.value = variantOptions.value.length - 1;
                            generateVariantsMatrix$();
                          }}
                          style={{ fontSize: "0.8125rem", color: "var(--text-primary)", background: "transparent", border: "none", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "0.375rem" }}
                        >
                          <LuPlus style={{ width: "1rem", height: "1rem" }} />
                          Add another option
                        </button>
                      </div>
                    </div>

                    {/* ═══ Group By Selector & Search Controls Bar ═══ */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: "500" }}>
                          Group by
                        </span>
                        <select
                          value={selectedGroupBy.value}
                          onChange$={(e) => { selectedGroupBy.value = (e.target as HTMLSelectElement).value; }}
                          style={{
                            ...inputStyle,
                            width: "130px",
                            height: "2rem",
                            fontSize: "0.8125rem",
                            padding: "0 0.5rem",
                            backgroundImage: SELECT_ARROW,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.5rem center",
                            appearance: "none" as const,
                            paddingRight: "1.5rem",
                          }}
                        >
                          {variantOptions.value.map((o) => o.name).filter(Boolean).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                          <option value="None">None</option>
                        </select>
                      </div>

                      {/* Working Search Button & Expandable Input (Filter Icon Removed!) */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        {variantSearchOpen.value ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <input
                              type="text"
                              placeholder="Search variants..."
                              value={variantSearchQuery.value}
                              onInput$={(e) => {
                                variantSearchQuery.value = (e.target as HTMLInputElement).value;
                              }}
                              style={{
                                ...inputStyle,
                                width: "150px",
                                height: "2rem",
                                fontSize: "0.75rem",
                                padding: "0 0.5rem",
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick$={() => {
                                variantSearchQuery.value = "";
                                variantSearchOpen.value = false;
                              }}
                              style={{
                                width: "2rem",
                                height: "2rem",
                                borderRadius: "0.375rem",
                                border: "1px solid var(--border)",
                                background: "var(--surface-2)",
                                color: "var(--text-secondary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                              title="Clear & close search"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick$={() => {
                              variantSearchOpen.value = true;
                            }}
                            style={{
                              width: "2rem",
                              height: "2rem",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: variantSearchQuery.value ? "var(--accent-subtle)" : "var(--surface-2)",
                              color: variantSearchQuery.value ? "var(--accent)" : "var(--text-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                            title="Search variants"
                          >
                            <LuSearch style={{ width: "0.875rem", height: "0.875rem" }} />
                          </button>
                        )}
                      </div>
                    </div>
                    {itemVariants.value.length > 0 && (
                      <div class="hide-scrollbar" style={{ borderRadius: "0.5rem", border: "1px solid var(--border)", background: "var(--surface-2)", overflowX: "auto", maxWidth: "100%", boxSizing: "border-box", scrollbarWidth: "none", msOverflowStyle: "none" }}>
                        <div style={{ minWidth: "460px", width: "100%", boxSizing: "border-box" }}>
                          {/* Table Header (Aligned & All columns inside card box!) */}
                          <div style={{ display: "flex", alignItems: "center", padding: "0.625rem 0.875rem", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", gap: "0.5rem", width: "100%", boxSizing: "border-box" }}>
                            <input type="checkbox" style={{ marginRight: 0, opacity: 0.7, flexShrink: 0 }} />
                            {/* Image Column Spacer (2.25rem width) */}
                            <div style={{ width: "2.25rem", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: "100px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span>Variant</span>
                              <button
                                type="button"
                                onClick$={generateAllVariantSkus$}
                                style={{ fontSize: "0.65rem", color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontWeight: "600" }}
                                title="Auto-generate SKUs for all variants"
                              >
                                ✦ Gen SKUs
                              </button>
                            </div>
                            <div style={{ width: "85px", flexShrink: 0 }}>Price</div>
                            <div style={{ width: "55px", flexShrink: 0, textAlign: "center" }}>Available</div>
                            <div style={{ width: "32px", flexShrink: 0 }} />
                            <div style={{ width: "24px", flexShrink: 0, textAlign: "center" }} />
                          </div>

                          {/* Grouped Accordion Rows */}
                          {selectedGroupBy.value !== "None" ? (
                            (() => {
                              const map: Record<string, ShopItemVariant[]> = {};
                              const gLower = selectedGroupBy.value.toLowerCase();
                              const searchQuery = (variantSearchQuery.value || "").trim().toLowerCase();
                              const displayVariants = searchQuery
                                ? itemVariants.value.filter((v) => {
                                  const name = (v.name || "").toLowerCase();
                                  const sku = (v.sku || "").toLowerCase();
                                  const color = formatColorName(v.name || "").toLowerCase();
                                  return name.includes(searchQuery) || sku.includes(searchQuery) || color.includes(searchQuery);
                                })
                                : itemVariants.value;

                              displayVariants.forEach((v) => {
                                let key = "";
                                try {
                                  const parsed = JSON.parse(v.attributes || "{}");
                                  key = parsed[gLower] || parsed[selectedGroupBy.value] || "";
                                } catch { /* empty */ }
                                if (!key && v.name) {
                                  key = v.name.split("/")[0]?.trim() || "Default";
                                }
                                if (!key) key = "Default";
                                if (!map[key]) map[key] = [];
                                map[key].push(v);
                              });

                              const currencySymbol = form.currency === "USD" ? "$" : form.currency === "EUR" ? "€" : form.currency === "GBP" ? "£" : "₹";

                              return Object.entries(map).map(([groupKey, groupItems]) => {
                                const isExpanded = expandedGroups.value[groupKey] ?? (searchQuery ? true : false);
                                const totalStock = groupItems.reduce((acc, curr) => acc + (curr.stock_qty || 0), 0);
                                const groupImg = groupItems.find((i) => i.media_url)?.media_url;

                                // Resolve Color Hex & Dynamic Clean Title (Shows "Black" instead of "#000000"!)
                                let groupHex = groupItems.find((i) => i.color_hex)?.color_hex;
                                if (!groupHex && groupKey.startsWith("#")) groupHex = groupKey;

                                let cleanGroupTitle = formatColorName(groupKey);
                                if (cleanGroupTitle.startsWith("#")) {
                                  const firstChildName = groupItems[0]?.name?.split("/")[0]?.trim();
                                  if (firstChildName) {
                                    cleanGroupTitle = formatColorName(firstChildName);
                                  }
                                }

                                return (
                                  <div key={groupKey} style={{ borderBottom: "1px solid var(--border)", width: "100%", boxSizing: "border-box" }}>
                                    {/* Group Accordion Header Row */}
                                    <div
                                      onClick$={() => {
                                        expandedGroups.value = {
                                          ...expandedGroups.value,
                                          [groupKey]: !isExpanded,
                                        };
                                      }}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "0.625rem 0.875rem",
                                        background: "var(--surface-2)",
                                        cursor: "pointer",
                                        userSelect: "none",
                                        gap: "0.5rem",
                                        width: "100%",
                                        boxSizing: "border-box",
                                      }}
                                    >
                                      <input type="checkbox" onClick$={(e) => e.stopPropagation()} style={{ marginRight: 0, flexShrink: 0 }} />

                                      {/* Thumbnail Button for entire Group (2.25rem width) */}
                                      <div
                                        onClick$={(e) => {
                                          e.stopPropagation();
                                          activeGroupImageKey.value = groupKey;
                                          mediaPickerFilter.value = "image";
                                          mediaPickerOpen.value = true;
                                        }}
                                        style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.375rem", border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                                        title="Click to select image for all variants in this group"
                                      >
                                        {groupImg ? (
                                          <img src={groupImg} alt="" width="36" height="36" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        ) : (
                                          <LuImage style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)" }} />
                                        )}
                                      </div>

                                      {/* Title & Count — Flexible, truncates cleanly */}
                                      <div style={{ flex: 1, minWidth: "100px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                        <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          <span>{cleanGroupTitle || groupKey}</span>
                                          {groupHex ? (
                                            <span style={{ width: "0.625rem", height: "0.625rem", borderRadius: "50%", background: groupHex, border: "1px solid rgba(255,255,255,0.3)", display: "inline-block", flexShrink: 0 }} />
                                          ) : null}
                                        </div>
                                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                          {groupItems.length} {groupItems.length === 1 ? "variant" : "variants"}
                                        </div>
                                      </div>

                                      {/* Group Price Input with Currency Prefix Icon & No Spinners */}
                                      <div style={{ position: "relative", width: "85px", flexShrink: 0 }} onClick$={(e) => e.stopPropagation()}>
                                        <span style={{ position: "absolute", left: "0.4rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600", pointerEvents: "none" }}>
                                          {currencySymbol}
                                        </span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="0.00"
                                          value={(groupItems[0]?.price !== undefined && groupItems[0]?.price !== null && !isNaN(groupItems[0].price)) ? groupItems[0].price : ((groupItems[0]?.price_delta || 0) !== 0 ? (parseFloat(form.price) || 0) + groupItems[0].price_delta : (parseFloat(form.price) || 0))}
                                          onInput$={(e) => {
                                            const newPrice = parseFloat((e.target as HTMLInputElement).value) || 0;
                                            const baseSellingPrice = parseFloat(form.price) || 0;
                                            const newDelta = baseSellingPrice > 0 ? (newPrice - baseSellingPrice) : 0;
                                            const groupNames = new Set(groupItems.map((g) => g.name));
                                            const groupIds = new Set(groupItems.map((g) => g.id).filter(Boolean));
                                            const updated = itemVariants.value.map((item) => {
                                              if (groupNames.has(item.name) || (item.id && groupIds.has(item.id))) {
                                                return { ...item, price: newPrice, price_delta: newDelta };
                                              }
                                              return item;
                                            });
                                            itemVariants.value = updated;
                                          }}
                                          style={{
                                            ...inputStyle,
                                            height: "2rem",
                                            width: "100%",
                                            fontSize: "0.75rem",
                                            paddingLeft: "1.2rem",
                                            paddingRight: "0.25rem",
                                            background: "var(--surface-3)",
                                            appearance: "textfield" as const,
                                            MozAppearance: "textfield" as const,
                                          }}
                                          title="Set price for all variants in this group"
                                        />
                                      </div>

                                      {/* Stock Sum */}
                                      <div style={{ width: "55px", flexShrink: 0, fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", textAlign: "center" }}>
                                        {totalStock}
                                      </div>

                                      {/* Empty spacer for Edit button column alignment */}
                                      <div style={{ width: "32px", flexShrink: 0 }} />

                                      {/* Accordion Chevron — Centered in 24px column inside card border line! */}
                                      <div style={{ width: "24px", flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
                                        {isExpanded ? <LuChevronUp style={{ width: "1rem", height: "1rem" }} /> : <LuChevronDown style={{ width: "1rem", height: "1rem" }} />}
                                      </div>
                                    </div>

                                    {/* Expanded Sub-variants Panel (Child Items BG = surface2) */}
                                    {isExpanded && (
                                      <div style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
                                        {groupItems.map((v) => {
                                          const vIdx = itemVariants.value.findIndex((item) => (v.id && item.id === v.id) || item.name === v.name);

                                          // Clean child item name: ONLY show child value (e.g. "S", "M", "L"), strip group title!
                                          const parts = (v.name || "").split("/").map((p) => p.trim());
                                          let childName = formatColorName(v.name);
                                          if (parts.length > 1) {
                                            const filtered = parts.filter((p) => {
                                              const pClean = formatColorName(p).toLowerCase();
                                              const gClean = cleanGroupTitle.toLowerCase();
                                              return (
                                                pClean !== gClean &&
                                                !gClean.includes(pClean) &&
                                                !pClean.includes(gClean) &&
                                                !pClean.startsWith("#")
                                              );
                                            });
                                            if (filtered.length > 0) {
                                              childName = filtered.map((f) => formatColorName(f)).join(" / ");
                                            } else if (parts[1]) {
                                              childName = formatColorName(parts[1]);
                                            }
                                          }

                                          return (
                                            <div key={v.id || v.name} style={{ display: "flex", alignItems: "center", padding: "0.5rem 0.875rem", borderTop: "1px solid var(--border)", fontSize: "0.8125rem", background: "var(--surface-2)", gap: "0.75rem" }}>
                                              {/* Checkbox — aligned in straight line */}
                                              <input type="checkbox" style={{ marginRight: 0, opacity: 0.5, flexShrink: 0 }} />

                                              {/* Child Variant Thumbnail Button (2.25rem width in straight vertical line!) */}
                                              <div
                                                onClick$={(e) => {
                                                  e.stopPropagation();
                                                  variantMediaIndex.value = vIdx !== -1 ? vIdx : null;
                                                  mediaPickerFilter.value = "image";
                                                  mediaPickerOpen.value = true;
                                                }}
                                                style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.375rem", border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                                                title="Click to select image for this variant"
                                              >
                                                {v.media_url ? (
                                                  <img src={v.media_url} alt="" width="36" height="36" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                ) : (
                                                  <LuImage style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)" }} />
                                                )}
                                              </div>

                                              <div style={{ width: "140px", flexShrink: 0, fontWeight: "600", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {childName}
                                              </div>

                                              {/* Price Input with Currency Prefix & No Spinners */}
                                              <div style={{ position: "relative", width: "85px", flexShrink: 0 }}>
                                                <span style={{ position: "absolute", left: "0.4rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600", pointerEvents: "none" }}>
                                                  {currencySymbol}
                                                </span>
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  placeholder="0.00"
                                                  value={(v.price !== undefined && v.price !== null && !isNaN(v.price)) ? v.price : ((v.price_delta || 0) !== 0 ? ((parseFloat(form.price) || 0) + v.price_delta) : (parseFloat(form.price) || 0))}
                                                  onInput$={(e) => {
                                                    const targetIdx = itemVariants.value.findIndex((item) => (v.id && item.id === v.id) || item.name === v.name);
                                                    if (targetIdx !== -1) {
                                                      const updated = [...itemVariants.value];
                                                      const newPrice = parseFloat((e.target as HTMLInputElement).value) || 0;
                                                      const baseSellingPrice = parseFloat(form.price) || 0;
                                                      const newDelta = baseSellingPrice > 0 ? (newPrice - baseSellingPrice) : 0;
                                                      updated[targetIdx] = { ...updated[targetIdx], price: newPrice, price_delta: newDelta };
                                                      itemVariants.value = updated;
                                                    }
                                                  }}
                                                  style={{
                                                    ...inputStyle,
                                                    height: "2rem",
                                                    width: "100%",
                                                    fontSize: "0.75rem",
                                                    paddingLeft: "1.2rem",
                                                    paddingRight: "0.25rem",
                                                    appearance: "textfield" as const,
                                                    MozAppearance: "textfield" as const,
                                                  }}
                                                />
                                              </div>

                                              {/* Stock Qty Input (No Spinners) */}
                                              <div style={{ width: "55px", flexShrink: 0 }}>
                                                <input
                                                  type="number"
                                                  placeholder="Stock"
                                                  value={v.stock_qty || 0}
                                                  onInput$={(e) => {
                                                    const targetIdx = itemVariants.value.findIndex((item) => (v.id && item.id === v.id) || item.name === v.name);
                                                    if (targetIdx !== -1) {
                                                      const updated = [...itemVariants.value];
                                                      updated[targetIdx] = { ...updated[targetIdx], stock_qty: parseFloat((e.target as HTMLInputElement).value) || 0 };
                                                      itemVariants.value = updated;
                                                    }
                                                  }}
                                                  style={{
                                                    ...inputStyle,
                                                    height: "2rem",
                                                    width: "100%",
                                                    fontSize: "0.75rem",
                                                    padding: "0 0.25rem",
                                                    textAlign: "center",
                                                    appearance: "textfield" as const,
                                                    MozAppearance: "textfield" as const,
                                                  }}
                                                />
                                              </div>

                                              {/* Edit Icon Button — Always visible on mobile! */}
                                              <div style={{ width: "32px", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                                                <button
                                                  type="button"
                                                  onClick$={() => {
                                                    const targetIdx = itemVariants.value.findIndex((item) => (v.id && item.id === v.id) || item.name === v.name);
                                                    variantDetailsIndex.value = targetIdx !== -1 ? targetIdx : null;
                                                    selectedVariantForDetails.value = targetIdx !== -1 ? { ...itemVariants.value[targetIdx] } : { ...v };
                                                    variantDetailsOpen.value = true;
                                                  }}
                                                  style={{
                                                    width: "2rem",
                                                    height: "2rem",
                                                    borderRadius: "0.375rem",
                                                    border: "1px solid var(--border)",
                                                    background: "var(--surface-3)",
                                                    color: "var(--text-primary)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    cursor: "pointer",
                                                  }}
                                                  title="Edit variant details"
                                                >
                                                  <LuPencil style={{ width: "0.875rem", height: "0.875rem" }} />
                                                </button>
                                              </div>

                                              {/* Chevron Column spacer for row symmetry */}
                                              <div style={{ width: "24px", flexShrink: 0 }} />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()
                          ) : (
                            /* Flat list if Group by is None */
                            itemVariants.value.map((v, vIdx) => {
                              const currencySymbol = form.currency === "USD" ? "$" : form.currency === "EUR" ? "€" : form.currency === "GBP" ? "£" : "₹";
                              return (
                                <div key={vIdx} style={{ display: "flex", alignItems: "center", padding: "0.625rem 0.875rem", borderBottom: "1px solid var(--border)", fontSize: "0.8125rem", gap: "0.75rem" }}>
                                  <input type="checkbox" style={{ marginRight: 0, flexShrink: 0 }} />
                                  {/* Child Variant Thumbnail Button (2.25rem width in straight vertical line!) */}
                                  <div
                                    onClick$={(e) => {
                                      e.stopPropagation();
                                      variantMediaIndex.value = vIdx;
                                      mediaPickerFilter.value = "image";
                                      mediaPickerOpen.value = true;
                                    }}
                                    style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.375rem", border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                                    title="Click to select image for this variant"
                                  >
                                    {v.media_url ? (
                                      <img src={v.media_url} alt="" width="36" height="36" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : (
                                      <LuImage style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)" }} />
                                    )}
                                  </div>
                                  <div style={{ width: "140px", flexShrink: 0, fontWeight: "600", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {formatColorName(v.name)}
                                  </div>
                                  <div style={{ position: "relative", width: "85px", flexShrink: 0 }}>
                                    <span style={{ position: "absolute", left: "0.4rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600", pointerEvents: "none" }}>
                                      {currencySymbol}
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={(v.price !== undefined && v.price !== null && !isNaN(v.price)) ? v.price : ((v.price_delta || 0) !== 0 ? ((parseFloat(form.price) || 0) + v.price_delta) : (parseFloat(form.price) || 0))}
                                      onInput$={(e) => {
                                        const updated = [...itemVariants.value];
                                        const newPrice = parseFloat((e.target as HTMLInputElement).value) || 0;
                                        const baseSellingPrice = parseFloat(form.price) || 0;
                                        const newDelta = baseSellingPrice > 0 ? (newPrice - baseSellingPrice) : 0;
                                        updated[vIdx] = { ...updated[vIdx], price: newPrice, price_delta: newDelta };
                                        itemVariants.value = updated;
                                      }}
                                      style={{
                                        ...inputStyle,
                                        height: "2rem",
                                        width: "100%",
                                        fontSize: "0.75rem",
                                        paddingLeft: "1.2rem",
                                        paddingRight: "0.25rem",
                                        appearance: "textfield" as const,
                                        MozAppearance: "textfield" as const,
                                      }}
                                    />
                                  </div>
                                  <div style={{ width: "55px", flexShrink: 0 }}>
                                    <input
                                      type="number"
                                      placeholder="Stock"
                                      value={v.stock_qty || 0}
                                      onInput$={(e) => {
                                        const updated = [...itemVariants.value];
                                        updated[vIdx] = { ...updated[vIdx], stock_qty: parseFloat((e.target as HTMLInputElement).value) || 0 };
                                        itemVariants.value = updated;
                                      }}
                                      style={{
                                        ...inputStyle,
                                        height: "2rem",
                                        width: "100%",
                                        fontSize: "0.75rem",
                                        padding: "0 0.25rem",
                                        textAlign: "center",
                                        appearance: "textfield" as const,
                                        MozAppearance: "textfield" as const,
                                      }}
                                    />
                                  </div>
                                  <div style={{ width: "32px", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                                    <button
                                      type="button"
                                      onClick$={() => {
                                        variantDetailsIndex.value = vIdx;
                                        selectedVariantForDetails.value = { ...itemVariants.value[vIdx] };
                                        variantDetailsOpen.value = true;
                                      }}
                                      style={{
                                        width: "2rem",
                                        height: "2rem",
                                        borderRadius: "0.375rem",
                                        border: "1px solid var(--border)",
                                        background: "var(--surface-3)",
                                        color: "var(--text-primary)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                      }}
                                      title="Edit variant details"
                                    >
                                      <LuPencil style={{ width: "0.875rem", height: "0.875rem" }} />
                                    </button>
                                  </div>
                                  <div style={{ width: "24px", flexShrink: 0 }} />
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Total Inventory Footer Summary Bar */}
                        <div style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", fontSize: "0.8125rem", fontWeight: "500", color: "var(--text-secondary)" }}>
                          Total inventory at Primary Store Location: <strong style={{ color: "var(--text-primary)" }}>{itemVariants.value.reduce((acc, curr) => acc + (curr.stock_qty || 0), 0)} available</strong>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* ═══ Section 3 — Media & Video ═════════════════════════════════ */}
              {/* Outer Card Box */}
              <div
                style={{
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  overflow: "hidden",
                }}
              >
                {/* Header Title with Toggle Switch */}
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: hasMedia.value ? "1px solid var(--border)" : "none",
                    background: "var(--surface-2)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      Media & Gallery
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Product images, sliders, and video feeds
                    </div>
                  </div>

                  {/* Top Header Toggle Switch */}
                  <button
                    type="button"
                    onClick$={() => {
                      hasMedia.value = !hasMedia.value;
                    }}
                    role="switch"
                    aria-checked={hasMedia.value}
                    style={{
                      width: "2.75rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      border: "none",
                      cursor: "pointer",
                      background: hasMedia.value ? "var(--accent)" : "var(--border)",
                      position: "relative",
                      transition: "background 200ms ease",
                      flexShrink: "0",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "0.1875rem",
                        left: hasMedia.value ? "1.3125rem" : "0.1875rem",
                        width: "1.125rem",
                        height: "1.125rem",
                        background: hasMedia.value ? "var(--button-primary-text)" : "white",
                        borderRadius: "9999px",
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

                {/* Main Content Area inside Card */}
                {hasMedia.value && (
                  <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {/* Primary Product Image */}
                    <div>
                      <label style={labelStyle}>Primary Product Image</label>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        {form.media_url ? (
                          <div style={{ position: "relative", width: "4.5rem", height: "4.5rem", borderRadius: "0.5rem", border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-3)" }}>
                            <img src={form.media_url} alt="Product preview" width="72" height="72" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                              type="button"
                              onClick$={() => { form.media_id = ""; form.media_url = ""; }}
                              style={{ position: "absolute", top: "2px", right: "2px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: "1.25rem", height: "1.25rem", fontSize: "0.7rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ width: "4.5rem", height: "4.5rem", borderRadius: "0.5rem", border: "1px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--field-fill)", color: "var(--text-secondary)", fontSize: "0.7rem" }}>
                            <LuImage style={{ width: "1.25rem", height: "1.25rem", marginBottom: "2px" }} />
                            No Image
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick$={() => { pickerTarget.value = "main_image"; mediaPickerFilter.value = "image"; mediaPickerOpen.value = true; }}
                            style={{ height: "2.25rem", padding: "0 0.875rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem" }}
                          >
                            <LuImage style={{ width: "0.875rem", height: "0.875rem" }} />
                            Browse
                          </button>
                          <button
                            type="button"
                            onClick$={() => { pickerTarget.value = "main_image"; mediaModalOpen.value = true; }}
                            style={{ height: "2.25rem", padding: "0 0.875rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem" }}
                          >
                            <LuPlus style={{ width: "0.875rem", height: "0.875rem" }} />
                            Upload
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Multiple Image Gallery Slider */}
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
                                style={{ height: "2rem", padding: "0 0.6rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer" }}
                              >
                                Change
                              </button>
                              <button
                                type="button"
                                onClick$={() => { form.slider_id = ""; selectedSlider.value = null; }}
                                style={{ height: "2rem", padding: "0 0.6rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--error)", cursor: "pointer" }}
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
                        /* Action Buttons when no slider is selected */
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick$={() => { sliderPickerOpen.value = true; }}
                            style={{ height: "2.25rem", padding: "0 0.875rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem" }}
                          >
                            <LuSliders style={{ width: "0.875rem", height: "0.875rem" }} />
                            Select Gallery
                          </button>

                          <button
                            type="button"
                            onClick$={() => { sliderModalOpen.value = true; }}
                            style={{ height: "2.25rem", padding: "0 0.875rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem" }}
                          >
                            <LuPlus style={{ width: "0.875rem", height: "0.875rem" }} />
                            Create Gallery
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Video Feed / YouTube Shorts */}
                    <div>
                      <label style={labelStyle}>Product Video / Shorts Feed URL (Optional)</label>
                      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.375rem", alignItems: "center" }}>
                        <input
                          type="text"
                          placeholder="https://youtube.com/shorts/... or video URL"
                          value={form.video_url}
                          onInput$={(e) => { form.video_url = (e.target as HTMLInputElement).value; }}
                          style={{ ...inputStyle, flex: 1, height: "2.25rem" }}
                          onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                          onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                        />
                        <button
                          type="button"
                          onClick$={() => { pickerTarget.value = "video"; mediaPickerFilter.value = "video"; mediaPickerOpen.value = true; }}
                          style={{ height: "2.25rem", padding: "0 0.75rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          <LuVideo style={{ width: "0.875rem", height: "0.875rem" }} />
                          Pick Video
                        </button>
                        <button
                          type="button"
                          onClick$={() => { pickerTarget.value = "video"; mediaModalOpen.value = true; }}
                          style={{ height: "2.25rem", padding: "0 0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          + Upload
                        </button>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Supports YouTube link, Shorts-style video feed URL, or uploaded video media file.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ═══ Section 3.5 — Weight, Dimensions & Packaging ════════════════ */}
              {/* Outer Card Box */}
              <div
                style={{
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  overflow: "hidden",
                }}
              >
                {/* Header Title with Toggle Switch */}
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: hasPackaging.value ? "1px solid var(--border)" : "none",
                    background: "var(--surface-2)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      Weight, Dimensions & Packaging
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Shipping weight, box dimensions, pack size, and unit conversion
                    </div>
                  </div>

                  {/* Top Header Toggle Switch */}
                  <button
                    type="button"
                    onClick$={() => {
                      hasPackaging.value = !hasPackaging.value;
                    }}
                    role="switch"
                    aria-checked={hasPackaging.value}
                    style={{
                      width: "2.75rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      border: "none",
                      cursor: "pointer",
                      background: hasPackaging.value ? "var(--accent)" : "var(--border)",
                      position: "relative",
                      transition: "background 200ms ease",
                      flexShrink: "0",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "0.1875rem",
                        left: hasPackaging.value ? "1.3125rem" : "0.1875rem",
                        width: "1.125rem",
                        height: "1.125rem",
                        background: hasPackaging.value ? "var(--button-primary-text)" : "white",
                        borderRadius: "9999px",
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

                {/* Main Content Area inside Card */}
                {hasPackaging.value && (
                  <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {/* Row 1: Shipping Weight & Weight Unit */}
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <div style={{ flex: "2" }}>
                        <label style={labelStyle}>Item Weight</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.weight}
                          onInput$={(e) => { form.weight = (e.target as HTMLInputElement).value; }}
                          placeholder="0.00"
                          style={inputStyle}
                          onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                          onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                        />
                      </div>
                      <div style={{ flex: "1" }}>
                        <label style={labelStyle}>Weight Unit</label>
                        <select
                          value={form.weight_unit}
                          onChange$={(e) => { form.weight_unit = (e.target as HTMLSelectElement).value; }}
                          style={{ ...inputStyle, height: "38px" }}
                        >
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="lb">lb</option>
                          <option value="oz">oz</option>
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Dimensions (L x W x H) & Dimension Unit */}
                    <div>
                      <label style={labelStyle}>Dimensions (L × W × H)</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem" }}>
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.dim_length}
                            onInput$={(e) => { form.dim_length = (e.target as HTMLInputElement).value; }}
                            placeholder="Length"
                            style={inputStyle}
                            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.width}
                            onInput$={(e) => { form.width = (e.target as HTMLInputElement).value; }}
                            placeholder="Width"
                            style={inputStyle}
                            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.height}
                            onInput$={(e) => { form.height = (e.target as HTMLInputElement).value; }}
                            placeholder="Height"
                            style={inputStyle}
                            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                          />
                        </div>
                        <div>
                          <select
                            value={form.dimension_unit}
                            onChange$={(e) => { form.dimension_unit = (e.target as HTMLSelectElement).value; }}
                            style={{ ...inputStyle, height: "38px" }}
                          >
                            <option value="cm">cm</option>
                            <option value="in">inches (in)</option>
                            <option value="mm">mm</option>
                            <option value="m">m</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Packaging Spec & Units per Pack (Conversion Factor) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={labelStyle}>
                          Packaging Size
                          <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginLeft: "0.375rem" }}>(e.g. 15x1x10, 10 TAB, 100ml)</span>
                        </label>
                        <input
                          type="text"
                          value={form.pack_size}
                          onInput$={(e) => { form.pack_size = (e.target as HTMLInputElement).value; }}
                          placeholder="e.g. 10 TAB / 15x1x10 / Box of 24"
                          style={inputStyle}
                          onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                          onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
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
                          value={form.conversion_factor}
                          onInput$={(e) => { form.conversion_factor = (e.target as HTMLInputElement).value; }}
                          placeholder="1"
                          style={inputStyle}
                          onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                          onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                        />
                      </div>
                    </div>

                    {/* Row 4: Country of Origin */}
                    <div>
                      <label style={labelStyle}>Country of Origin</label>
                      <input
                        type="text"
                        value={form.country_of_origin}
                        onInput$={(e) => { form.country_of_origin = (e.target as HTMLInputElement).value; }}
                        placeholder="e.g. India"
                        style={inputStyle}
                        onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                        onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ═══ Section 3.6 — Scheme & Promotional Offer ════════════════ */}
              {/* Outer Card Box */}
              <div
                style={{
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  overflow: "hidden",
                }}
              >
                {/* Header Title with Toggle Switch */}
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: hasScheme.value ? "1px solid var(--border)" : "none",
                    background: "var(--surface-2)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      Scheme & Promotional Offers
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Buy X Get Y Free promotional rules (e.g. Buy 10, Get 1 Free)
                    </div>
                  </div>

                  {/* Top Header Toggle Switch */}
                  <button
                    type="button"
                    onClick$={() => {
                      hasScheme.value = !hasScheme.value;
                    }}
                    role="switch"
                    aria-checked={hasScheme.value}
                    style={{
                      width: "2.75rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      border: "none",
                      cursor: "pointer",
                      background: hasScheme.value ? "var(--accent)" : "var(--border)",
                      position: "relative",
                      transition: "background 200ms ease",
                      flexShrink: "0",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "0.1875rem",
                        left: hasScheme.value ? "1.3125rem" : "0.1875rem",
                        width: "1.125rem",
                        height: "1.125rem",
                        background: hasScheme.value ? "var(--button-primary-text)" : "white",
                        borderRadius: "9999px",
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

                {/* Main Content Area inside Card */}
                {hasScheme.value && (
                  <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      <div>
                        <label style={labelStyle}>Buy Quantity (Scheme On)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.scheme_on}
                          onInput$={(e) => { form.scheme_on = (e.target as HTMLInputElement).value; }}
                          placeholder="e.g. 10"
                          style={inputStyle}
                          onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                          onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                        />
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                          Minimum purchase units to trigger free bonus
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Bonus Free Units (Scheme Free)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.scheme_free}
                          onInput$={(e) => { form.scheme_free = (e.target as HTMLInputElement).value; }}
                          placeholder="e.g. 1"
                          style={inputStyle}
                          onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                          onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                        />
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                          Free bonus units automatically awarded
                        </div>
                      </div>
                    </div>

                    {parseFloat(form.scheme_on) > 0 && parseFloat(form.scheme_free) > 0 && (
                      <div
                        style={{
                          padding: "0.625rem 0.875rem",
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
                          Buy {form.scheme_on} → Get {form.scheme_free} FREE units (e.g. Buy {parseFloat(form.scheme_on) * 2} → Get {parseFloat(form.scheme_free) * 2} FREE)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ═══ Section 4 — Settings ═══════════════════════════════════════ */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                    Active (POS)
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Show this product in billing & storefront
                  </div>
                </div>
                <button
                  type="button"
                  onClick$={() => { form.is_active = !form.is_active; }}
                  role="switch"
                  aria-checked={form.is_active}
                  style={{
                    width: "2.75rem",
                    height: "1.5rem",
                    borderRadius: "9999px",
                    border: "none",
                    cursor: "pointer",
                    background: form.is_active ? "var(--accent)" : "var(--border)",
                    position: "relative",
                    transition: "background 200ms ease",
                    flexShrink: "0",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "0.1875rem",
                      left: form.is_active ? "1.3125rem" : "0.1875rem",
                      width: "1.125rem",
                      height: "1.125rem",
                      background: form.is_active ? "var(--button-primary-text)" : "white",
                      borderRadius: "9999px",
                      transition: "left 200ms ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  marginTop: "0.5rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>
                    Track Stock
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Deduct from inventory when sold
                  </div>
                </div>
                <button
                  type="button"
                  onClick$={() => { form.track_inventory = !form.track_inventory; }}
                  role="switch"
                  aria-checked={form.track_inventory}
                  style={{
                    width: "2.75rem",
                    height: "1.5rem",
                    borderRadius: "9999px",
                    border: "none",
                    cursor: "pointer",
                    background: form.track_inventory ? "var(--accent)" : "var(--border)",
                    position: "relative",
                    transition: "background 200ms ease",
                    flexShrink: "0",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "0.1875rem",
                      left: form.track_inventory ? "1.3125rem" : "0.1875rem",
                      width: "1.125rem",
                      height: "1.125rem",
                      background: form.track_inventory ? "var(--button-primary-text)" : "white",
                      borderRadius: "9999px",
                      transition: "left 200ms ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
              </div>

              {/* ── Notes Accordion Card ──── */}
              <div
                style={{
                  marginTop: "0.5rem",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick$={() => { hasNotes.value = !hasNotes.value; }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>Notes</span>
                      {(form.notes || form.agent_notes) && (
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "9999px",
                            background: "var(--accent-muted, rgba(99, 102, 241, 0.15))",
                            color: "var(--accent)",
                            fontWeight: 600,
                          }}
                        >
                          {[form.notes ? "User" : null, form.agent_notes ? "Agent (Read-only)" : null].filter(Boolean).join(" & ")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      User notes (accessible by AI agents) & AI agent memory
                    </div>
                  </div>
                  <div style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
                    {hasNotes.value ? (
                      <LuChevronUp style={{ width: "1.125rem", height: "1.125rem" }} />
                    ) : (
                      <LuChevronDown style={{ width: "1.125rem", height: "1.125rem" }} />
                    )}
                  </div>
                </button>

                {hasNotes.value && (
                  <div
                    style={{
                      padding: "0.75rem 1rem 1rem",
                      borderTop: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.875rem",
                      background: "var(--surface-2)",
                    }}
                  >
                    {/* Box 1: User Notes (Accessible by Agents) */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>User Notes</label>
                        <span style={{ fontSize: "0.6875rem", color: "var(--accent)", fontWeight: 500 }}>
                          ⚡ Accessible by staff & AI agents
                        </span>
                      </div>
                      <textarea
                        value={form.notes}
                        onInput$={(e) => { form.notes = (e.target as HTMLTextAreaElement).value; }}
                        placeholder="Product care instructions, handling rules, storage temperature, or special notes (accessed by AI agents for billing & customer queries)..."
                        rows={3}
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                          minHeight: "4rem",
                          lineHeight: "1.5",
                        }}
                        onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                        onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                      />
                    </div>

                    {/* Box 2: Agent Notes (Read Only) */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                        <label style={{ ...labelStyle, marginBottom: 0, color: "var(--accent)" }}>Agent Notes</label>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                          🤖 Read-only (updated by AI agents)
                        </span>
                      </div>
                      {form.agent_notes ? (
                        <div
                          style={{
                            padding: "0.625rem 0.75rem",
                            borderRadius: "var(--radius-sm, 6px)",
                            backgroundColor: "var(--surface-3, rgba(255,255,255,0.03))",
                            border: "1px solid var(--border)",
                            color: "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            lineHeight: "1.5",
                            minHeight: "3.5rem",
                            maxHeight: "8rem",
                            overflowY: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            cursor: "default",
                            userSelect: "text",
                          }}
                        >
                          {form.agent_notes}
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "0.625rem 0.75rem",
                            borderRadius: "var(--radius-sm, 6px)",
                            backgroundColor: "var(--surface-3, rgba(255,255,255,0.02))",
                            border: "1px dashed var(--border)",
                            color: "var(--text-muted)",
                            fontSize: "0.75rem",
                            fontStyle: "italic",
                            lineHeight: "1.4",
                          }}
                        >
                          No agent operational memory recorded yet. AI agents populate and update this memory automatically during operations.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Audit Info: Created by & Updated by (No Fill) ──── */}
            {isEdit.value && editingItem.value && (() => {
              const item = editingItem.value;
              const creator = (item as any).staff_name || item.creator_name || (item.user_id && item.user_id !== "owner" && !item.user_id.startsWith("usr_") ? item.user_id : "Owner");
              const updater = (item as any).updater_name || item.updater_name || (item.updated_by && item.updated_by !== "owner" && !item.updated_by.startsWith("usr_") ? item.updated_by : creator);

              return (
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "0.75rem",
                    padding: "0.75rem 1rem",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                  }}
                >
                  {/* Col 1: Created by */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Created by
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={creator}>
                      {creator}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                      {fmtAuditDate(item.created_at)}
                    </span>
                  </div>

                  {/* Col 2: Updated by */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Updated by
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={updater}>
                      {updater}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                      {fmtAuditDate(item.updated_at || item.created_at)}
                    </span>
                  </div>
                </div>
              );
            })()}

          </div>

          {/* ── Pinned Save Footer ─────────────────────────────────────────── */}
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
                  Saving…
                </>
              ) : (
                <>
                  <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                  {isEdit.value ? "Save Changes" : "Add Product"}
                </>
              )}
            </button>
          </div>
        </SlideOver>

        {/* Media Picker Modal */}
        <MediaPickerModal
          open={mediaPickerOpen}
          filterType={mediaPickerFilter.value}
          onSelected$={$((media: PickerMediaItem) => {
            if (activeGroupImageKey.value) {
              const gKey = activeGroupImageKey.value;
              const gLower = selectedGroupBy.value.toLowerCase();
              const updated = itemVariants.value.map((v) => {
                let key = "";
                try {
                  const parsed = JSON.parse(v.attributes || "{}");
                  key = parsed[gLower] || parsed[selectedGroupBy.value] || "";
                } catch { /* empty */ }
                if (!key && v.name) key = v.name.split("/")[0]?.trim() || "Default";
                if (key === gKey) {
                  return { ...v, media_id: media.id, media_url: media.url, seo_og_image: media.url };
                }
                return v;
              });
              itemVariants.value = updated;
              activeGroupImageKey.value = null;
            } else if (variantMediaIndex.value !== null) {
              const idx = variantMediaIndex.value;
              const updated = [...itemVariants.value];
              updated[idx] = {
                ...updated[idx],
                media_id: media.id,
                media_url: media.url,
                seo_og_image: media.url,
              };
              itemVariants.value = updated;
              variantMediaIndex.value = null;
            } else if (pickerTarget.value === "main_image") {
              const currentOg = form.seo_og_image;
              const prevUrl = form.media_url;
              const shouldUpdateOg = !currentOg || currentOg === prevUrl;
              form.media_id = media.id;
              form.media_url = media.url;
              if (shouldUpdateOg) form.seo_og_image = media.url;
            } else if (pickerTarget.value === "video") {
              form.video_media_id = media.id;
              if (!form.video_url) form.video_url = media.url;
            }
            mediaPickerOpen.value = false;
          })}
        />

        {/* Media Modal (Upload to R2 / Webflow) */}
        <MediaModal
          open={mediaModalOpen}
          onUploaded$={$((media: any) => {
            if (activeGroupImageKey.value) {
              const gKey = activeGroupImageKey.value;
              const gLower = selectedGroupBy.value.toLowerCase();
              const updated = itemVariants.value.map((v) => {
                let key = "";
                try {
                  const parsed = JSON.parse(v.attributes || "{}");
                  key = parsed[gLower] || parsed[selectedGroupBy.value] || "";
                } catch { /* empty */ }
                if (!key && v.name) key = v.name.split("/")[0]?.trim() || "Default";
                if (key === gKey) {
                  return { ...v, media_id: media.id, media_url: media.url, seo_og_image: media.url };
                }
                return v;
              });
              itemVariants.value = updated;
              activeGroupImageKey.value = null;
            } else if (variantMediaIndex.value !== null) {
              const idx = variantMediaIndex.value;
              const updated = [...itemVariants.value];
              updated[idx] = {
                ...updated[idx],
                media_id: media.id,
                media_url: media.url,
                seo_og_image: media.url,
              };
              itemVariants.value = updated;
              variantMediaIndex.value = null;
            } else if (pickerTarget.value === "main_image") {
              const currentOg = form.seo_og_image;
              const prevUrl = form.media_url;
              const shouldUpdateOg = !currentOg || currentOg === prevUrl;
              form.media_id = media.id;
              form.media_url = media.url;
              if (shouldUpdateOg) form.seo_og_image = media.url;
            } else if (pickerTarget.value === "video") {
              form.video_media_id = media.id;
              if (!form.video_url) form.video_url = media.url;
            }
            mediaModalOpen.value = false;
          })}
        />

        {/* Slider Picker Modal */}
        <SliderPickerModal
          open={sliderPickerOpen}
          selectedSliderId={variantSliderIndex.value !== null ? itemVariants.value[variantSliderIndex.value]?.slider_id : form.slider_id}
          onSelected$={$((slider: PickerSlider) => {
            if (variantSliderIndex.value !== null) {
              const idx = variantSliderIndex.value;
              const updated = [...itemVariants.value];
              updated[idx] = {
                ...updated[idx],
                slider_id: slider.id,
              };
              itemVariants.value = updated;
              variantSliderIndex.value = null;
            } else {
              form.slider_id = slider.id;
              selectedSlider.value = slider;
            }
          })}
          onCreateRequested$={$(() => {
            sliderPickerOpen.value = false;
            sliderModalOpen.value = true;
          })}
        />

        {/* Slider Create / Edit Modal */}
        <SliderModal
          open={sliderModalOpen}
          onSaved$={$((slider: PickerSlider) => {
            form.slider_id = slider.id;
            selectedSlider.value = slider;
          })}
        />

        {/* Parent Product Picker Modal */}
        <ShopProductPickerModal
          open={parentPickerOpen}
          selectedParentId={form.parent_id}
          excludeItemId={editingItem.value?.id}
          systemCategoryId={form.category_id || defaultCategoryId}
          shopCategoryId={form.shop_category_id}
          onSelect$={$((item) => {
            if (item) {
              form.parent_id = item.id;
              parentProductName.value = item.name;
            } else {
              form.parent_id = "";
              parentProductName.value = "";
            }
          })}
        />

        {/* Shopify-style Full Variant Details Drawer Component */}
        <VariantDetails
          open={variantDetailsOpen}
          variant={selectedVariantForDetails.value}
          parentItem={{
            price: parseFloat(form.price) || 0,
            cost_price: parseFloat(form.cost_price) || 0,
            compare_price: parseFloat(form.compare_price) || undefined,
            default_mrp: parseFloat(form.default_mrp) || 0,
            discount_pct: parseFloat(form.discount_pct) || 0,
            extra_discount: parseFloat(form.extra_discount) || 0,
            unit_price: parseFloat(form.unit_price) || 0,
            hsn_sac_code: form.hsn_sac_code || "",
            weight: parseFloat(form.weight) || 0,
            weight_unit: form.weight_unit || "kg",
            length: parseFloat(form.dim_length) || 0,
            width: parseFloat(form.width) || 0,
            height: parseFloat(form.height) || 0,
            dimension_unit: form.dimension_unit || "cm",
            pack_size: form.pack_size || "",
            conversion_factor: parseFloat(form.conversion_factor) || 1,
            scheme_on: parseFloat(form.scheme_on) || 0,
            scheme_free: parseFloat(form.scheme_free) || 0,
            country_of_origin: form.country_of_origin || "",
            track_inventory: form.track_inventory ? 1 : 0,
            tax_rate_id: form.tax_rate_id || "",
            tax_inclusive: form.tax_inclusive ? 1 : 0,
          }}
          currencySymbol={form.currency === "USD" ? "$" : form.currency === "EUR" ? "€" : form.currency === "GBP" ? "£" : "₹"}
          parentTaxRateId={form.tax_rate_id}
          parentTaxInclusive={form.tax_inclusive}
          taxRates={taxRates.value}
          onSave$={$(async (updated: ShopItemVariant) => {
            const updatedList = [...itemVariants.value];
            let idx = variantDetailsIndex.value;
            if (idx === null || idx < 0 || idx >= updatedList.length || (updated.id && updatedList[idx]?.id !== updated.id) || (!updated.id && updatedList[idx]?.name !== updated.name)) {
              idx = updatedList.findIndex((item) => (updated.id && item.id === updated.id) || item.name === updated.name);
            }
            if (idx !== -1 && idx < updatedList.length) {
              updatedList[idx] = updated;
              itemVariants.value = updatedList;
            }
            variantDetailsIndex.value = null;

            // Direct Save: If this product exists in DB, immediately persist the variant changes!
            if (editingItem.value?.id) {
              try {
                if (updated.id) {
                  await invoke("shop_update_variant", {
                    variantId: updated.id,
                    data: {
                      name: updated.name,
                      sku: (updated.sku && updated.sku.trim().length > 0) ? updated.sku.trim() : generateSku(),
                      barcode: updated.barcode || undefined,
                      price: updated.price,
                      price_delta: updated.price_delta,
                      cost_price: updated.cost_price,
                      compare_price: (updated.compare_price && updated.compare_price > 0) ? updated.compare_price : 0,
                      default_mrp: updated.default_mrp,
                      unit_price: updated.unit_price,
                      discount_pct: updated.discount_pct,
                      extra_discount: updated.extra_discount,
                      stock_qty: updated.stock_qty,
                      media_id: updated.media_id || undefined,
                      media_url: updated.media_url || undefined,
                      slider_id: updated.slider_id || undefined,
                      seo_og_image: updated.media_url || updated.seo_og_image || undefined,
                      hsn_sac_code: updated.hsn_sac_code || undefined,
                      weight: updated.weight,
                      weight_unit: updated.weight_unit,
                      length: updated.length,
                      width: updated.width,
                      height: updated.height,
                      dimension_unit: updated.dimension_unit,
                      pack_size: updated.pack_size || undefined,
                      conversion_factor: updated.conversion_factor,
                      scheme_on: updated.scheme_on,
                      scheme_free: updated.scheme_free,
                      country_of_origin: updated.country_of_origin || undefined,
                      allow_backorder: updated.allow_backorder,
                      track_inventory: updated.track_inventory,
                      tax_rate_id: updated.tax_rate_id || undefined,
                      is_taxable: updated.is_taxable,
                      tax_inclusive: updated.tax_inclusive,
                      attributes: typeof updated.attributes === "string" ? updated.attributes : JSON.stringify(updated.attributes),
                      color_hex: updated.color_hex || undefined,
                      is_active: updated.is_active ?? 1,
                      sort_order: updated.sort_order ?? 0,
                      seo_title: updated.seo_title || undefined,
                      seo_description: updated.seo_description || undefined,
                      seo_robots: updated.seo_robots || undefined,
                      seo_block_indexing: updated.seo_block_indexing ?? 0,
                    },
                  });
                } else {
                  const baseSellingPrice = parseFloat(form.price) || 0;
                  const res = await invoke<ShopItemVariant[]>("shop_save_item_variants", {
                    itemId: editingItem.value.id,
                    variants: updatedList.map((v) => ({
                      id: v.id || undefined,
                      item_id: editingItem.value!.id,
                      name: v.name,
                      sku: (v.sku && v.sku.trim().length > 0) ? v.sku.trim() : generateSku(),
                      barcode: v.barcode || undefined,
                      price: (v.price !== undefined && v.price !== null && !isNaN(v.price))
                        ? v.price
                        : ((v.price_delta || 0) !== 0 ? (baseSellingPrice > 0 ? baseSellingPrice + v.price_delta : v.price_delta) : baseSellingPrice),
                      price_delta: (v.price_delta !== undefined && !isNaN(v.price_delta))
                        ? v.price_delta
                        : (baseSellingPrice > 0 ? (v.price || 0) - baseSellingPrice : 0),
                      cost_price: (v.cost_price && v.cost_price > 0) ? v.cost_price : (parseFloat(form.cost_price) || 0),
                      compare_price: (v.compare_price && v.compare_price > 0) ? v.compare_price : 0,
                      default_mrp: (v.default_mrp && v.default_mrp > 0) ? v.default_mrp : (parseFloat(form.default_mrp) || 0),
                      unit_price: (v.unit_price && v.unit_price > 0) ? v.unit_price : (parseFloat(form.unit_price) || 0),
                      discount_pct: (v.discount_pct && v.discount_pct > 0) ? v.discount_pct : (parseFloat(form.discount_pct) || 0),
                      extra_discount: (v.extra_discount && v.extra_discount > 0) ? v.extra_discount : (parseFloat(form.extra_discount) || 0),
                      stock_qty: v.stock_qty || 0,
                      media_id: v.media_id || undefined,
                      media_url: v.media_url || undefined,
                      slider_id: v.slider_id || undefined,
                      seo_og_image: v.media_url || v.seo_og_image || undefined,
                      hsn_sac_code: v.hsn_sac_code || form.hsn_sac_code || undefined,
                      weight: (v.weight || 0) > 0 ? v.weight : (parseFloat(form.weight) || undefined),
                      weight_unit: (v.weight || 0) > 0 ? (v.weight_unit || form.weight_unit || undefined) : (form.weight_unit || undefined),
                      length: v.length || (parseFloat(form.dim_length) || 0),
                      width: v.width || (parseFloat(form.width) || 0),
                      height: v.height || (parseFloat(form.height) || 0),
                      dimension_unit: v.dimension_unit || form.dimension_unit || "cm",
                      pack_size: v.pack_size || (form.pack_size.trim() || undefined),
                      conversion_factor: (v.conversion_factor || 0) > 0 ? v.conversion_factor : (form.conversion_factor ? parseFloat(form.conversion_factor) : 1),
                      scheme_on: (v.scheme_on || 0) > 0 ? v.scheme_on : (form.scheme_on ? parseFloat(form.scheme_on) : 0),
                      scheme_free: (v.scheme_free || 0) > 0 ? v.scheme_free : (form.scheme_free ? parseFloat(form.scheme_free) : 0),
                      country_of_origin: v.country_of_origin || form.country_of_origin || undefined,
                      allow_backorder: v.allow_backorder ?? 0,
                      track_inventory: v.track_inventory ?? (form.track_inventory ? 1 : 0),
                      tax_rate_id: v.tax_rate_id || form.tax_rate_id || undefined,
                      is_taxable: v.is_taxable ?? (form.tax_rate_id ? 1 : 1),
                      tax_inclusive: v.tax_inclusive ?? (form.tax_inclusive ? 1 : 0),
                      color_hex: v.color_hex || undefined,
                      attributes: typeof v.attributes === "string" ? v.attributes : JSON.stringify(v.attributes),
                    })),
                  });
                  if (res && res.length > 0) {
                    itemVariants.value = res;
                  }
                }
              } catch (e) {
                console.error("[AddProductModal] Direct variant save failed:", e);
              }
            }
          })}
        />
      </>
    );
  }
);
