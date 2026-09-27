import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { borderRadius } = designSystem;

export interface HeroSectionProps {
  data: any;
  order: number;
  editable?: boolean;
  onUpdate$?: any;
}

export const HeroSectionSchema = [
  { name: 'logoUrl', label: 'Logo URL', type: 'text' },
  { name: 'text1', label: 'Pre-heading Text', type: 'text' },
  { name: 'text2', label: 'Sub-heading', type: 'text' },
  { name: 'heading', label: 'Main Heading', type: 'text' },
  { name: 'text3', label: 'Description below heading', type: 'text' },
  { name: 'mediaUrl', label: 'Hero Media URL (Video/Image)', type: 'text' },
  { name: 'text4', label: 'Footer text', type: 'text' },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' },
  { name: 'highlightBoxColor', label: 'Highlight Box Color', type: 'text' }
];

export const HeroSectionDefaultData = {
  logoUrl: "https://www.zipchat.ai/images/v2-home/logo-zipchat.svg",
  text1: "For creators, coaches, and ambitious beginners",
  text2: "A 4-week live coaching program",
  heading: "Create viral Instagram reels",
  text3: "Turn attention into consistent income",
  mediaUrl: "https://www.youtube.com/watch?v=CCX1Zc3q5cY",
  text4: "Limited spots available — apply now",
  bgColor: "var(--surface-1)",
  highlightBoxColor: "var(--surface-2)"
};

const getYoutubeEmbedUrl = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11)
    ? `https://www.youtube.com/embed/${match[2]}`
    : null;
};

export const HeroSection = component$<HeroSectionProps>(({ data: inputData, order, editable = false }) => {
  const data = Object.keys(inputData).length === 0 ? HeroSectionDefaultData : inputData;
  const heroSectionStyle = `display: flex; justify-content: center; width: 100%; padding: 1rem; box-sizing: border-box; background-color: ${data.bgColor || 'var(--surface-1)'};`;
  const heroInnerStyle = `width: 100%; max-width: 54rem; display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center;`;

  return (
    <section class="page-hero-section" style={`${heroSectionStyle} order: ${order};`}>
      <style>{`
        @media (max-width: 768px) {
          .page-hero-section {
            padding: 1rem !important;
          }
          .page-hero-text1 {
            font-size: 0.775rem !important;
            padding: 0.4rem 0.8rem !important;
          }
          .page-hero-text2 {
            font-size: 1rem !important;
            line-height: 1.4 !important;
          }
          .page-hero-heading {
            font-size: 1.75rem !important;
            line-height: 1.2 !important;
          }
          .page-hero-text3 {
            font-size: 0.9rem !important;
            line-height: 1.5 !important;
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
          }
        }
      `}</style>
      <div style={heroInnerStyle}>
        {(data.logoUrl || editable) && (
          <img
            data-field="logoUrl"
            data-element-type="image"
            src={data.logoUrl || "https://placehold.co/128x128?text=Logo"}
            alt="Logo"
            width={128}
            height={128}
            style={`width: 128px; height: 128px; object-fit: contain; border-radius: ${borderRadius.sm}; cursor: ${editable ? 'pointer' : 'default'}; margin-bottom: -0.5rem;`}
          />
        )}
        {(data.text1 || editable) && (
          <div
            data-field="text1"
            data-element-type="box"
            data-color-field="highlightBoxColor"
            data-current-color={data.highlightBoxColor || "var(--surface-2)"}
            data-default-color="var(--text-secondary)"
            data-default-bg="var(--surface-2)"
            contentEditable={editable ? "true" : undefined}
            class="page-hero-text1"
            style={`padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: ${data.text1Weight || '400'}; font-style: ${data.text1Style || 'normal'}; border-radius: 1.5rem; background: ${data.text1Highlight || data.highlightBoxColor || "var(--surface-2)"}; color: ${data.text1Color || 'var(--text-secondary)'}; cursor: ${editable ? 'text' : 'default'};`}
          >
            {data.text1 || "Your first text"}
          </div>
        )}
        {(data.text2 || editable) && (
          <p
            data-field="text2"
            contentEditable={editable ? "true" : undefined}
            class="page-hero-text2"
            data-default-color="var(--text-secondary)"
            style={`font-size: 1.25rem; margin: 0; color: ${data.text2Color || 'var(--text-secondary)'}; background: ${data.text2Highlight || 'transparent'}; font-weight: ${data.text2Weight || '400'}; font-style: ${data.text2Style || 'normal'}; line-height: 1.5; cursor: ${editable ? 'text' : 'default'};`}
          >
            {data.text2 || "Second text block"}
          </p>
        )}
        {(data.heading || editable) && (
          <h3
            data-field="heading"
            contentEditable={editable ? "true" : undefined}
            class="page-hero-heading"
            data-default-color="var(--text-primary)"
            style={`font-size: 2.5rem; font-weight: ${data.headingWeight || '600'}; font-style: ${data.headingStyle || 'normal'}; margin: 0; line-height: 1.2; color: ${data.headingColor || 'var(--text-primary)'}; background: ${data.headingHighlight || 'transparent'}; cursor: ${editable ? 'text' : 'default'};`}
          >
            {data.heading || "Hero Heading"}
          </h3>
        )}
        {(data.text3 || editable) && (
          <p
            data-field="text3"
            contentEditable={editable ? "true" : undefined}
            class="page-hero-text3"
            data-default-color="var(--text-primary)"
            style={`font-size: 1rem; margin: 0; color: ${data.text3Color || 'var(--text-primary)'}; background: ${data.text3Highlight || 'transparent'}; font-weight: ${data.text3Weight || '400'}; font-style: ${data.text3Style || 'normal'}; line-height: 1.6; max-width: 36rem; padding-left: 1rem; padding-right: 1rem; cursor: ${editable ? 'text' : 'default'};`}
          >
            {data.text3 || "Third text block"}
          </p>
        )}
        {(data.mediaUrl || editable) && (() => {
          const url = data.mediaUrl || "";
          const ytEmbed = getYoutubeEmbedUrl(url);
          const mediaStyle = `width: 100%; aspect-ratio: 16 / 9; border-radius: ${borderRadius.md}; cursor: ${editable ? 'pointer' : 'default'}; object-fit: cover;`;

          if (ytEmbed) {
            return (
              <div data-field="mediaUrl" data-element-type="image" style="width: 100%; position: relative;">
                {editable && <div style="position: absolute; inset: 0; z-index: 10; cursor: pointer;"></div>}
                <iframe
                  src={ytEmbed}
                  style={`${mediaStyle} border: none;`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullscreen
                />
              </div>
            );
          }

          if (url.match(/\.(mp4|webm|ogg)$/i)) {
            return (
              <video
                data-field="mediaUrl"
                data-element-type="image"
                src={url}
                style={mediaStyle}
                controls={!editable}
              />
            );
          }

          return (
            <img
              data-field="mediaUrl"
              data-element-type="image"
              src={url || "https://placehold.co/800x450?text=Media"}
              alt="Media"
              style={mediaStyle}
              width={800}
              height={450}
            />
          );
        })()}
        {(data.text4 || editable) && (
          <p
            data-field="text4"
            contentEditable={editable ? "true" : undefined}
            class="page-hero-text4"
            data-default-color="var(--text-secondary)"
            style={`font-size: 0.875rem; margin: 0; color: ${data.text4Color || 'var(--text-secondary)'}; font-weight: ${data.text4Weight || '400'}; font-style: ${data.text4Style || 'normal'}; cursor: ${editable ? 'text' : 'default'};`}
          >
            {data.text4 || "Footer text"}
          </p>
        )}

      </div>
    </section>
  );
});
