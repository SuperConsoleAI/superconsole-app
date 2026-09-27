import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius, shadows } = designSystem;

const DOWNLOADS_CARD_STYLES = `
  .downloads-card {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0;
    height: 5rem;
    border: 1px solid var(--border);
    border-radius: ${borderRadius.md};
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    position: relative;
  }

  .downloads-card__thumb {
    width: 7rem;
    height: 100%;
    border-radius: ${borderRadius.md} 0 0 ${borderRadius.md};
    background-color: #d9d9d9;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .downloads-card__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .downloads-card__content {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-width: 0;
    padding: 0.5rem calc(0.75rem + 2.75rem) 0.5rem 0.75rem;
  }

  .downloads-card__button {
    position: absolute;
    top: 0;
    right: 0;
    width: 2.75rem;
    height: 1.125rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.35rem;
    border-radius: 0 ${borderRadius.md} 0 ${borderRadius.md};
    background-color: var(--card-button-bg, var(--button-primary-bg, var(--text-primary)));
    color: var(--text-primary);
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.medium};
    text-align: center;
    overflow: hidden;
  }

  .downloads-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.3;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .downloads-card__description {
    margin: 0;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

interface DownloadsCardProps {
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

export const DownloadsCard = component$<DownloadsCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(DOWNLOADS_CARD_STYLES);

  const sanitizeText = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Download";
  const description = sanitizeText(link.description);
  const deriveButtonLabel = (value: string | null): string | null => {
    if (!value) {
      return null;
    }

    const numericValue = parseFloat(value.replace(/[^0-9.,-]/g, "").replace(/,/g, "."));
    if (!Number.isNaN(numericValue) && numericValue === 0) {
      return "FREE";
    }

    return value;
  };

  const price = sanitizeText(link.price);
  const buttonLabel = deriveButtonLabel(price);

  return (
    <a
      class="downloads-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      {buttonLabel && <span class="downloads-card__button">{buttonLabel}</span>}
      <div class="downloads-card__thumb">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="96" height="80" />
        ) : (
          <span>{title.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div class="downloads-card__content">
        <h3 class="downloads-card__title">{title}</h3>
        {description && <p class="downloads-card__description">{description}</p>}
      </div>
    </a>
  );
});

export default DownloadsCard;
