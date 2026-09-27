import { $, component$, useStylesScoped$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import type { HomeCategorySection } from "~/lib/types";
import { isValidUrl, normalizeUrl } from "~/lib/metadata";
import { trackLinkClick } from "~/lib/analytics-client";
import { resolveCategoryType, renderSpecializedCategoryCard } from "~/components/public/category-renderer";

const { spacing, typography, borderRadius } = designSystem;

const CATEGORY_SECTION_STYLES = `
  .category-section-full-width {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100vw;
    margin-left: calc(50% - 50vw);
    margin-right: calc(50% - 50vw);
    padding: 4rem;
    box-sizing: border-box;
    background: var(--surface-2);
  }

  .category-section-standard {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    margin-bottom: 3rem;
  }

  /* Standalone: big heading styles but no 100vw bleed */
  .category-section-standalone {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    margin-bottom: 3rem;
  }

  .category-section-title {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.2;
    font-weight: 600;
    color: var(--text-primary);
  }

  .category-section-description {
    margin: 0;
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .category-grid--3col {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }

  .category-grid--4col {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }

  .category-grid--5col {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }

  .category-grid--featured {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 1024px) {
    .category-section-full-width {
      padding: 2rem;
    }
    .category-grid--5col {
      grid-template-columns: repeat(4, 1fr);
    }
    .category-grid--4col {
      grid-template-columns: repeat(3, 1fr);
    }
    .category-grid--featured {
      grid-template-columns: repeat(3, 1fr);
    }
    .category-grid--3col {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .category-section-full-width {
      padding: 1.5rem 1rem;
    }
    /* 3 column layouts -> 1 column on mobile (3 = 1) */
    .category-grid--3col {
      grid-template-columns: 1fr;
    }
    /* featured layout -> 1 column on mobile */
    .category-grid--featured {
      grid-template-columns: 1fr;
    }
    /* 4 and 5 column layouts -> 2 columns on mobile (4/5 = 2) */
    .category-grid--4col {
      grid-template-columns: repeat(2, 1fr);
    }
    .category-grid--5col {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 480px) {
    .category-grid--3col {
      grid-template-columns: 1fr;
    }
    .category-grid--featured {
      grid-template-columns: 1fr;
    }
    .category-grid--4col {
      grid-template-columns: repeat(2, 1fr);
    }
    .category-grid--5col {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;

const noopNavigate = $(() => {});

const normalizeHref = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = normalizeUrl(value);
  return isValidUrl(normalized) ? normalized : null;
};

interface CategorySectionsProps {
  sections: HomeCategorySection[];
  fullWidth?: boolean;
  standalone?: boolean;
  sectionBackground?: string;
  centerHeader?: boolean;
  listGap?: string;
}

export const CategorySections = component$<CategorySectionsProps>(({ sections, fullWidth = false, standalone = false, sectionBackground = "var(--surface-2)", centerHeader = false, listGap = "0" }) => {
  useStylesScoped$(CATEGORY_SECTION_STYLES);
  const homeSectionStyle = `display: flex; flex-direction: column; gap: ${spacing.sm}; width: 100%;`;
  const homeSectionHeaderStyle = `display: flex; flex-direction: column; gap: ${spacing.xs};`;
  // standalone = big heading styles (like fullWidth) but no 100vw bleed
  const useFullStyles = fullWidth || standalone;
  const homeHeadingStyle = useFullStyles
    ? ""
    : `font-size: 1.25rem; font-weight: ${typography.weights.semibold}; margin: 0; color: var(--text-secondary);`;
  const homeDescriptionStyle = useFullStyles ? "" : `font-size: ${typography.sizes.sm}; color: var(--text-secondary); margin: 0;`;
  const homeEmptyStyle = `border: 1px dashed var(--border); border-radius: ${borderRadius.md}; padding: ${spacing.lg}; text-align: center; color: var(--text-secondary); background-color: var(--surface-2);`;

  return (
    <>
      {sections.map((section) => {
        const categoryIdentifier = section.category.slug ?? section.category.name ?? "";
        const sectionCategoryType = resolveCategoryType(categoryIdentifier);
        const links = section.links || [];

        const sectionClass = fullWidth
          ? "category-section-full-width"
          : standalone
            ? "category-section-standalone"
            : "category-section-standard";
        const sectionInlineStyle = fullWidth ? `background: ${sectionBackground};` : standalone ? "" : homeSectionStyle;

        const gridClass =
          sectionCategoryType === "books" || sectionCategoryType === "gallery" || sectionCategoryType === "portfolio"
            ? "category-grid--5col"
            : sectionCategoryType === "courses" || sectionCategoryType === "links" || sectionCategoryType === "startups"
              ? "category-grid--3col"
              : sectionCategoryType === "featured" || sectionCategoryType === "features"
                ? "category-grid--featured"
                : "category-grid--4col";

        return (
          <section key={section.category.id} class={sectionClass} style={sectionInlineStyle}>
            {section.heading && (
              <div style={centerHeader ? `${homeSectionHeaderStyle}; align-items: center; text-align: center;` : homeSectionHeaderStyle}>
                <h2 class={useFullStyles ? "category-section-title" : undefined} style={homeHeadingStyle}>{section.heading}</h2>
                {section.description && <p class={useFullStyles ? "category-section-description" : undefined} style={homeDescriptionStyle}>{section.description}</p>}
              </div>
            )}
            <div style={section.heading || section.description ? `margin-top: ${listGap};` : undefined}>
            {links.length === 0 ? (
              <div style={homeEmptyStyle}>No links published yet.</div>
            ) : sectionCategoryType === "faqs" ? (
              <div style="width: 100%; display: block;">
                {links.map((link: any, index: number) => {
                  const specializedCard = renderSpecializedCategoryCard(sectionCategoryType, {
                    key: link.id ?? `faq-${index}`,
                    link,
                    href: "#",
                    imageUrl: null,
                    index,
                  });
                  return specializedCard;
                })}
              </div>
            ) : (
              <div class={gridClass}>
                {links.map((link: any, index: number) => {
                  const href = normalizeHref(link.url) ?? "#";
                  const isExternal = href.startsWith("http");
                  const resolvedHref = isExternal ? href : `/l/${link.id ?? ""}`;
                  const imageUrl = link.image_url ? normalizeHref(link.image_url) : null;
                  const logoUrl = link.logo_url ? normalizeHref(link.logo_url) : null;
                  const platformName = link.platform_name ?? null;
                  const postUrls = link.post_url ?? null;
                  const navigate$ = isExternal
                    ? $(() =>
                        trackLinkClick({
                          linkId: typeof link.id === "string" ? link.id : null,
                          categorySlug: section.category.slug,
                          targetUrl: href,
                        }),
                      )
                    : noopNavigate;
                  const cardKey = link.id ?? `${resolvedHref}-${index}`;

                  const specializedCard = renderSpecializedCategoryCard(sectionCategoryType, {
                    key: cardKey,
                    link,
                    href: resolvedHref,
                    imageUrl,
                    logoUrl,
                    platformName,
                    postUrls,
                    onNavigate$: navigate$ === noopNavigate ? undefined : navigate$,
                    index,
                  });

                  return specializedCard ?? null;
                })}
              </div>
            )}
            </div>
          </section>
        );
      })}
    </>
  );
});
