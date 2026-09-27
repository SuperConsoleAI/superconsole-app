import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

export interface TextSectionProps {
  htmlContent?: any;
  data?: any;
  order: number;
  editable?: boolean;
  previewMode?: boolean;
  onUpdate$?: any;
}

export const TextSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'htmlContent', label: 'Main Text Content (HTML)', type: 'richtext' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' }
];

export const TextSectionDefaultData = {
  title: "Title",
  description: "Description",
  htmlContent: "<p>Your text content goes here...</p>",
  bgColor: "transparent"
};

export const TextSection = component$<TextSectionProps>(({ htmlContent, data, order, editable = false }) => {
  // Normalize incoming data (can be string or object)
  const dataObj = typeof data === 'object' && data !== null ? data : {};
  
  let contentHtml = '';
  if (typeof data === 'string') {
    contentHtml = data;
  } else if (dataObj.htmlContent && typeof dataObj.htmlContent === 'string') {
    contentHtml = dataObj.htmlContent;
  } else if (typeof htmlContent === 'string') {
    contentHtml = htmlContent;
  } else if (htmlContent && typeof htmlContent === 'object' && htmlContent.htmlContent) {
    contentHtml = String(htmlContent.htmlContent);
  } else {
    contentHtml = "<p>Your text content goes here...</p>";
  }

  const bgColor = dataObj.bgColor || 'transparent';
  const titleColor = dataObj.titleColor || 'var(--text-primary)';
  const descriptionColor = dataObj.descriptionColor || 'var(--text-secondary)';

  const sectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 3rem 1rem; box-sizing: border-box; background: ${bgColor};`;

  return (
    <section style={`${sectionStyle} order: ${order};`}>
      <style>{`
        .page-text-content ul {
          list-style-type: disc !important;
          margin: 1rem 0 !important;
          padding-left: 2rem !important;
        }
        .page-text-content ol {
          list-style-type: decimal !important;
          margin: 1rem 0 !important;
          padding-left: 2rem !important;
        }
        .page-text-content li {
          margin-bottom: 0.5rem !important;
          display: list-item !important;
        }
        .page-text-content blockquote {
          border-left: 4px solid var(--accent, #047EEC);
          margin: 1rem 0;
          padding-left: 1rem;
          font-style: italic;
          color: var(--text-secondary);
        }
        .page-text-content ul, .page-text-content ol {
          display: inline-block;
          text-align: left;
        }
        .page-text-content p {
          margin-bottom: 1rem;
          min-height: 1.5rem;
          text-align: center;
        }
        .page-text-content p:empty {
          min-height: 1.5rem;
        }
        .page-text-content h1, .page-text-content h2, .page-text-content h3, .page-text-content h4 {
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
          text-align: center;
        }
      `}</style>
      <div style={`width: 100%; max-width: 54rem; display: flex; flex-direction: column; gap: ${spacing.md}; align-items: center; text-align: center;`}>
        
        {/* Title & Description */}
        {(dataObj.title || dataObj.description || editable) && (
          <div style={`display: flex; flex-direction: column; gap: 0.5rem; align-items: center; text-align: center; width: 100%;`}>
            {(dataObj.title || editable) && (
              <h2
                data-field="title"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 2.25rem; font-weight: ${dataObj.titleWeight || '600'}; font-style: ${dataObj.titleStyle || 'normal'}; color: ${titleColor}; background: ${dataObj.titleHighlight || 'transparent'}; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}
              >
                {dataObj.title || "Title"}
              </h2>
            )}
            {(dataObj.description || editable) && (
              <p
                data-field="description"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-secondary)"
                style={`margin: 0; font-size: 1rem; font-weight: ${dataObj.descriptionWeight || '400'}; font-style: ${dataObj.descriptionStyle || 'normal'}; color: ${descriptionColor}; background: ${dataObj.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
              >
                {dataObj.description || "Description"}
              </p>
            )}
          </div>
        )}

        {/* Main Rich Text Content */}
        <div
          class="page-text-content"
          data-field="htmlContent"
          contentEditable={editable ? "true" : undefined}
          data-default-color="var(--text-primary)"
          style={`width: 100%; text-align: center; line-height: 1.7; color: ${dataObj.htmlContentColor || 'inherit'}; cursor: ${editable ? 'text' : 'default'}`}
          dangerouslySetInnerHTML={contentHtml}
        />

      </div>
    </section>
  );
});
