import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import FaqsCard from "~/components/public/cards/FaqsCard";

const { spacing } = designSystem;

export interface FaqSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const FaqSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
  {
    name: 'items',
    label: 'FAQ Items',
    type: 'array',
    fields: [
      { name: 'question', label: 'Question', type: 'text' },
      { name: 'questionColor', label: 'Question Color', type: 'text' },
      { name: 'answer', label: 'Answer', type: 'textarea' },
      { name: 'answerColor', label: 'Answer Color', type: 'text' },
      { name: 'bgColor', label: 'Card Background Color', type: 'text' },
    ]
  }
];

export const FaqSectionDefaultData = {
  title: "FAQ",
  description: "Common questions and answers.",
  items: [
    { question: "Who is this for?", answer: "Creators, coaches, and business owners ready to grow their brand." }
  ]
};

export const FaqSection = component$<FaqSectionProps>(({ data, order, editable = false }) => {
  const fullBleedWidth = "100%";
  const faqSectionStyle = `display: flex; justify-content: center; width: ${fullBleedWidth}; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--accent)'};`;

  return (
    <section class="page-faq-section" style={`${faqSectionStyle} order: ${order};`}>
      <div style={`width: 100%; max-width: 54rem; display: flex; flex-direction: column; gap: ${spacing.md}; align-items: center; text-align: center;`}>
        {(data.title || data.description || editable) && (
          <div style={`display: flex; flex-direction: column; gap: 0.5rem; align-items: center; text-align: center;`}>
            {(data.title || editable) && (
              <h2
                data-field="title"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--surface-1)"
                style={`margin: 0; font-size: 2.5rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; line-height: 1.2; color: ${data.titleColor || 'var(--surface-1)'}; background: ${data.titleHighlight || 'transparent'}; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.title || "FAQ"}
              </h2>
            )}
            {(data.description || editable) && (
              <p
                data-field="description"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--surface-1)"
                style={`margin: 0; font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--surface-1)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.description || "Description"}
              </p>
            )}
          </div>
        )}
        <div style={`display: flex; flex-direction: column; gap: ${spacing.md}; width: 100%; text-align: left;`}>
          {((Array.isArray(data.items) && data.items.length > 0) ? data.items : (editable ? FaqSectionDefaultData.items : [])).map((item: any, index: number) => (
            <FaqsCard
              key={`faq-${index}`}
              index={index}
              link={{ title: item.question, description: item.answer }}
              editableKeyPrefix={`items.${index}`}
              editable={editable}
              itemData={item}
            />
          ))}
        </div>
      </div>
    </section>
  );
});
