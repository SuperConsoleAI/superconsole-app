import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { borderRadius } = designSystem;

export interface IntroSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const IntroSectionSchema = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'nameColor', label: 'Name Color', type: 'text' },
  { name: 'bio', label: 'Short Bio', type: 'text' },
  { name: 'bioColor', label: 'Bio Color', type: 'text' },
  { name: 'description', label: 'Long Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'imageUrl', label: 'Image URL', type: 'text' },
  { name: 'signatureUrl', label: 'Signature Image URL', type: 'text' },
  { name: 'signOff', label: 'Sign-off text', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
  {
    name: 'highlights',
    label: 'Highlights',
    type: 'array',
    fields: [
      { name: 'value', label: 'Number / Value', type: 'text' },
      { name: 'label', label: 'Label', type: 'text' }
    ]
  }
];

export const IntroSectionDefaultData = {
  name: "John Doe",
  bio: "Creator & Entrepreneur",
  description: "I help people build better products.",
  imageUrl: "https://placehold.co/640x480?text=Intro+Image",
  signatureUrl: "",
  signOff: "Best,",
  highlights: [
    { value: "10k+", label: "Students" },
    { value: "5+", label: "Years Exp" }
  ]
};

export const IntroSection = component$<IntroSectionProps>(({ data, order, editable = false }) => {
  const introSectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;
  const introInnerStyle = `width: 100%; max-width: 54rem;`;
  const introGridStyle = `display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; width: 100%; align-items: start;`;
  const introHighlightsStyle = `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; width: 100%; margin-top: 1rem;`;

  return (
    <section class="page-intro-section" style={`${introSectionStyle} order: ${order};`}>
      <div style={introInnerStyle}>
        <div class="page-intro-grid" style={introGridStyle}>
          <div class="page-intro-image-wrap" style={`display: flex; align-items: center; justify-content: center; width: 100%; padding: 0 2rem; box-sizing: border-box;`}>
            {(data.imageUrl || editable) && (
              <img
                data-field="imageUrl"
                data-element-type="image"
                src={data.imageUrl || "https://placehold.co/640x480?text=Intro+Image"}
                alt="Intro"
                width={640}
                height={480}
                style={`width: 100%; height: auto; border-radius: ${borderRadius.md}; border: 1px solid var(--border); cursor: ${editable ? 'pointer' : 'default'};`}
              />
            )}
          </div>
          <div style={`display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; text-align: left;`}>
            {(data.name || editable) && (
              <h3
                data-field="name"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 1.875rem; font-weight: ${data.nameWeight || '400'}; font-style: ${data.nameStyle || 'normal'}; color: ${data.nameColor || 'var(--text-primary)'}; background: ${data.nameHighlight || 'transparent'}; line-height: 1.2; width: 100%; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.name || "Name"}
              </h3>
            )}
            {(data.bio || editable) && (
              <h3
                data-field="bio"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-secondary)"
                style={`margin: 0; font-size: 1.5rem; font-weight: ${data.bioWeight || '400'}; font-style: ${data.bioStyle || 'normal'}; color: ${data.bioColor || 'var(--text-secondary)'}; background: ${data.bioHighlight || 'transparent'}; line-height: 1.3; width: 100%; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.bio || "Short bio"}
              </h3>
            )}
            {(data.name || data.bio || editable) && <div style={`width: 100%; border-top: 1px solid var(--border);`} />}
            {(data.description || editable) && (
              <p
                data-field="description"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-primary)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; width: 100%; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.description || "Introduction text goes here."}
              </p>
            )}
            {((Array.isArray(data.highlights) && data.highlights.length > 0) || editable) && (
              <div class="page-intro-highlights" style={introHighlightsStyle}>
                {((Array.isArray(data.highlights) && data.highlights.length > 0) ? data.highlights : (editable ? IntroSectionDefaultData.highlights : [])).map((item: any, index: number) => (
                  <div key={`intro-highlight-${index}`} style={`display: flex; flex-direction: column; gap: 0.75rem;`}>
                    <strong
                      data-field={`highlights.${index}.value`}
                      contentEditable={editable ? "true" : undefined}
                      data-default-color="var(--text-primary)"
                      style={`font-size: 2rem; font-weight: 600; line-height: 1.2; color: ${item.valueColor || 'var(--text-primary)'}; cursor: ${editable ? 'text' : 'default'}`}
                    >
                      {item.value || "Metric"}
                    </strong>
                    <span
                      data-field={`highlights.${index}.label`}
                      contentEditable={editable ? "true" : undefined}
                      data-default-color="var(--text-secondary)"
                      style={`font-size: 1rem; color: ${item.labelColor || 'var(--text-secondary)'}; line-height: 1.6; font-weight: 400; cursor: ${editable ? 'text' : 'default'}`}
                    >
                      {item.label || "Label"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});
