import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

export interface FeaturedSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const FeaturedSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'description', label: 'Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
  { 
    name: 'items', 
    label: 'Trusted By Logos', 
    type: 'array', 
    fields: [
      { name: 'imageUrl', label: 'Image URL', type: 'text' },
      { name: 'link', label: 'Link URL (Optional)', type: 'text' }
    ]
  }
];

export const FeaturedSectionDefaultData = {
  title: "Trusted By",
  description: "Short highlights of what you get over 4 weeks.",
  items: [
    { imageUrl: "https://placehold.co/120x40?text=Logo+1", link: "#" },
    { imageUrl: "https://placehold.co/120x40?text=Logo+2", link: "#" },
    { imageUrl: "https://placehold.co/120x40?text=Logo+3", link: "#" },
  ]
};

export const FeaturedSection = component$<FeaturedSectionProps>(({ data, order, editable = false }) => {
  const trustedBySectionStyle = `display: flex; flex-direction: column; gap: ${spacing.sm}; width: 100%; margin: 0 auto; padding: 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-3)'};`;
  const sectionHeaderStyle = `display: flex; flex-direction: column; gap: ${spacing.xs};`;
  const trustedByScrollerStyle = `display: flex; gap: 2rem; overflow-x: auto; padding: 0.5rem 0.25rem; scrollbar-width: none;`;
  const trustedByScrollerStaticStyle = `display: flex; justify-content: center; flex-wrap: wrap; gap: 2rem; width: 100%;`;
  const trustedByMarqueeStyle = `display: flex; gap: 2rem; width: max-content; animation: trustedByScroll 28s linear infinite;`;
  const trustedByItemStyle = `display: flex; align-items: center; justify-content: center; flex: 0 0 auto;`;
  const trustedByItems = (Array.isArray(data.items) && data.items.length > 0) ? data.items : (editable ? FeaturedSectionDefaultData.items : []);
  const useTrustedByAutoScroll = trustedByItems.length > 6 && !editable;

  const renderItem = (item: any, index: number, keyPrefix: string) => {
    const Tag = editable ? "div" : "a";
    const props = editable ? {} : { href: item.link ?? "#" };
    return (
      <Tag
        key={`${keyPrefix}-${index}`}
        {...props}
        style={`text-decoration: none; color: inherit; ${trustedByItemStyle}`}
      >
        {(item.imageUrl || editable) && (
          <img
            data-field={`items.${index}.imageUrl`}
            data-element-type="image"
            data-link-field={`items.${index}.link`}
            src={item.imageUrl || "https://placehold.co/120x40?text=Logo"}
            alt="Trusted"
            width={120}
            height={40}
            style={`width: auto; height: auto; max-height: 3rem; object-fit: contain; cursor: ${editable ? 'pointer' : 'default'}`}
          />
        )}
      </Tag>
    );
  };

  return (
    <section style={`${trustedBySectionStyle} order: ${order};`}>
      {useTrustedByAutoScroll && (
        <style>{`@keyframes trustedByScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      )}
      {(data.title || data.description || editable) && (
        <div style={`${sectionHeaderStyle} text-align: center; align-items: center;`}>
          {(data.title || editable) && (
            <h2
              data-field="title"
              contentEditable={editable ? "true" : undefined}
              data-default-color="var(--text-primary)"
              style={`font-size: 1rem; font-weight: ${data.titleWeight || '500'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; margin: 0; cursor: ${editable ? 'text' : 'default'}`}
            >
              {data.title || "Trusted By"}
            </h2>
          )}
          {(data.description || editable) && (
            <p
              data-field="description"
              contentEditable={editable ? "true" : undefined}
              data-default-color="var(--text-secondary)"
              style={`font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-secondary)'}; background: ${data.descriptionHighlight || 'transparent'}; margin: 0; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
            >
              {data.description || "Description"}
            </p>
          )}
        </div>
      )}
      {(trustedByItems.length > 0 || editable) && (
        <div style={trustedByScrollerStyle}>
          {useTrustedByAutoScroll ? (
            <div style={trustedByMarqueeStyle}>
              {[...trustedByItems, ...trustedByItems].map((item: any, index: number) => renderItem(item, index, "featured-scroll"))}
            </div>
          ) : (
            <div style={trustedByScrollerStaticStyle}>
              {(trustedByItems.length > 0 ? trustedByItems : [{ imageUrl: "", link: "" }]).map((item: any, index: number) => renderItem(item, index, "featured-static"))}
            </div>
          )}
        </div>
      )}
    </section>
  );
});
