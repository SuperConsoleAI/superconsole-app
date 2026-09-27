import {
  component$,
  useSignal,

  $,
  useComputed$,
  useOnDocument,
} from "@builder.io/qwik";
import { LuGraduationCap } from "@qwikest/icons/lucide";

import { ProductTable } from "~/components/ProductTable";
import { ProductForm, defaultProductFormState } from "~/components/ProductForm";
import { createProduct, updateProduct } from "~/lib/ipc";
import "~/routes/dashboard/c/[category]/category.css";
import { useContext } from "@builder.io/qwik";
import { StoreContext } from "../layout";

export default component$(() => {
  const store = useContext(StoreContext);
  
  const mappedProducts = useComputed$(() => {
    return store.products
      .filter((p: any) => p.product_type === "courses" || p.category_id === "courses")
      .map((r: any) => {
      let parsedTags: any = {};
      try { parsedTags = JSON.parse(r.tags || "{}"); } catch { /* ignore */ }
      return {
        id: r.id,
        title: r.title,
        slug: r.slug || "",
        excerpt: r.excerpt,
        description_html: r.description,
        price_cents: r.price_cents,
        sale_price_cents: r.sale_price_cents,
        hero_image_url: r.hero_image_url,
        cover_video_url: parsedTags.cover_video_url || "",
        button_text: parsedTags.button_text || "Download",
        published: r.published === 1 || r.published === true,
        file_url: parsedTags.file_url || "",
        show_total_sales: parsedTags.show_total_sales || 0,
        unit: parsedTags.unit,
        cta_button: parsedTags.cta_button || "{}",
        additional_details: parsedTags.additional_details || "[]",
        lessons: r.lessons || "[]",
        total_lessons: r.total_lessons || 0,
        total_sales: 0 // placeholder
      };
    });
  });

  const hasProducts = useComputed$(() => mappedProducts.value.length > 0);

  // Form State
  const isModalOpen = useSignal(false);
  const isSaving = useSignal(false);
  const editingId = useSignal<string | null>(null);
  
  const formState = useSignal(defaultProductFormState("courses"));
  const formErrors = useSignal<Record<string, string>>({});
  const feedback = useSignal<{ success?: string; error?: string }>({});
  const descriptionHtml = useSignal("");
  const slugManuallyEdited = useSignal(false);


  const handleCreate = $(() => {
    editingId.value = null;
    formState.value = defaultProductFormState("courses");
    descriptionHtml.value = "";
    slugManuallyEdited.value = false;
    isModalOpen.value = true;
    feedback.value = {};
    formErrors.value = {};
  });

  useOnDocument(
    "open-store-modal",
    $(() => {
      handleCreate();
    })
  );

  const handleEdit = $((id: string) => {
    const p = mappedProducts.value.find((x: any) => x.id === id);
    if (!p) return;

    editingId.value = id;
    formState.value = {
      ...defaultProductFormState("courses"),
      title: p.title,
      slug: p.slug || "",
      excerpt: p.excerpt || "",
      price: typeof p.price_cents === "number" ? (p.price_cents / 100).toFixed(2) : "",
      salePrice: typeof p.sale_price_cents === "number" ? (p.sale_price_cents / 100).toFixed(2) : "",
      coverImageUrl: p.hero_image_url || "",
      coverVideoUrl: p.cover_video_url || "",
      fileUrl: p.file_url || "",
      buttonText: p.button_text || "Download",
      additionalDetails: p.additional_details
        ? (typeof p.additional_details === "string" ? JSON.parse(p.additional_details) : p.additional_details)
        : [],
      showTotalSales: p.show_total_sales === 1 || p.show_total_sales === true,
      unit: p.unit != null ? String(p.unit) : "",
      ctaButtonText: (() => { try { const c = typeof p.cta_button === "string" ? JSON.parse(p.cta_button) : (p.cta_button || {}); return c.text || ""; } catch { return ""; } })(),
      ctaButtonUrl: (() => { try { const c = typeof p.cta_button === "string" ? JSON.parse(p.cta_button) : (p.cta_button || {}); return c.url || ""; } catch { return ""; } })(),
      modules: (() => { try { return p.lessons ? (typeof p.lessons === "string" ? JSON.parse(p.lessons) : p.lessons) : []; } catch { return []; } })(),
    };
    descriptionHtml.value = p.description_html || "";
    isModalOpen.value = true;
    feedback.value = {};
    formErrors.value = {};
  });

  const handleSave = $(async (event: Event) => {
    // eslint-disable-next-line qwik/no-async-prevent-default
    event.preventDefault();
    if (isSaving.value) return;

    const errors: Record<string, string> = {};
    const title = formState.value.title.trim();
    const slug = formState.value.slug.trim();
    const price = formState.value.price.trim();
    if (!title) errors.title = "Title is required.";
    if (!slug) errors.slug = "Slug is required.";
    if (!price) errors.price = "Base price is required.";
    if (!formState.value.fileUrl.trim()) errors.fileUrl = "File URL is required.";

    formErrors.value = errors;
    if (Object.keys(errors).length > 0) {
      feedback.value = { error: "Please fill out the required fields." };
      return;
    }

    isSaving.value = true;
    feedback.value = {};

    const priceFloat = Number.parseFloat(price);
    const salePriceStr = formState.value.salePrice.trim();
    const salePriceFloat = salePriceStr ? Number.parseFloat(salePriceStr) : NaN;

    const extraData = {
      cover_video_url: formState.value.coverVideoUrl.trim() || null,
      file_url: formState.value.fileUrl.trim(),
      button_text: formState.value.buttonText.trim() || "Download",
      additional_details: JSON.stringify(formState.value.additionalDetails.filter(d => d.key.trim() || d.value.trim())),
      show_total_sales: formState.value.showTotalSales ? 1 : 0,
      unit: formState.value.unit ? Number.parseInt(formState.value.unit) : null,
      cta_button: JSON.stringify({ text: formState.value.ctaButtonText.trim(), url: formState.value.ctaButtonUrl.trim() }),
    };

    const pId = store.profile.id;
    const uId = store.profile.user_id;

    const payload = {
      profile_id: pId,
      user_id: uId,
      product_type: "courses",
      title,
      slug,
      excerpt: formState.value.excerpt.trim() || null,
      description: descriptionHtml.value?.trim() || null,
      price_cents: Number.isFinite(priceFloat) ? Math.max(0, Math.round(priceFloat * 100)) : 0,
      sale_price_cents: Number.isFinite(salePriceFloat) ? Math.max(0, Math.round(salePriceFloat * 100)) : null,
      currency: "usd",
      hero_image_url: formState.value.coverImageUrl.trim() || null,
      thumbnail_url: formState.value.coverImageUrl.trim() || null,
      visibility: "published",
      tags: JSON.stringify(extraData),
      lessons: JSON.stringify(formState.value.modules),
      total_lessons: formState.value.modules.reduce((sum, m) => sum + m.lessons.length, 0),
      category_id: null,
      order_index: 0,
      published: true,
      is_featured: false,
    };

    try {
      if (editingId.value) {
        await updateProduct(editingId.value, payload);
      } else {
        await createProduct(payload);
      }

      await store.refresh();

      feedback.value = { success: editingId.value ? "Product updated." : "Product saved." };
      isModalOpen.value = false;
      editingId.value = null;
      formErrors.value = {};
      descriptionHtml.value = "";
      formState.value = defaultProductFormState("courses");
    } catch (err: any) {
      console.error("Failed to save course", err);
      feedback.value = { error: err.message || "Something went wrong. Please retry." };
    } finally {
      isSaving.value = false;
    }
  });

  return (
    <div class="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header handled by global AppTopbar */}

      {store.loading ? (
        <div class="stats-grid" style="margin-bottom:var(--space-lg)">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="stat-card">
              <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px" />
              <div class="skeleton" style="height:32px;width:60px" />
            </div>
          ))}
        </div>
      ) : store.error ? (
        <div class="p-6 bg-red-50 text-red-600 rounded-xl border border-red-200">
          Error loading products: {store.error}
        </div>
      ) : !hasProducts.value && !isModalOpen.value ? (
        <section class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface-2 rounded-2xl border border-divider">
          <div class="w-16 h-16 bg-surface-3 rounded-full flex items-center justify-center mb-6 text-primary">
            <LuGraduationCap class="w-8 h-8" />
          </div>
          <h2 class="text-2xl font-semibold text-primary mb-3">No courses yet</h2>
          <p class="text-secondary max-w-md mb-8">Upload ebooks, templates, presets, or any digital file you want to sell.</p>
          <button type="button" class="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-accent/20" onClick$={handleCreate}>
            Create your first course
          </button>
        </section>
      ) : hasProducts.value ? (
        <>
          <div class="category-stats">
            <div class="stat-card">
              <h3>Total Courses</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_posts || 0)}
              </div>
              <div class="stat-description">in this category</div>
            </div>
            <div class="stat-card">
              <h3>Active Courses</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_published || 0)}
              </div>
              <div class="stat-description">currently visible</div>
            </div>
            <div class="stat-card">
              <h3>Revenue</h3>
              <div class="stat-value">
                ${Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format((store.stats?.total_revenue || 0) / 100)}
              </div>
              <div class="stat-description">total lifetime</div>
            </div>
            <div class="stat-card">
              <h3>Sales</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_sales || 0)}
              </div>
              <div class="stat-description">total lifetime</div>
            </div>
          </div>
          <ProductTable
            products={mappedProducts}
            profileSlug={store.profile?.slug || ""}
            onEdit$={handleEdit}
            onToggleStatus$={async (id, published) => {
              await updateProduct(id, { 
                published: published, 
                visibility: published ? "published" : "draft" 
              });
              await store.refresh();
            }}
            showPrice={true}
            showSales={false}
          >
            <button
              q:slot="headerActions"
              type="button"
              class="btn btn-primary"
              style="height: 32px; padding: 0 1rem; display: flex; align-items: center; white-space: nowrap;"
              onClick$={handleCreate}
            >
              + Add Course
            </button>
          </ProductTable>
        </>
      ) : null}

      <ProductForm
        open={isModalOpen}
        productType="courses"
        isEditing={!!editingId.value}
        isSaving={isSaving}
        formState={formState}
        formErrors={formErrors}
        descriptionHtml={descriptionHtml}
        slugManuallyEdited={slugManuallyEdited}
        errorMessage={feedback.value.error}
        onSave$={handleSave}
        onCancel$={$(() => {
          isModalOpen.value = false;
          feedback.value = {};
          formErrors.value = {};
        })}
      />
    </div>
  );
});
