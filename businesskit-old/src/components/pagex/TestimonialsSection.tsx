import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import { TestimonialsCard } from "~/components/public/cards/TestimonialsCard";

const { spacing } = designSystem;

export interface TestimonialsSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const TestimonialsSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'embedCode', label: 'Wall of Love (Embed)', type: 'text' },
  { name: 'cardBgColor', label: 'Card Background (all)', type: 'text' },
  { name: 'nameColor', label: 'Name Color (all)', type: 'text' },
  { name: 'roleColor', label: 'Role Color (all)', type: 'text' },
  { name: 'quoteColor', label: 'Quote Color (all)', type: 'text' },
  { name: 'iconColor', label: 'Platform Icon Color (all)', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
  {
    name: 'items',
    label: 'Testimonial Cards',
    type: 'array',
    fields: [
      { name: 'name', label: 'Name', type: 'text' },
      { name: 'role', label: 'Role/Company', type: 'text' },
      {
        name: 'platform',
        label: 'Platform',
        type: 'select',
        options: ['twitter', 'x', 'linkedin', 'instagram', 'youtube', 'facebook', 'github', 'tiktok', 'pinterest', 'google', 'website']
      },
      { name: 'url', label: 'Platform Link / URL', type: 'text' },
      { name: 'quote', label: 'Quote', type: 'textarea' },
      { name: 'avatar_url', label: 'Avatar URL', type: 'text' },
      { name: 'rating', label: 'Rating (0-5)', type: 'text' },
      { name: 'mediaUrl', label: 'Media URL (Image/Video)', type: 'text' },
      { name: 'embedCode', label: 'Embed Code', type: 'text' }
    ]
  }
];

export const TestimonialsSectionDefaultData = {
  title: "What people are saying",
  description: "Don't just take our word for it.",
  items: [
    { name: "Alice", role: "Creator", platform: "twitter", url: "https://twitter.com", quote: "This changed my life!", rating: 5 }
  ]
};

export const TestimonialsSection = component$<TestimonialsSectionProps>(({ data, order, editable = false }) => {
  const testimonialsSectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;

  return (
    <section class="page-testimonials-section" style={`${testimonialsSectionStyle} order: ${order};`}>
      <style>{`
        .page-testimonials-grid {
          column-count: 3;
          column-gap: ${spacing.md};
          width: 100%;
          text-align: left;
          margin-top: 2rem;
        }
        @media (max-width: 1024px) {
          .page-testimonials-grid {
            column-count: 2 !important;
          }
        }
        @media (max-width: 768px) {
          .page-testimonials-section {
            padding: 2.5rem 1rem !important;
          }
          .page-testimonials-title {
            font-size: 1.85rem !important;
          }
          .page-testimonials-grid {
            column-count: 1 !important;
          }
        }
      `}</style>
      <div style={`width: 100%; max-width: 77.5rem; display: flex; flex-direction: column; gap: ${spacing.md}; align-items: center; text-align: center;`}>
        {(data.title || data.description || editable) && (
          <div style={`display: flex; flex-direction: column; gap: 0.5rem; align-items: center; text-align: center;`}>
            {(data.title || editable) && (
              <h2
                class="page-testimonials-title"
                data-field="title"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 2.5rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.title || "What people are saying"}
              </h2>
            )}
            {(data.description || editable) && (
              <p
                data-field="description"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-secondary)"
                style={`margin: 0; font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-secondary)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.description || "Description"}
              </p>
            )}
          </div>
        )}
        {data.embedCode && <div dangerouslySetInnerHTML={data.embedCode} />}
        <div class="page-testimonials-grid">
          {((Array.isArray(data.items) && data.items.length > 0) ? data.items : (editable ? TestimonialsSectionDefaultData.items : [])).map((item: any, index: number) => (
            <div key={`testimonial-${index}`} class="page-testimonials-item" style={`break-inside: avoid; margin-bottom: ${spacing.md};`}>
              <TestimonialsCard
                name={item.name}
                role={item.role}
                platform={(item as any).platform}
                linkUrl={(item as any).url || (item as any).linkUrl}
                quote={item.quote}
                avatarUrl={(item as any).avatar_url}
                rating={Number(item.rating) || 5}
                mediaUrl={(item as any).mediaUrl}
                embedCode={(item as any).embedCode}
                editableKeyPrefix={editable ? `items.${index}` : undefined}
                editable={editable}
                itemData={item}
                sectionData={data}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});
