import { component$, $, useSignal } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import { CategorySections } from "~/components/public/CategorySections";
import type { HomeCategorySection, SectionBlock, CustomComponentData } from "~/lib/types";
import { SectionEditorTooltip } from "~/components/page/SectionEditorTooltip";
import { SectionWrapper } from "~/components/page/SectionWrapper";
import { SectionEditorModal } from "~/components/page/SectionEditorModal";

import { HeroSliderSection } from "~/components/pagex/HeroSliderSection";
import { HeroSliderSection2 } from "~/components/pagex/HeroSliderSection2";
import { HeroSection } from "~/components/pagex/HeroSection";
import { TextSection } from "~/components/pagex/TextSection";
import { TextLeftSection } from "~/components/pagex/TextLeftSection";
import { ShowLinks } from "~/components/pagex/ShowLinks";
import { ShowLinksCentred } from "~/components/pagex/ShowLinksCentred";
import { FeaturedSection } from "~/components/pagex/FeaturedSection";
import { IntroSection } from "~/components/pagex/IntroSection";
import { CurriculumSection } from "~/components/pagex/CurriculumSection";
import { PeopleSection } from "~/components/pagex/PeopleSection";
import { AboutSection } from "~/components/pagex/AboutSection";
import { CtaSection } from "~/components/pagex/CtaSection";
import { TestimonialsSection } from "~/components/pagex/TestimonialsSection";
import { PricingSection } from "~/components/pagex/PricingSection";
import { FaqSection } from "~/components/pagex/FaqSection";
import type { QRL } from "@builder.io/qwik";

const { spacing } = designSystem;

export interface PageSectionsProps {
  content: SectionBlock[];
  categorySections?: HomeCategorySection[];
  customComponents?: Record<string, CustomComponentData>;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: QRL<(newContent: SectionBlock[]) => void>;
}

const rgbToHex = (rgb: string) => {
  if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)' || (rgb.startsWith('rgba') && rgb.split(',')[3]?.trim() === '0)')) {
    return 'transparent';
  }
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;
  return "#" +
    ("0" + parseInt(match[1], 10).toString(16)).slice(-2) +
    ("0" + parseInt(match[2], 10).toString(16)).slice(-2) +
    ("0" + parseInt(match[3], 10).toString(16)).slice(-2);
};

export const PageSections = component$<PageSectionsProps>((props) => {
  const { content, categorySections = [], previewMode = false, editable = false, onUpdate$ } = props;
  const activeTooltip = useSignal<{
    x: number;
    y: number;
    fieldName: string;
    currentValue: string;
    sectionIndex: number;
    propertyType: 'text' | 'color' | 'image' | 'link' | 'box' | 'button';
    currentColor?: string;
    colorField?: string;
    defaultColor?: string;
    defaultBgColor?: string;
    weight?: string;
    style?: string;
    color?: string;
  } | null>(null);

  const editingSectionIndex = useSignal<number | null>(null);

  const handleMoveUp = $((index: number) => {
    if (!onUpdate$ || index <= 0) return;
    const newContent = [...content];
    const temp = newContent[index];
    newContent[index] = newContent[index - 1];
    newContent[index - 1] = temp;
    newContent.forEach((c, i) => c.order = i);
    onUpdate$(newContent);
  });
  
  const handleMoveDown = $((index: number) => {
    if (!onUpdate$ || index >= content.length - 1) return;
    const newContent = [...content];
    const temp = newContent[index];
    newContent[index] = newContent[index + 1];
    newContent[index + 1] = temp;
    newContent.forEach((c, i) => c.order = i);
    onUpdate$(newContent);
  });

  const handleDelete = $((index: number) => {
    if (!onUpdate$) return;
    if (editingSectionIndex.value !== null) {
      if (editingSectionIndex.value === index) {
        editingSectionIndex.value = null;
      } else if (editingSectionIndex.value > index) {
        editingSectionIndex.value = editingSectionIndex.value - 1;
      }
    }
    const newContent = content.filter((_, i) => i !== index);
    newContent.forEach((c, i) => c.order = i);
    onUpdate$(newContent);
  });

  const handleBgColorClick = $((index: number, e: MouseEvent, target: HTMLElement) => {
    e.stopPropagation();
    const rect = target.getBoundingClientRect();
    const sectionData = content[index].data || {};
    
    activeTooltip.value = {
      x: rect.left,
      y: rect.bottom + 8,
      fieldName: 'bgColor',
      currentValue: '',
      sectionIndex: index,
      propertyType: 'color',
      currentColor: sectionData.bgColor || 'var(--surface-1)',
      defaultBgColor: 'var(--surface-1)',
      colorField: 'bgColor',
      weight: 'normal',
      style: 'normal',
      color: '',
    };
  });

  const handleEditClick = $((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tooltipEl = target.closest('.editor-tooltip-overlay');
    if (tooltipEl) {
      return;
    }
    
    let el: HTMLElement | null = target;
    let fieldName: string | null = null;
    let propertyType: 'text' | 'color' | 'image' | 'link' | 'box' | 'button' | null = null;
    let currentValue = '';
    let currentColor = '';
    let colorField = '';
    let weight = '';
    let style = '';
    let color = '';
    let defaultColor = '';
    let defaultBgColor = '';

    while (el && el !== e.currentTarget) {
      if (el.hasAttribute('data-field') || el.hasAttribute('data-color-field') || el.hasAttribute('data-link-field') || el.hasAttribute('data-element-type')) {
        fieldName = el.getAttribute('data-field') || el.getAttribute('data-link-field') || el.getAttribute('data-color-field');
        if (!fieldName) break;

        if (el.hasAttribute('data-element-type')) {
          propertyType = el.getAttribute('data-element-type') as any;
        } else if (el.tagName === 'IMG') {
          propertyType = 'image';
        } else if (el.tagName === 'A') {
          propertyType = 'link';
        } else if (el.hasAttribute('data-color-field') && !el.hasAttribute('data-field')) {
          propertyType = 'color';
        } else {
          propertyType = 'text';
        }

        if (propertyType === 'image') {
          currentValue = (el as HTMLImageElement).src || '';
        } else if (propertyType === 'link' || el.hasAttribute('data-link-field')) {
          currentValue = (el as HTMLAnchorElement).href || '';
        } else if (propertyType === 'color') {
          currentValue = el.getAttribute('data-current-color') || '';
        } else {
          currentValue = el.textContent || '';
        }

        if (el.hasAttribute('data-current-color')) {
          currentColor = el.getAttribute('data-current-color') || '';
        }
        if (el.hasAttribute('data-color-field')) {
          colorField = el.getAttribute('data-color-field') || '';
        }

        const computed = window.getComputedStyle(el);
        weight = computed.fontWeight === '700' || computed.fontWeight === 'bold' || parseInt(computed.fontWeight) > 600 ? 'bold' : 'normal';
        style = computed.fontStyle;
        color = rgbToHex(computed.color);

        defaultBgColor = el.getAttribute('data-default-bg') || '';
        defaultColor = el.getAttribute('data-default-color') || '';

        if (!defaultColor) {
          if (propertyType === 'button') defaultColor = 'var(--button-primary-text)';
          else if (propertyType === 'text') defaultColor = 'var(--text-primary)';
        }

        if (!defaultBgColor) {
          if (propertyType === 'button') defaultBgColor = 'var(--button-primary-bg)';
          else if (propertyType === 'box') defaultBgColor = 'var(--surface-2)';
          else if (propertyType === 'color') defaultBgColor = 'var(--surface-1)';
        }

        break;
      }
      el = el.parentElement;
    }

    if (fieldName && propertyType) {
      const sectionEl = target.closest('[data-section-index]');
      const sectionIndex = sectionEl ? parseInt(sectionEl.getAttribute('data-section-index') || '0', 10) : 0;
      
      const rect = (el as HTMLElement).getBoundingClientRect();
      activeTooltip.value = {
        x: rect.left,
        y: rect.bottom,
        fieldName,
        currentValue,
        sectionIndex,
        propertyType,
        currentColor,
        colorField,
        defaultColor,
        defaultBgColor,
        weight,
        style,
        color,
      };
    } else {
      activeTooltip.value = null;
    }
  });

  const onSectionFieldUpdate$ = $((fieldName: string, value: string, sectionIndex: number) => {
    if (!onUpdate$) return;
    const section = content[sectionIndex];
    if (section) {
      const newContent = [...content];
      const newData = JSON.parse(JSON.stringify(section.data || {}));
      
      const pathParts = fieldName.split('.');
      let current = newData;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!current[part]) current[part] = isNaN(Number(pathParts[i+1])) ? {} : [];
        current = current[part];
      }
      
      current[pathParts[pathParts.length - 1]] = value;

      newContent[sectionIndex] = { ...section, data: newData };
      onUpdate$(newContent);
    }
  });

  const handleInlineInput = $((e: Event) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    
    let el: HTMLElement | null = target;
    let fieldName: string | null = null;
    
    while (el && el !== e.currentTarget) {
      if (el.hasAttribute('data-field')) {
        fieldName = el.getAttribute('data-field');
        break;
      }
      el = el.parentElement;
    }
    
    if (fieldName) {
      const sectionEl = target.closest('[data-section-index]');
      const sectionIndex = sectionEl ? parseInt(sectionEl.getAttribute('data-section-index') || '0', 10) : 0;
      
      const isHtmlField = fieldName === 'htmlContent' || fieldName === 'richtext' || fieldName.toLowerCase().includes('html') || fieldName.toLowerCase().includes('richtext');
      const newText = isHtmlField ? (target.innerHTML || target.textContent || '') : (target.innerText || target.textContent || '');
      onSectionFieldUpdate$(fieldName, newText, sectionIndex);
    }
  });

  const handleOpenEditModal = $((index: number) => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    const sectionEl = document.querySelector(`[data-section-index="${index}"]`);
    if (sectionEl && content[index]) {
      const newData = JSON.parse(JSON.stringify(content[index].data || {}));
      const fieldElements = sectionEl.querySelectorAll('[data-field]');
      let changed = false;
      
      fieldElements.forEach((el) => {
        const fieldName = el.getAttribute('data-field');
        const elementType = el.getAttribute('data-element-type');
        if (fieldName && elementType !== 'image' && elementType !== 'link') {
          const isHtmlField = fieldName === 'htmlContent' || fieldName === 'richtext' || fieldName.toLowerCase().includes('html') || fieldName.toLowerCase().includes('richtext');
          const text = isHtmlField ? (el.innerHTML || el.textContent || '') : (el.textContent || '');
          const pathParts = fieldName.split('.');
          let current = newData;
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) current[part] = isNaN(Number(pathParts[i+1])) ? {} : [];
            current = current[part];
          }
          const lastKey = pathParts[pathParts.length - 1];
          if (current[lastKey] !== text) {
            current[lastKey] = text;
            changed = true;
          }
        }
      });

      if (changed && onUpdate$) {
        const newContent = [...content];
        newContent[index] = { ...newContent[index], data: newData };
        onUpdate$(newContent);
      }
    }

    editingSectionIndex.value = index;
  });

  return (
    <div 
      class="page-sections-container"
      style={`display: flex; flex-direction: column; gap: ${spacing.lg}; width: 100%; position: relative;`}
      onClick$={editable ? handleEditClick : undefined}
      onBlur$={editable ? handleInlineInput : undefined}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');
        [contenteditable="true"] {
          outline: none;
          transition: outline 0.15s ease, box-shadow 0.15s ease;
        }
        [contenteditable="true"]:focus {
          outline: 2px dashed #047EEC !important;
          outline-offset: 4px;
          border-radius: 4px;
        }
        [contenteditable="true"]:hover {
          outline: 1px dashed rgba(4, 126, 236, 0.4);
          outline-offset: 2px;
          border-radius: 4px;
        }
        @media (max-width: 1024px) {
          .page-hero-section { padding: 2rem 0 0 !important; }
          .page-intro-section { padding-top: 2rem !important; padding-bottom: 2rem !important; }
          .page-intro-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
          .page-intro-image-wrap { order: -1; padding: 0 1rem !important; }
          .page-intro-image-wrap img { width: 100% !important; height: auto !important; max-height: 400px; object-fit: cover; }
          .page-pricing-section { padding-top: 2rem !important; padding-bottom: 2rem !important; }
          .page-pricing-main { grid-template-columns: 1fr !important; gap: 1rem !important; }
          .page-faq-section { padding-top: 2rem !important; padding-bottom: 2rem !important; }
          .page-testimonials-section { padding-top: 2rem !important; padding-bottom: 2rem !important; }
          .page-hero-text3, .page-hero-text4 { padding-left: 1rem !important; padding-right: 1rem !important; }
          .testimonials-grid { column-count: 1 !important; }
        }
      `}</style>
      
      {editable && activeTooltip.value && (
        <SectionEditorTooltip 
          tooltip={activeTooltip.value}
          onClose$={$(() => activeTooltip.value = null)}
          onUpdate$={onSectionFieldUpdate$}
        />
      )}

    <div style="width: 100%;">
      {Array.isArray(content) && content.map((section, index) => {
        if (!editable && !section.enabled) return null;
        
        const renderedSection = (() => {
          switch (section.type) {
            case "hero_slider":
            case "heroSlider":
                  return <HeroSliderSection data={section.data || {}} order={index} editable={editable} />;
                case "hero_slider_2":
                case "heroSlider2":
                  return <HeroSliderSection2 data={section.data || {}} order={index} editable={editable} />;
                case "hero_section":
                case "heroSection":
                  return (
                    <HeroSection 
                      data={section.data || {}} 
                      order={index} 
                      editable={editable}
                    />
                  );
                case "text":
                case "textField":
                  return <TextSection data={section.data || {}} order={index} editable={editable} previewMode={previewMode} />;
                case "text_left":
                case "textLeft":
                  return <TextLeftSection data={section.data || {}} order={index} editable={editable} previewMode={previewMode} />;
                case "show_links":
                case "showLinks":
                  return <ShowLinks data={section.data || {}} categorySections={categorySections} order={index} editable={editable} previewMode={previewMode} />;
                case "show_links_centred":
                case "showLinksCentred":
                  return <ShowLinksCentred data={section.data || {}} categorySections={categorySections} order={index} editable={editable} previewMode={previewMode} />;
                case "featured":
                case "featuredSection":
                  return (
                    <FeaturedSection 
                      data={section.data || {}} 
                      order={index} 
                      previewMode={previewMode} 
                      editable={editable}
                    />
                  );
                case "intro":
                case "introSection":
                  return (
                    <IntroSection 
                      data={section.data || {}} 
                      order={index} 
                      previewMode={previewMode} 
                      editable={editable}
                    />
                  );
                case "categories":
                  if (!categorySections || categorySections.length === 0) return null;
                  return (
                    <CategorySections
                      sections={categorySections}
                      fullWidth
                      sectionBackground="var(--surface-1)"
                      centerHeader
                      listGap="2rem"
                    />
                  );
                case "curriculum":
                  return <CurriculumSection data={section.data || { modules: [] }} order={index} previewMode={previewMode} editable={editable} />;
                case "people_section":
                case "peopleSection":
                  return <PeopleSection data={section.data || { people: [] }} order={index} previewMode={previewMode} editable={editable} />;
                case "about_section":
                case "aboutSection":
                  return (
                    <AboutSection 
                      data={section.data || {}} 
                      order={index} 
                      previewMode={previewMode} 
                      editable={editable}
                    />
                  );
                case "cta_section":
                case "ctaSection":
                  return (
                    <CtaSection 
                      data={section.data || {}} 
                      order={index} 
                      previewMode={previewMode} 
                      editable={editable}
                    />
                  );
                case "testimonials":
                  return <TestimonialsSection data={section.data || { items: [] }} order={index} previewMode={previewMode} editable={editable} />;
                case "pricing":
                  return <PricingSection data={section.data || { plans: [] }} order={index} previewMode={previewMode} editable={editable} />;
                case "faq":
                  return <FaqSection data={section.data || { items: [] }} order={index} previewMode={previewMode} editable={editable} />;
                case "custom": {
                  if (section.component_id && props.customComponents && props.customComponents[section.component_id]) {
                    const comp = props.customComponents[section.component_id];
                    return (
                      <div class="custom-component-wrapper">
                        {comp.css && <style dangerouslySetInnerHTML={comp.css} />}
                        <div dangerouslySetInnerHTML={comp.html} />
                      </div>
                    );
                  }
                  return null;
                }
                default:
                  return null;
              }
            })();

            return (
              <SectionWrapper
                key={section.id}
                id={section.id}
                name={section.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                index={index}
                editable={editable}
                isFirst={index === 0}
                isLast={index === content.length - 1}
                onEdit$={editable ? $(() => handleOpenEditModal(index)) : undefined}
                onMoveUp$={editable ? $(() => handleMoveUp(index)) : undefined}
                onMoveDown$={editable ? $(() => handleMoveDown(index)) : undefined}
                onDelete$={editable ? $(() => handleDelete(index)) : undefined}
                onBgColor$={editable ? $((e, el) => handleBgColorClick(index, e, el)) : undefined}
              >
                <div data-section-index={index} style={`order: ${index}; ${!section.enabled && editable ? 'opacity: 0.5;' : ''}`}>
                  {renderedSection}
                </div>
              </SectionWrapper>
            );
      })}

      {editable && (
        <SectionEditorModal
          sectionKey={editingSectionIndex.value !== null && content[editingSectionIndex.value] ? content[editingSectionIndex.value].type : ""}
          isOpen={editingSectionIndex.value !== null && !!content[editingSectionIndex.value]}
          onClose$={$(() => { editingSectionIndex.value = null; })}
          sectionData={editingSectionIndex.value !== null && content[editingSectionIndex.value] ? (content[editingSectionIndex.value].data || {}) : {}}
          onUpdate$={$((newData: any) => {
            if (!onUpdate$) return;
            // Capture targetIdx NOW before onClose$ can null editingSectionIndex
            const targetIdx = editingSectionIndex.value;
            if (targetIdx === null || !content[targetIdx]) return;
            const newContent = [...content];
            newContent[targetIdx] = {
              ...newContent[targetIdx],
              data: newData
            };
            onUpdate$(newContent);
          })}
        />
      )}
    </div>
    </div>
  );
});
