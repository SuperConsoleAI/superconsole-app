import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, shadows } = designSystem;

const CARD_RADIUS = "0.5rem";
const IMAGE_RADIUS = "0.325rem";

const PORTFOLIO_CARD_STYLES = `
  .portfolio-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: ${CARD_RADIUS};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    transition: box-shadow ${designSystem.transitions.fast}, transform ${designSystem.transitions.fast};
  }

  .portfolio-card:hover,
  .portfolio-card:focus-visible {
    outline: none;
    box-shadow: ${shadows.md};
    transform: translateY(-2px);
  }

  .portfolio-card__image-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: ${IMAGE_RADIUS};
    overflow: hidden;
    background-color: #d9d9d9;
  }

  .portfolio-card__image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .portfolio-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .portfolio-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .portfolio-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .portfolio-card__title {
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

  .portfolio-card__button {
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

  .portfolio-card__description {
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

interface PortfolioCardProps {
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

export const PortfolioCard = component$<PortfolioCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(PORTFOLIO_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled project";
  const description = sanitizeText(link.description);
  const buttonLabel = sanitizeText(link.button_text);

  return (
    <a
      class="portfolio-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="portfolio-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="180" />
        ) : (
          <span class="portfolio-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="portfolio-card__body">
        <div class="portfolio-card__header">
          <h3 class="portfolio-card__title">{title}</h3>
          {buttonLabel && <span class="portfolio-card__button">{buttonLabel}</span>}
        </div>
        {description && <p class="portfolio-card__description">{description}</p>}
      </div>
    </a>
  );
});

export default PortfolioCard;
