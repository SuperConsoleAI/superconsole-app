import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import FaqsCard from "~/components/public/cards/FaqsCard";

const { spacing } = designSystem;

export interface CurriculumSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const CurriculumSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'titleColor', label: 'Title Color', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'text' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
  {
    name: 'modules',
    label: 'Modules',
    type: 'array',
    fields: [
      { name: 'title', label: 'Module Title', type: 'text' }
    ]
  }
];

export const CurriculumSectionDefaultData = {
  title: "Curriculum",
  description: "Here is what we will cover.",
  modules: [
    {
      title: "Module 1",
      lessons: [
        { title: "Lesson 1: Introduction", body: "Welcome to the course." }
      ]
    }
  ]
};

export const CurriculumSection = component$<CurriculumSectionProps>(({ data, order, editable = false }) => {
  const curriculumSectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;

  return (
    <section style={`${curriculumSectionStyle} order: ${order};`}>
      <div style={`width: 100%; max-width: 54rem; display: flex; flex-direction: column; gap: ${spacing.md}; align-items: center; text-align: center;`}>
        {(data.title || data.description || editable) && (
          <div style={`display: flex; flex-direction: column; gap: 0.5rem; align-items: center; text-align: center;`}>
            {(data.title || editable) && (
              <h2
                data-field="title"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 2.5rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.title || "Curriculum"}
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
        <div style={`display: flex; flex-direction: column; gap: ${spacing.md}; width: 100%; text-align: left;`}>
          {((Array.isArray(data.modules) && data.modules.length > 0) ? data.modules : (editable ? CurriculumSectionDefaultData.modules : [])).map((module: any, moduleIndex: number) => (
            <div key={`curriculum-module-${moduleIndex}`} style={`display: flex; flex-direction: column; gap: ${spacing.sm};`}>
              <h3
                data-field={`modules.${moduleIndex}.title`}
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 1.25rem; font-weight: ${module.titleWeight || '600'}; color: ${module.titleColor || 'var(--text-primary)'}; line-height: 1.3; cursor: ${editable ? 'text' : 'default'}`}
              >
                {module.title || `Module ${moduleIndex + 1}`}
              </h3>
              {(module.lessons ?? []).map((lesson: any, lessonIndex: number) => (
                <FaqsCard
                  key={`curriculum-${moduleIndex}-${lessonIndex}`}
                  index={lessonIndex}
                  link={{ title: lesson.title, description: lesson.body }}
                  editableKeyPrefix={editable ? `modules.${moduleIndex}.lessons.${lessonIndex}` : undefined}
                  editable={editable}
                  itemData={lesson}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});
