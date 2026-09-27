import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, spacing, shadows } = designSystem;

const STORE_CARD_STYLES = `
  .store-card {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    padding: ${spacing.sm};
    border-radius: 1.5rem;
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    transition: box-shadow ${designSystem.transitions.fast}, transform ${designSystem.transitions.fast};
  }

  .store-card:hover,
  .store-card:focus-visible {
    outline: none;
    box-shadow: ${shadows.md};
    transform: translateY(-2px);
  }

  .store-card__image-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 66.6667%;
    border-radius: 12px 12px 0 0;
    overflow: hidden;
  }

  .store-card__image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .store-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .store-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0 ${spacing.xs} ${spacing.xs};
  }

  .store-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .store-card__title {
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

  .store-card__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.6rem;
    border-radius: 0.5rem;
    background-color: var(--card-button-bg, var(--button-primary-bg, var(--text-primary)));
    color: var(--text-primary);
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.medium};
    min-width: 3.5rem;
  }

  .store-card__meta {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
  }

  .store-card__description {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .store-card__meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  .store-card__spacer {
    opacity: 0.6;
  }
`;

interface StoreCardProps {
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

export const StoreCard = component$<StoreCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(STORE_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled item";
  const buttonLabel = sanitizeText(link.button_text);
  const description = sanitizeText(link.description);
  const location = sanitizeText(link.location);
  const date = sanitizeText(link.date);
  const showMeta = Boolean(location || date || description);

  return (
    <a
      class="store-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="store-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="213" />
        ) : (
          <span class="store-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="store-card__content">
        <div class="store-card__header">
          <h3 class="store-card__title">{title}</h3>
          {buttonLabel && <span class="store-card__button">{buttonLabel}</span>}
        </div>
        {showMeta && (
          <div class="store-card__meta">
            {description && <p class="store-card__description">{description}</p>}
            {(location || date) && (
              <div class="store-card__meta-row">
                {location && <span>{location}</span>}
                {location && date && <span class="store-card__spacer">•</span>}
                {date && <span>{date}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </a>
  );
});

export default StoreCard;
