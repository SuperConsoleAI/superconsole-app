import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

export interface AboutSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const AboutSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'textarea' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'richtext', label: 'Detailed Content (HTML)', type: 'richtext' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' }
];

export const AboutSectionDefaultData = {
  title: "About",
  description: "About Description",
  richtext: "<p>Detailed about content...</p>"
};

export const AboutSection = component$<AboutSectionProps>(({ data, order, editable = false }) => {
  const aboutSectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;

  return (
    <section style={`${aboutSectionStyle} order: ${order};`}>
      <style>{`
        .page-about-richtext ul {
          list-style-type: disc !important;
          margin: 1rem 0 !important;
          padding-left: 2rem !important;
        }
        .page-about-richtext ol {
          list-style-type: decimal !important;
          margin: 1rem 0 !important;
          padding-left: 2rem !important;
        }
        .page-about-richtext li {
          margin-bottom: 0.5rem !important;
          display: list-item !important;
        }
        .page-about-richtext blockquote {
          border-left: 4px solid var(--accent, #047EEC);
          margin: 1rem 0;
          padding-left: 1rem;
          font-style: italic;
          color: var(--text-secondary);
        }
        .page-about-richtext p {
          margin-bottom: 1rem;
          min-height: 1.5rem;
        }
        .page-about-richtext p:empty {
          min-height: 1.5rem;
        }
        .page-about-richtext h1, .page-about-richtext h2, .page-about-richtext h3, .page-about-richtext h4 {
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }
      `}</style>
      <div style={`width: 100%; max-width: 54rem; display: flex; flex-direction: column; gap: ${spacing.md}; align-items: center; text-align: center;`}>
        {(data.title || editable) && (
          <h2
            data-field="title"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-primary)"
            style={`margin: 0; font-size: 2.25rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; cursor: ${editable ? 'text' : 'default'}`}
          >
            {data.title || "About"}
          </h2>
        )}
        {(data.description || editable) && (
          <p
            data-field="description"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-secondary)"
            style={`margin: 0; font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-secondary)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
          >
            {data.description || "About Description"}
          </p>
        )}
        {(data.richtext || editable) && (
          <div
            class="page-about-richtext"
            data-field="richtext"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-primary)"
            style={`width: 100%; text-align: left; color: ${data.richtextColor || 'inherit'}; cursor: ${editable ? 'text' : 'default'}`}
            dangerouslySetInnerHTML={data.richtext || "<p>Detailed about content...</p>"}
          />
        )}
      </div>
    </section>
  );
});
