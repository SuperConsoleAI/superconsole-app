// src/routes/dashboard/shop/brands/index.tsx
//
// Shop › Brands page
// Lists shop_brands with country of origin and active status.
// Add / Edit opens an inline SlideOver panel.
//
// IPC: shop_list_brands, shop_create_brand, shop_update_brand, shop_delete_brand

import {
  component$, useSignal, useVisibleTask$, $,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus, LuPencil, LuTrash2, LuAward, LuLoader, LuImage } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";

interface ShopBrand {
  id: string;
  name: string;
  slug: string;
  country_origin?: string | null;
  media_id?: string | null;
  logo_url?: string | null;
  is_active: number;
}

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

const inputStyle = {
  width: "100%",
  height: "2.375rem",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

export default component$(() => {
  const brands    = useSignal<ShopBrand[]>([]);
  const loading   = useSignal(true);
  const panelOpen = useSignal(false);
  const editing   = useSignal<ShopBrand | null>(null);
  const saving    = useSignal(false);
  const error     = useSignal<string | null>(null);

  // form
  const fName     = useSignal("");
  const fSlug     = useSignal("");
  const fCountry  = useSignal("");
  const fMediaId  = useSignal<string | null>(null);
  const fLogoUrl  = useSignal<string | null>(null);
  const showMediaPicker = useSignal(false);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      brands.value = await invoke<ShopBrand[]>("shop_list_brands", {});
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  const openAdd = $(() => {
    editing.value = null;
    fName.value = ""; fSlug.value = ""; fCountry.value = "";
    fMediaId.value = null; fLogoUrl.value = null;
    error.value = null;
    panelOpen.value = true;
  });

  const openEdit = $((brand: ShopBrand) => {
    editing.value = brand;
    fName.value   = brand.name;
    fSlug.value   = brand.slug;
    fCountry.value = brand.country_origin ?? "";
    fMediaId.value = brand.media_id ?? null;
    fLogoUrl.value = brand.logo_url ?? null;
    error.value   = null;
    panelOpen.value = true;
  });

  const handleSave = $(async () => {
    if (!fName.value.trim()) { error.value = "Brand name is required"; return; }
    saving.value = true; error.value = null;
    try {
      const data = {
        name:           fName.value.trim(),
        slug:           fSlug.value.trim() || fName.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        country_origin: fCountry.value.trim() || null,
        media_id:       fMediaId.value || null,
        logo_url:       fLogoUrl.value || null,
      };
      if (editing.value) {
        const updated = await invoke<ShopBrand>("shop_update_brand", {
          brandId: editing.value.id, data,
        });
        brands.value = brands.value.map(b => b.id === updated.id ? updated : b);
      } else {
        const created = await invoke<ShopBrand>("shop_create_brand", { data });
        brands.value = [...brands.value, created];
      }
      panelOpen.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const handleDelete = $(async (id: string) => {
    if (!window.confirm("Delete this brand? Products with this brand will remain unchanged.")) return;
    try {
      await invoke("shop_delete_brand", { brandId: id });
      brands.value = brands.value.filter(b => b.id !== id);
    } catch (e) {
      alert(String(e));
    }
  });

  return (
    <>
      <SlideOver
        open={panelOpen}
        title={editing.value ? "Edit Brand" : "New Brand"}
        subtitle="Manage product manufacturers and brand names."
        width="420px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error.value && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}
          <div>
            <label style={labelStyle}>Brand Name *</label>
            <input
              type="text"
              placeholder="e.g. Nike, Samsung, Amul"
              value={fName.value}
              onInput$={(e) => {
                fName.value = (e.target as HTMLInputElement).value;
                fSlug.value = fName.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
              }}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>
          <div>
            <label style={labelStyle}>Slug</label>
            <input
              type="text"
              placeholder="auto-generated"
              value={fSlug.value}
              onInput$={(e) => { fSlug.value = (e.target as HTMLInputElement).value; }}
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8125rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>
          <div>
            <label style={labelStyle}>Country of Origin</label>
            <input
              type="text"
              placeholder="e.g. India, Japan, USA"
              value={fCountry.value}
              onInput$={(e) => { fCountry.value = (e.target as HTMLInputElement).value; }}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e)  => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Brand Logo Picker */}
          <div>
            <label style={labelStyle}>Brand Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <div
                style={{
                  width: "4rem",
                  height: "4rem",
                  borderRadius: "0.5rem",
                  background: "var(--surface-3)",
                  border: "1px dashed var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {fLogoUrl.value ? (
                  <img
                    src={fLogoUrl.value}
                    alt="Brand logo"
                    width={64}
                    height={64}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <LuAward style="width:1.75rem;height:1.75rem;color:var(--text-secondary);" />
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <button
                  type="button"
                  onClick$={() => { showMediaPicker.value = true; }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.4rem 0.75rem",
                    background: "var(--field-fill)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: "500",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <LuImage style="width:0.875rem;height:0.875rem;" />
                  {fLogoUrl.value ? "Change Logo" : "Select Logo"}
                </button>
                {fLogoUrl.value && (
                  <button
                    type="button"
                    onClick$={() => { fMediaId.value = null; fLogoUrl.value = null; }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--error)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <LuTrash2 style="width:0.75rem;height:0.75rem;" />
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sticky footer */}
          <div style={{ position: "sticky", bottom: "-1.5rem", margin: "0.5rem -1.5rem -1.5rem", padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              disabled={saving.value}
              onClick$={handleSave}
              style={{
                flex: 1, height: "2.375rem",
                background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
                border: "none", borderRadius: "0.375rem",
                fontSize: "0.9rem", fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              }}
            >
              {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving…</> : "Save Brand"}
            </button>
            <button
              type="button"
              onClick$={() => { panelOpen.value = false; }}
              style={{ height: "2.375rem", padding: "0 1.25rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-secondary)", fontSize: "0.9rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </SlideOver>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={showMediaPicker}
        filterType="image"
        onSelected$={$((media: MediaItem) => {
          fMediaId.value = media.id;
          fLogoUrl.value = media.url || media.local_url || "";
        })}
      />

      {/* ── Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--text-primary)" }}>Brands</h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>Manage brands and manufacturers for your shop catalogue.</p>
        </div>
        <button
          type="button"
          onClick$={openAdd}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1rem", height: "2.25rem", fontSize: "0.875rem", fontWeight: "500", cursor: "pointer" }}
        >
          <LuPlus style="width:1rem;height:1rem;" /> New Brand
        </button>
      </div>

      {loading.value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: "3.25rem", background: "var(--surface-2)", borderRadius: "0.375rem", animation: "pulse 2s infinite", animationDelay: `${(i - 1) * 150}ms` }} />)}
        </div>
      ) : brands.value.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", textAlign: "center", gap: "1rem" }}>
          <div style={{ width: "3.5rem", height: "3.5rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
            <LuAward style="width:1.75rem;height:1.75rem;" />
          </div>
          <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" }}>No brands yet</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Create brand profiles to group products by manufacturer or brand name.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {brands.value.map(brand => (
            <div
              key={brand.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", gap: "0.75rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "0.375rem", background: "var(--surface-3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)", overflow: "hidden", flexShrink: 0 }}>
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={brand.name} width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    brand.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)" }}>{brand.name}</div>
                  <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                    <span style={{ fontFamily: "monospace" }}>{brand.slug}</span>
                    {brand.country_origin && <span>• {brand.country_origin}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <button type="button" onClick$={$(() => openEdit(brand))} style={{ padding: "0.35rem 0.5rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--text-secondary)" }}><LuPencil style="width:0.875rem;height:0.875rem;" /></button>
                <button type="button" onClick$={$(() => handleDelete(brand.id))} style={{ padding: "0.35rem 0.5rem", background: "transparent", border: "1px solid transparent", borderRadius: "0.375rem", cursor: "pointer", display: "flex", color: "var(--error)" }}><LuTrash2 style="width:0.875rem;height:0.875rem;" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
});

export const head: DocumentHead = { title: "Brands — Shop" };
