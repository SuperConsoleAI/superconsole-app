import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, spacing } = designSystem;

const CARD_RADIUS = "0.5rem";
const IMAGE_RADIUS = "0.75rem";

const COURSES_CARD_STYLES = `
  .courses-card {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    padding: 0;
    border-radius: ${CARD_RADIUS};
    border: none;
    background-color: transparent;
    text-decoration: none;
    color: inherit;
    outline: none;
  }

  .courses-card__image-wrap {
    position: relative;
    width: 100%;
    height: clamp(140px, 45vw, 180px);
    aspect-ratio: 16 / 9;
    border-radius: ${IMAGE_RADIUS};
    overflow: hidden;
    background-color: #d9d9d9;
  }

  .courses-card__image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    position: absolute;
    inset: 0;
  }

  .courses-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .courses-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0;
  }

  .courses-card__header {
    display: block;
  }

  .courses-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.medium};
    line-height: 1.3;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .courses-card__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 2.25rem;
    padding: 0 0.75rem;
    border-radius: 1.5rem;
    background-color: var(--button-primary-bg, var(--text-primary));
    color: var(--button-primary-text, var(--surface-2));
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.medium};
    min-width: 7rem;
    align-self: flex-start;
    margin-top: ${spacing.sm};
  }

  .courses-card__description {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

interface CoursesCardProps {
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const CoursesCard = component$<CoursesCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(COURSES_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled course";
  const description = sanitizeText(link.description);
  const buttonLabel = sanitizeText(link.button_text);

  return (
    <a
      class="courses-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="courses-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="180" />
        ) : (
          <span class="courses-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="courses-card__body">
        <div class="courses-card__header">
          <h3 class="courses-card__title">{title}</h3>
        </div>
        {description && <p class="courses-card__description">{description}</p>}
        {buttonLabel && <span class="courses-card__button">{buttonLabel}</span>}
      </div>
    </a>
  );
});

export default CoursesCard;
