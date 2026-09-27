import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import type { PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import { SlideOver } from "~/components/SlideOver";

const { spacing, borderRadius, typography } = designSystem;

export interface AvailableComponentInfo {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  collection: string | null;
}

interface SectionPickerModalProps {
  isOpen: boolean;
  availableCustomComponents?: AvailableComponentInfo[];
  onClose$: PropFunction<() => void>;
  onSelect$: PropFunction<(sectionKey: string, customComponentId?: string) => void>;
}

const NATIVE_SECTIONS_BY_CATEGORY = [
  {
    category: "Hero",
    items: [
      { key: "hero_section", name: "Hero Header", description: "Large text with logo and background media" },
      { key: "hero_slider", name: "Hero Slider", description: "Carousel of full-screen images, text centred" },
      { key: "hero_slider_2", name: "Hero Slider (Left Text)", description: "Carousel with left-aligned text overlay" },
      { key: "intro", name: "Intro Profile", description: "Bio and profile picture" },
    ]
  },
  {
    category: "Content",
    items: [
      { key: "text", name: "Text Block (Centred)", description: "Centred paragraph and rich text" },
      { key: "text_left", name: "Text Block (Left Aligned)", description: "Left-aligned paragraph and rich text" },
      { key: "show_links", name: "Show Links / Categories", description: "Display active links for all or selected category (Left Aligned)" },
      { key: "show_links_centred", name: "Show Links / Categories (Centred)", description: "Display links with centred title, description, and list headers" },
      { key: "about_section", name: "About", description: "Detailed rich-text about section" },
      { key: "curriculum", name: "Curriculum", description: "Course modules and lessons" },
    ]
  },
  {
    category: "Conversion",
    items: [
      { key: "pricing", name: "Pricing", description: "Pricing plans and features" },
      { key: "cta_section", name: "Call to Action", description: "Highlight a single button or link" },
      { key: "featured", name: "Featured Links", description: "Grid of featured image links" },
    ]
  },
  {
    category: "Social Proof",
    items: [
      { key: "testimonials", name: "Testimonials", description: "Social proof quotes and reviews" },
      { key: "people_section", name: "People", description: "Team members or speakers" },
    ]
  },
  {
    category: "Misc",
    items: [
      { key: "faq", name: "FAQ", description: "Frequently asked questions" },
    ]
  }
];

const MiniSectionPreview = component$<{ sectionKey: string }>(({ sectionKey }) => {
  switch (sectionKey) {
    case "hero_section":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "8px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "var(--button-primary-bg)", opacity: 0.85 }} />
          <div style={{ width: "38px", height: "5px", borderRadius: "3px", background: "var(--surface-1)" }} />
          <div style={{ width: "65px", height: "6px", borderRadius: "3px", background: "var(--text-primary)", opacity: 0.85 }} />
          <div style={{ width: "45px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.6 }} />
          <div style={{ width: "85%", height: "24px", borderRadius: "4px", background: "var(--surface-1)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "0", height: "0", borderTop: "3px solid transparent", borderBottom: "3px solid transparent", borderLeft: "5px solid var(--text-secondary)" }} />
          </div>
        </div>
      );

    case "hero_slider":
      return (
        <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "8px", boxSizing: "border-box", background: "linear-gradient(135deg, rgba(30,30,45,0.95), rgba(50,50,75,0.85))" }}>
          <div style={{ width: "70px", height: "7px", borderRadius: "3px", background: "#FFFFFF", opacity: 0.95 }} />
          <div style={{ width: "50px", height: "4px", borderRadius: "2px", background: "#FFFFFF", opacity: 0.7 }} />
          <div style={{ width: "36px", height: "10px", borderRadius: "3px", background: "var(--button-primary-bg)", marginTop: "2px" }} />
          <div style={{ position: "absolute", bottom: "5px", display: "flex", gap: "3px" }}>
            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--button-primary-bg)" }} />
            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />
            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />
          </div>
        </div>
      );

    case "hero_slider_2":
      return (
        <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "4px", padding: "10px 14px", boxSizing: "border-box", background: "linear-gradient(135deg, rgba(20,20,30,0.95), rgba(40,40,60,0.85))" }}>
          <div style={{ width: "60px", height: "7px", borderRadius: "3px", background: "#FFFFFF", opacity: 0.95 }} />
          <div style={{ width: "44px", height: "4px", borderRadius: "2px", background: "#FFFFFF", opacity: 0.7 }} />
          <div style={{ width: "32px", height: "10px", borderRadius: "3px", background: "var(--button-primary-bg)", marginTop: "2px" }} />
          <div style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "12px", height: "12px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: "7px" }}>›</div>
        </div>
      );

    case "intro":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--surface-1)", border: "1.5px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: "var(--text-secondary)", opacity: 0.5 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1 }}>
            <div style={{ width: "55px", height: "6px", borderRadius: "3px", background: "var(--text-primary)", opacity: 0.9 }} />
            <div style={{ width: "75px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.6 }} />
            <div style={{ display: "flex", gap: "3px", marginTop: "2px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "var(--button-primary-bg)", opacity: 0.7 }} />
              <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "var(--button-primary-bg)", opacity: 0.7 }} />
              <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "var(--button-primary-bg)", opacity: 0.7 }} />
            </div>
          </div>
        </div>
      );

    case "text":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "8px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "65px", height: "6px", borderRadius: "3px", background: "var(--text-primary)", opacity: 0.9 }} />
          <div style={{ width: "90px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.6 }} />
          <div style={{ width: "80px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.6 }} />
          <div style={{ width: "55px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.4 }} />
        </div>
      );

    case "text_left":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "4px", padding: "8px 12px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "55px", height: "7px", borderRadius: "3px", background: "var(--text-primary)", opacity: 0.9 }} />
          <div style={{ width: "100px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.6 }} />
          <div style={{ width: "85px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.6 }} />
          <div style={{ width: "70px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.4 }} />
        </div>
      );

    case "show_links":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "5px", padding: "8px 10px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "50px", height: "5px", borderRadius: "2px", background: "var(--text-primary)", opacity: 0.9 }} />
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: "40px", borderRadius: "3px", background: "var(--surface-1)", border: "1px solid var(--border)", padding: "2px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ width: "100%", height: "18px", borderRadius: "2px", background: "var(--surface-2)" }} />
                <div style={{ width: "70%", height: "3px", borderRadius: "1px", background: "var(--text-primary)", opacity: 0.7 }} />
                <div style={{ width: "50%", height: "2px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.5 }} />
              </div>
            ))}
          </div>
        </div>
      );

    case "show_links_centred":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px 10px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "50px", height: "5px", borderRadius: "2px", background: "var(--text-primary)", opacity: 0.9 }} />
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: "40px", borderRadius: "3px", background: "var(--surface-1)", border: "1px solid var(--border)", padding: "2px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <div style={{ width: "100%", height: "18px", borderRadius: "2px", background: "var(--surface-2)" }} />
                <div style={{ width: "70%", height: "3px", borderRadius: "1px", background: "var(--text-primary)", opacity: 0.7 }} />
                <div style={{ width: "50%", height: "2px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.5 }} />
              </div>
            ))}
          </div>
        </div>
      );

    case "about_section":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1 }}>
            <div style={{ width: "45px", height: "6px", borderRadius: "3px", background: "var(--text-primary)", opacity: 0.9 }} />
            <div style={{ width: "100%", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.6 }} />
            <div style={{ width: "85%", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.6 }} />
            <div style={{ width: "65%", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.4 }} />
          </div>
          <div style={{ width: "42px", height: "48px", borderRadius: "4px", background: "var(--surface-1)", border: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "16px", height: "16px", borderRadius: "2px", background: "var(--surface-2)" }} />
          </div>
        </div>
      );

    case "curriculum":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "3px", padding: "8px 10px", boxSizing: "border-box", background: "var(--surface-3)", justifyContent: "center" }}>
          <div style={{ width: "50px", height: "5px", borderRadius: "2px", background: "var(--text-primary)", opacity: 0.9, marginBottom: "2px" }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ width: "100%", height: "13px", borderRadius: "3px", background: "var(--surface-1)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 5px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--button-primary-bg)" }} />
                <div style={{ width: "35px", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.8 }} />
              </div>
              <div style={{ width: "5px", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.4 }} />
            </div>
          ))}
        </div>
      );

    case "pricing":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "6px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          {[1, 2, 3].map((i) => {
            const isFeatured = i === 2;
            return (
              <div key={i} style={{ flex: 1, height: isFeatured ? "58px" : "50px", borderRadius: "3px", background: isFeatured ? "var(--surface-1)" : "var(--surface-2)", border: isFeatured ? "1.5px solid var(--button-primary-bg)" : "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", padding: "2px" }}>
                <div style={{ width: "20px", height: "3px", borderRadius: "1px", background: "var(--text-primary)", opacity: 0.85 }} />
                <div style={{ width: "16px", height: "5px", borderRadius: "2px", background: isFeatured ? "var(--button-primary-bg)" : "var(--text-primary)" }} />
                <div style={{ width: "80%", height: "6px", borderRadius: "2px", background: isFeatured ? "var(--button-primary-bg)" : "var(--border)", marginTop: "1px" }} />
              </div>
            );
          })}
        </div>
      );

    case "cta_section":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "70px", height: "6px", borderRadius: "3px", background: "var(--text-primary)", opacity: 0.95 }} />
          <div style={{ width: "90px", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.6 }} />
          <div style={{ width: "45px", height: "12px", borderRadius: "3px", background: "var(--button-primary-bg)", marginTop: "2px" }} />
        </div>
      );

    case "featured":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          <div style={{ width: "45px", height: "4px", borderRadius: "2px", background: "var(--text-secondary)", opacity: 0.7 }} />
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ width: "20px", height: "12px", borderRadius: "2px", background: "var(--surface-1)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "10px", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.5 }} />
              </div>
            ))}
          </div>
        </div>
      );

    case "testimonials":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "6px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: "54px", borderRadius: "3px", background: "var(--surface-1)", border: "1px solid var(--border)", padding: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--button-primary-bg)", opacity: 0.7 }} />
                <div style={{ width: "26px", height: "3px", borderRadius: "1px", background: "var(--text-primary)", opacity: 0.8 }} />
              </div>
              <div style={{ width: "100%", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.5 }} />
              <div style={{ width: "75%", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.5 }} />
              <div style={{ width: "20px", height: "3px", borderRadius: "1px", background: "#EAB308", opacity: 0.9, marginTop: "1px" }} />
            </div>
          ))}
        </div>
      );

    case "people_section":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "6px", boxSizing: "border-box", background: "var(--surface-3)" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ flex: 1, height: "58px", borderRadius: "3px", background: "var(--surface-1)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ width: "100%", height: "28px", background: "var(--surface-2)" }} />
              <div style={{ padding: "2px 3px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ width: "65%", height: "3px", borderRadius: "1px", background: "var(--text-primary)", opacity: 0.85 }} />
                <div style={{ width: "45%", height: "2px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.5 }} />
              </div>
            </div>
          ))}
        </div>
      );

    case "faq":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "3px", padding: "8px 10px", boxSizing: "border-box", background: "var(--surface-3)", justifyContent: "center" }}>
          <div style={{ width: "30px", height: "5px", borderRadius: "2px", background: "var(--text-primary)", opacity: 0.9, marginBottom: "2px" }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ width: "100%", height: "12px", borderRadius: "3px", background: "var(--surface-1)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 5px" }}>
              <div style={{ width: "55px", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.8 }} />
              <div style={{ width: "4px", height: "4px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.4 }}>+</div>
            </div>
          ))}
        </div>
      );

    default:
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--surface-3)" }}>
          <div style={{ width: "40px", height: "5px", borderRadius: "2px", background: "var(--text-primary)", opacity: 0.7 }} />
          <div style={{ width: "60px", height: "3px", borderRadius: "1px", background: "var(--text-secondary)", opacity: 0.4 }} />
        </div>
      );
  }
});

export const SectionPickerModal = component$<SectionPickerModalProps>(({ isOpen, onClose$, onSelect$, availableCustomComponents = [] }) => {
  const activeTab = useSignal(NATIVE_SECTIONS_BY_CATEGORY[0].category);
  const searchQuery = useSignal("");
  const localOpen = useSignal(isOpen);
  useTask$(({ track }) => {
    const propOpen = track(() => isOpen);
    localOpen.value = propOpen;
  });

  // Merge native and custom components
  const mergedCategories: { category: string; items: { key: string; name: string; description: string; customId?: string; thumbnailUrl?: string }[] }[] = JSON.parse(JSON.stringify(NATIVE_SECTIONS_BY_CATEGORY));

  availableCustomComponents.forEach((comp) => {
    const colName = comp.collection || "Custom";
    let cat = mergedCategories.find((c) => c.category.toLowerCase() === colName.toLowerCase());
    if (!cat) {
      cat = { category: colName, items: [] };
      mergedCategories.push(cat);
    }
    cat.items.push({
      key: "custom",
      customId: comp.id,
      name: comp.name,
      description: "Custom AI generated component",
      thumbnailUrl: comp.thumbnailUrl || undefined,
    });
  });

  const activeCategory = mergedCategories.find(c => c.category === activeTab.value) || mergedCategories[0];
  
  const displayItems = searchQuery.value.trim() !== "" 
    ? mergedCategories.flatMap(c => c.items).filter(item => 
        item.name.toLowerCase().includes(searchQuery.value.toLowerCase()) || 
        item.description.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
    : activeCategory.items;

  return (
    <SlideOver
      open={localOpen}
      title="Add Section"
      width="600px"
      onClose$={onClose$}
    >
      <div q:slot="header-tabs" style={{ flex: 1, margin: "0 1rem", maxWidth: "250px" }}>
        <input 
          type="text" 
          placeholder="Search sections..." 
          bind:value={searchQuery}
          style={{ 
            width: "100%", 
            padding: spacing.sm, 
            borderRadius: borderRadius.md, 
            border: "1px solid var(--border)", 
            background: "var(--surface-2)", 
            color: "var(--text-primary)",
            fontSize: typography.sizes.sm,
            outline: "none"
          }} 
        />
      </div>

      <div style={{ display: "flex", flex: 1, flexDirection: "column", margin: "-1.5rem" }}>
        <style>{`
          .section-picker-layout {
            display: flex;
            flex: 1;
            min-height: 0;
          }
          .section-picker-sidebar {
            width: 200px;
            background: var(--surface-2);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            flex-shrink: 0;
          }
          .section-picker-tab-btn {
            padding: ${spacing.sm} ${spacing.md};
            text-align: left;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .section-picker-grid-container {
            flex: 1;
            padding: ${spacing.lg};
            overflow-y: auto;
            background: var(--surface-1);
          }
          .section-picker-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${spacing.md};
          }

          @media (max-width: 768px) {
            .section-picker-layout {
              flex-direction: column !important;
            }
            .section-picker-sidebar {
              width: 100% !important;
              flex-direction: row !important;
              overflow-x: auto !important;
              border-right: none !important;
              border-bottom: 1px solid var(--border) !important;
              padding: 0 0.5rem !important;
              gap: 0 !important;
              white-space: nowrap !important;
              scrollbar-width: none !important;
            }
            .section-picker-tab-btn {
              padding: 0.625rem 0.875rem !important;
              border-radius: 0 !important;
              border-left: none !important;
              border-top: none !important;
              border-right: none !important;
              border-bottom: 2px solid transparent !important;
              margin-bottom: -1px !important;
              font-size: ${typography.sizes.xs} !important;
              gap: 0.35rem !important;
              flex-shrink: 0 !important;
            }
            .section-picker-tab-btn.active {
              border-bottom: 2px solid var(--button-primary-bg) !important;
            }
            .section-picker-grid-container {
              padding: 0.875rem !important;
            }
            .section-picker-grid {
              grid-template-columns: 1fr !important;
              gap: 0.75rem !important;
            }
          }
        `}</style>

        {/* Main Content Area: Sidebar + Grid */}
        <div class="section-picker-layout">
          
          {/* Sidebar Tabs */}
          <div class="section-picker-sidebar">
            {mergedCategories.map(cat => {
              const isActive = activeTab.value === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick$={() => activeTab.value = cat.category}
                  class={`section-picker-tab-btn ${isActive ? 'active' : ''}`}
                  style={{
                    background: isActive ? "var(--surface-1)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--button-primary-bg)" : "3px solid transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: typography.sizes.sm,
                  }}
                >
                  <span>{cat.category}</span>
                  <span style={{ 
                    fontSize: typography.sizes.xs, 
                    background: "var(--surface-3)", 
                    padding: "2px 6px", 
                    borderRadius: borderRadius.pill 
                  }}>
                    {cat.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Grid Area */}
          <div class="section-picker-grid-container">
            <div class="section-picker-grid">
              {displayItems.length > 0 ? displayItems.map(item => (
                <div
                  key={item.key + (item.customId || "")}
                  onClick$={() => {
                    onSelect$(item.key, item.customId);
                    onClose$();
                  }}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: borderRadius.md,
                    cursor: "pointer",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter$={(e: any) => {
                    e.target.style.borderColor = "var(--button-primary-bg)";
                    e.target.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave$={(e: any) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.transform = "none";
                  }}
                >
                  {/* Thumbnail / Mini Live Preview */}
                  <div style={{
                    width: "100%",
                    height: "90px",
                    background: "var(--surface-3)",
                    borderBottom: "1px solid var(--border)",
                    overflow: "hidden",
                    position: "relative",
                  }}>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} width="400" height="100" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <MiniSectionPreview sectionKey={item.key} />
                    )}
                  </div>
                  
                  {/* Info */}
                  <div style={{ padding: spacing.sm }}>
                    <h4 style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, fontWeight: 600, color: "var(--text-primary)" }}>
                      {item.name}
                    </h4>
                    <p style={{ margin: 0, fontSize: typography.sizes.xs, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {item.description}
                    </p>
                  </div>
                </div>
              )) : (
                <div style={{ gridColumn: "1 / -1", padding: spacing.xl, textAlign: "center", color: "var(--text-secondary)" }}>
                  No sections found matching "{searchQuery.value}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SlideOver>
  );
});
