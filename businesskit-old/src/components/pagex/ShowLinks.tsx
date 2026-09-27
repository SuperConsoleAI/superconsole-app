import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { CategorySections } from "~/components/public/CategorySections";
import type { HomeCategorySection } from "~/lib/types";
import { getProfile, getLinks } from "~/lib/ipc";

export interface ShowLinksProps {
  data: any;
  order: number;
  categorySections?: HomeCategorySection[];
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const ShowLinksSchema = [
  { name: "title", label: "Section Main Title", type: "text" },
  { name: "titleColor", label: "Title Color", type: "text" },
  { name: "description", label: "Section Main Description", type: "textarea" },
  { name: "descriptionColor", label: "Description Color", type: "text" },
  { name: "visibleCategories", label: "Category Visibility & Customization", type: "category_toggles" },
  { name: "bgColor", label: "Section Background Color", type: "text" },
];

export const ShowLinksDefaultData = {
  title: "Resources & Links",
  description: "Browse our active links and categories.",
  visibleCategories: {},
  bgColor: "transparent",
};

export const ShowLinks = component$<ShowLinksProps>(({ data, order, categorySections = [], editable = false }) => {
  const dataObj = typeof data === "object" && data !== null ? data : {};
  const bgColor = dataObj.bgColor || "transparent";
  const titleColor = dataObj.titleColor || "var(--text-primary)";
  const descriptionColor = dataObj.descriptionColor || "var(--text-secondary)";

  // Load real data from IPC if categorySections not passed in
  const realSections = useSignal<HomeCategorySection[]>([]);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    // If parent already passed real categorySections, use those
    if (categorySections && categorySections.length > 0) {
      realSections.value = categorySections;
      return;
    }
    try {
      const [profile, links] = await Promise.all([getProfile(), getLinks()]);

      let enabledSlugs: string[] = ["links"];
      if (profile?.enabled_categories) {
        const parsed = JSON.parse(profile.enabled_categories) as string[];
        enabledSlugs = [...new Set(["links", ...parsed])];
      }

      // Build HomeCategorySection[] from real links grouped by category_slug
      const sectionMap = new Map<string, HomeCategorySection>();

      for (const slug of enabledSlugs) {
        sectionMap.set(slug, {
          category: { id: slug, slug, name: slug },
          heading: slug,
          description: "",
          links: [],
        });
      }

      for (const link of links || []) {
        const slug = link.category_slug || "links";
        const sec = sectionMap.get(slug);
        if (sec) {
          (sec.links as any[]).push(link);
        }
      }

      realSections.value = Array.from(sectionMap.values()).filter(s => (s.links?.length ?? 0) > 0);
    } catch {
      // keep empty
    }
  });

  const visMap: Record<string, { visible: boolean; title?: string; description?: string }> = dataObj.visibleCategories || {};
  const hasToggles = Object.keys(visMap).some((k) => visMap[k]?.visible === true);

  // Source = real loaded sections
  const sourceSections = realSections.value;

  // Filter to only toggled-ON categories
  const filteredSections = hasToggles
    ? sourceSections
        .filter((s) => {
          const slug = s.category?.slug || s.category?.id;
          return slug ? visMap[slug]?.visible === true : false;
        })
        .map((s) => {
          const slug = s.category?.slug || s.category?.id;
          const cfg = visMap[slug || ""];
          if (cfg) return { ...s, heading: cfg.title ?? s.heading, description: cfg.description ?? s.description };
          return s;
        })
    : [];

  return (
    <section class="pagex-show-links-section" style={`display:flex;justify-content:center;width:100%;margin:0 auto;padding:4rem 1.5rem;box-sizing:border-box;background:${bgColor};order:${order};`}>
      <style>{`
        @media (max-width: 768px) {
          .pagex-show-links-section {
            padding: 2.5rem 1rem !important;
          }
          .pagex-show-links-title {
            font-size: 1.75rem !important;
          }
        }
      `}</style>
      <div style="width:100%;max-width:1200px;display:flex;flex-direction:column;gap:2rem;">

        {/* Title & Description */}
        {(dataObj.title || dataObj.description) && (
          <div style="display:flex;flex-direction:column;gap:0.5rem;align-items:flex-start;text-align:left;width:100%;">
            {dataObj.title && (
              <h2
                class="pagex-show-links-title"
                data-field="title"
                contentEditable={editable ? "true" : undefined}
                style={`margin:0;font-size:2.25rem;font-weight:700;color:${titleColor};line-height:1.2;text-align:left;cursor:${editable ? "text" : "default"}`}
              >
                {dataObj.title}
              </h2>
            )}
            {dataObj.description && (
              <p
                data-field="description"
                contentEditable={editable ? "true" : undefined}
                style={`margin:0;font-size:1rem;color:${descriptionColor};line-height:1.6;text-align:left;cursor:${editable ? "text" : "default"}`}
              >
                {dataObj.description}
              </p>
            )}
          </div>
        )}

        {/* Real category link cards filtered by form toggles */}
        <div style="width:100%;text-align:left;">
          {filteredSections.length > 0 ? (
            <CategorySections sections={filteredSections} standalone={true} listGap="1rem" />
          ) : (
            <div style="padding:2.5rem;text-align:center;border:1px dashed var(--border);border-radius:0.75rem;color:var(--text-secondary);background:var(--surface-2);">
              {hasToggles
                ? "No links published yet for the selected categories."
                : "No categories selected. Open section settings to toggle categories ON."}
            </div>
          )}
        </div>

      </div>
    </section>
  );
});
