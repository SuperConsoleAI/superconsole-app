import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

export interface CtaSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const CtaSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'h3', label: 'Subtitle', type: 'text' },
  { name: 'h3Color', label: 'Subtitle Color', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'richtext', label: 'Detailed Content (HTML)', type: 'richtext' },
  { name: 'buttonText', label: 'Button Text', type: 'text' },
  { name: 'buttonUrl', label: 'Button Link', type: 'text' },
  { name: 'buttonColor', label: 'Button Background Color', type: 'text' },
  { name: 'buttonTextColor', label: 'Button Text Color', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
];

export const CtaSectionDefaultData = {
  title: "Ready to get started?",
  h3: "Join us today",
  description: "Description goes here",
  richtext: "<p>Detailed description...</p>",
  buttonText: "Join Now",
  buttonUrl: "#"
};

export const CtaSection = component$<CtaSectionProps>(({ data, order, editable = false }) => {
  const ctaSectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;

  const richtextHtml = typeof data?.richtext === 'string'
    ? data.richtext
    : (data?.richtext?.htmlContent || (editable ? "<p>Detailed description...</p>" : ""));

  return (
    <section style={`${ctaSectionStyle} order: ${order};`}>
      <style>{`
        .page-cta-richtext ul {
          list-style-type: disc !important;
          margin: 1rem 0 !important;
          padding-left: 2rem !important;
        }
        .page-cta-richtext ol {
          list-style-type: decimal !important;
          margin: 1rem 0 !important;
          padding-left: 2rem !important;
        }
        .page-cta-richtext li {
          margin-bottom: 0.5rem !important;
          display: list-item !important;
        }
        .page-cta-richtext blockquote {
          border-left: 4px solid var(--accent, #047EEC);
          margin: 1rem 0;
          padding-left: 1rem;
          font-style: italic;
          color: var(--text-secondary);
        }
        .page-cta-richtext p {
          margin-bottom: 1rem;
          min-height: 1.5rem;
        }
        .page-cta-richtext p:empty {
          min-height: 1.5rem;
        }
        .page-cta-richtext h1, .page-cta-richtext h2, .page-cta-richtext h3, .page-cta-richtext h4 {
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }
      `}</style>
      <div style={`width: 100%; max-width: 54rem; display: flex; flex-direction: column; gap: ${spacing.md}; text-align: center; align-items: center;`}>
        {(data.title || editable) && (
          <h2
            data-field="title"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-primary)"
            style={`margin: 0; font-size: 2.25rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; cursor: ${editable ? 'text' : 'default'}`}
          >
            {data.title || "Ready to get started?"}
          </h2>
        )}
        {(data.h3 || editable) && (
          <h3
            data-field="h3"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-secondary)"
            style={`margin: 0; font-size: 1.25rem; font-weight: ${data.h3Weight || '600'}; font-style: ${data.h3Style || 'normal'}; color: ${data.h3Color || 'var(--text-secondary)'}; background: ${data.h3Highlight || 'transparent'}; cursor: ${editable ? 'text' : 'default'}`}
          >
            {data.h3 || "Join us today"}
          </h3>
        )}
        {(data.description || editable) && (
          <p
            data-field="description"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-secondary)"
            style={`margin: 0; font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-secondary)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
          >
            {data.description || "Description goes here"}
          </p>
        )}
        {(richtextHtml || editable) && (
          <div
            class="page-cta-richtext"
            data-field="richtext"
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-primary)"
            style={`width: 100%; text-align: left; cursor: ${editable ? 'text' : 'default'}`}
            dangerouslySetInnerHTML={richtextHtml}
          />
        )}
        {(data.buttonText || editable) && (
          <a
            data-field="buttonText"
            data-element-type="button"
            data-link-field="buttonUrl"
            data-color-field="buttonColor"
            data-current-color={data.buttonColor || "var(--brand)"}
            data-default-color="var(--button-primary-text)"
            data-default-bg="var(--brand)"
            contentEditable={editable ? "true" : undefined}
            href={!editable ? (data.buttonUrl ?? "#") : "#"}
            onClick$={(e) => editable && e.preventDefault()}
            style={`display: inline-flex; align-items: center; justify-content: center; height: 3rem; padding: 0 1.5rem; border-radius: 9999px; background: ${data.buttonColor || "var(--brand)"}; color: ${data.buttonTextColor || "white"}; text-decoration: none; font-weight: 600; cursor: ${editable ? 'text' : 'pointer'}; transition: transform 0.2s;`}
          >
            {data.buttonText || "Click Here"}
          </a>
        )}
      </div>
    </section>
  );
});
