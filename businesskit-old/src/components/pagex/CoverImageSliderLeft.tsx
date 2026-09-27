import { component$, $, useSignal, useTask$, useStylesScoped$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing, borderRadius, transitions } = designSystem;

interface SliderImage {
  h2?: string;
  title?: string;
  heading?: string;
  h2Color?: string;
  h2Highlight?: string;
  text?: string;
  subtitle?: string;
  description?: string;
  textColor?: string;
  textHighlight?: string;
  buttonText?: string;
  buttonLabel?: string;
  cta?: string;
  buttonUrl?: string;
  buttonLink?: string;
  link?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonBgColor?: string;
  imageUrl?: string;
  url?: string;
  src?: string;
  mobileImageUrl?: string;
}

interface CoverImageSliderLeftProps {
  images: SliderImage[];
  editable?: boolean;
}

const SLIDER_LEFT_STYLES = `
  .landing-slider-left {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: ${borderRadius.xl};
    background: var(--surface-2);
  }

  .slider-left-track {
    display: flex;
    transition: transform ${transitions.normal};
  }

  .slider-left-slide {
    flex: 0 0 100%;
    width: 100%;
    position: relative;
  }

  .slider-left-slide img {
    width: 100%;
    height: auto;
    object-fit: cover;
    object-position: center;
    display: block;
  }

  .slider-left-slide.no-image {
    min-height: 30rem;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    background: var(--surface-2);
    padding: 1rem;
    box-sizing: border-box;
  }

  .slider-left-slide.no-image .slider-left-overlay {
    position: static;
    background: transparent;
    padding: 0;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .slider-left-slide.no-image h2 {
    color: var(--text-primary) !important;
  }

  .slider-left-slide.no-image p {
    color: var(--text-secondary) !important;
  }

  /* Left-aligned overlay — transparent background */
  .slider-left-overlay {
    position: absolute;
    inset: 0;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 3rem 4rem;
    text-align: left;
    gap: 1rem;
    pointer-events: none;
  }

  .slider-left-overlay h2 {
    font-size: 2.5rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
    color: #FFFFFF;
    pointer-events: auto;
    max-width: 48rem;
    text-align: left;
  }

  .slider-left-overlay p {
    font-size: 1.125rem;
    line-height: 1.6;
    margin: 0;
    color: #FFFFFF;
    pointer-events: auto;
    max-width: 38rem;
    font-weight: 400;
    text-align: left;
  }

  @media (max-width: 768px) {
    .slider-left-overlay {
      justify-content: flex-end !important;
      align-items: flex-start !important;
      text-align: left !important;
      padding: 2rem 1.25rem 2.5rem !important;
      gap: 0.75rem !important;
    }
    .slider-left-overlay h2 {
      font-size: 1.75rem !important;
      line-height: 1.2 !important;
      text-align: left !important;
      max-width: 100% !important;
    }
    .slider-left-overlay p {
      font-size: 0.95rem !important;
      line-height: 1.4 !important;
      text-align: left !important;
      max-width: 100% !important;
    }
    .slider-left-overlay a.slider-left-button,
    .slider-left-overlay button.slider-left-button {
      align-self: flex-start !important;
    }
  }

  .slider-left-overlay a.slider-left-button,
  .slider-left-overlay button.slider-left-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 1.5rem;
    height: 2.5rem;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    text-decoration: none;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all ${transitions.fast};
    pointer-events: auto;
  }

  .slider-left-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    padding: 0;
    width: 40px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    opacity: 0;
    transition: opacity ${transitions.normal};
  }

  .slider-left-nav svg {
    width: 40px;
    height: 40px;
  }

  .slider-left-nav.prev { left: ${spacing.md}; }
  .slider-left-nav.next { right: ${spacing.md}; }

  .landing-slider-left:hover .slider-left-nav {
    opacity: 1;
  }

  .slider-left-controls {
    position: absolute;
    bottom: ${spacing.lg};
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: ${spacing.sm};
    z-index: 10;
  }

  .slider-left-dot {
    width: 16px;
    height: 16px;
    border-radius: ${borderRadius.full};
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all ${transitions.fast};
    padding: 0;
  }

  .slider-left-dot.active {
    background: var(--button-primary-bg);
    border: 1px solid var(--border);
  }

  @media (max-width: 768px) {
    .slider-left-overlay {
      padding: 2rem 1.5rem;
    }
    .slider-left-overlay h2 {
      font-size: 1.5rem;
      max-width: 100%;
    }
    .slider-left-overlay p {
      font-size: 1rem;
      max-width: 100%;
    }
  }
`;

export const CoverImageSliderLeft = component$<CoverImageSliderLeftProps>(({ images, editable }) => {
  useStylesScoped$(SLIDER_LEFT_STYLES);

  const currentSlide = useSignal(0);

  useTask$(({ track }) => {
    const len = track(() => images?.length || 0);
    if (currentSlide.value >= len) {
      currentSlide.value = Math.max(0, len - 1);
    }
  });

  const goToSlide = $((index: number) => { currentSlide.value = index; });
  const nextSlide = $(() => { currentSlide.value = (currentSlide.value + 1) % images.length; });
  const prevSlide = $(() => { currentSlide.value = currentSlide.value === 0 ? images.length - 1 : currentSlide.value - 1; });

  if (!images || images.length === 0) return null;

  return (
    <div class="landing-slider-left">
      <div class="slider-left-track" style={`transform: translateX(-${currentSlide.value * 100}%)`}>
        {images.map((slide, index) => {
          const slideObj = typeof slide === 'object' && slide !== null ? slide : {};
          const imgUrl = typeof slide === 'string' ? slide : (slideObj.imageUrl || slideObj.url || slideObj.src || '');
          const mobileImgUrl = slideObj.mobileImageUrl || '';

          const titleText = slideObj.h2 || slideObj.title || slideObj.heading || '';
          const subtitleText = slideObj.text || slideObj.subtitle || slideObj.description || '';
          const btnText = slideObj.buttonText || slideObj.buttonLabel || slideObj.cta || '';
          const btnUrl = slideObj.buttonUrl || slideObj.buttonLink || slideObj.link || '';

          const h2Color = slideObj.h2Color || '#FFFFFF';
          const h2Highlight = slideObj.h2Highlight || 'transparent';
          const textColor = slideObj.textColor || '#FFFFFF';
          const textHighlight = slideObj.textHighlight || 'transparent';
          const btnTextColor = slideObj.buttonTextColor || slideObj.buttonColor || 'var(--button-primary-text)';
          const btnBgColor = slideObj.buttonBgColor || 'var(--button-primary-bg)';

          const hasImage = !!imgUrl;
          const hasContent = !!(titleText || subtitleText || btnText);
          const hasButton = !!(btnText && btnUrl);
          const slideClickable = !!(btnUrl && !hasButton);

          const overlayContent = (
            <div class="slider-left-overlay">
              {(titleText || editable) && (
                <h2
                  data-field={`images.${index}.h2`}
                  contentEditable={editable ? "true" : undefined}
                  data-default-color="#FFFFFF"
                  style={`color: ${h2Color}; background: ${h2Highlight}; cursor: ${editable ? 'text' : 'default'};`}
                >
                  {titleText || "Heading"}
                </h2>
              )}
              {(subtitleText || editable) && (
                <p
                  data-field={`images.${index}.text`}
                  contentEditable={editable ? "true" : undefined}
                  data-default-color="#FFFFFF"
                  style={`color: ${textColor}; background: ${textHighlight}; cursor: ${editable ? 'text' : 'default'};`}
                >
                  {subtitleText || "Text"}
                </p>
              )}
              {(hasButton || editable) && (
                <a
                  data-field={`images.${index}.buttonText`}
                  data-element-type="button"
                  data-link-field={`images.${index}.buttonUrl`}
                  data-default-color="var(--button-primary-text)"
                  data-default-bg="var(--button-primary-bg)"
                  data-current-color={btnBgColor}
                  data-color-field={`images.${index}.buttonBgColor`}
                  contentEditable={editable ? "true" : undefined}
                  class="slider-left-button"
                  href={!editable ? btnUrl : '#'}
                  target={!editable && btnUrl.startsWith('http') ? '_blank' : '_self'}
                  rel={!editable && btnUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                  onClick$={(e) => editable && e.preventDefault()}
                  style={`background: ${btnBgColor}; color: ${btnTextColor}; cursor: ${editable ? 'text' : 'pointer'};`}
                >
                  {btnText || "Button"}
                </a>
              )}
            </div>
          );

          return (
            <div key={index} class={`slider-left-slide ${!hasImage ? 'no-image' : ''}`}>
              {hasImage ? (
                <>
                  {slideClickable && !editable ? (
                    <a href={btnUrl} target={btnUrl.startsWith('http') ? '_blank' : '_self'} rel={btnUrl.startsWith('http') ? 'noopener noreferrer' : undefined} style="display: block; width: 100%;">
                      <picture>
                        {mobileImgUrl && <source media="(max-width: 768px)" srcset={mobileImgUrl} />}
                        <img data-field={`images.${index}.imageUrl`} data-element-type="image" src={imgUrl} alt={titleText || 'Slide image'} loading="lazy" width="1200" height="600" />
                      </picture>
                    </a>
                  ) : (
                    <picture>
                      {mobileImgUrl && <source media="(max-width: 768px)" srcset={mobileImgUrl} />}
                      <img data-field={`images.${index}.imageUrl`} data-element-type="image" src={imgUrl} alt={titleText || 'Slide image'} loading="lazy" width="1200" height="600" style={editable ? 'cursor: pointer;' : ''} />
                    </picture>
                  )}
                  {(hasContent || editable) && overlayContent}
                </>
              ) : (
                overlayContent
              )}
            </div>
          );
        })}
      </div>

      {images.length > 1 && (
        <>
          <button type="button" class="slider-left-nav prev" onClick$={prevSlide} aria-label="Previous">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="14" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" />
              <path d="M22 26l-6-6 6-6" stroke="var(--text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button type="button" class="slider-left-nav next" onClick$={nextSlide} aria-label="Next">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="14" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" />
              <path d="M18 14l6 6-6 6" stroke="var(--text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <div class="slider-left-controls">
            {images.map((_, index) => (
              <button key={index} type="button" class={`slider-left-dot ${currentSlide.value === index ? 'active' : ''}`} onClick$={() => goToSlide(index)} aria-label={`Go to slide ${index + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
});
