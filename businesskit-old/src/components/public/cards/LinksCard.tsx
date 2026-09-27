import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius, shadows } = designSystem;

const LINKS_CARD_STYLES = `
  .links-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem;
    border: 1px solid var(--border);
    border-radius: ${borderRadius.md};
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    min-height: 3.25rem;
    max-height: 5rem;
    box-sizing: border-box;
  }

  .links-card:not(.links-card--with-description) {
    height: 3.25rem;
    align-items: center;
  }

  .links-card:hover,
  .links-card:focus-visible {
    outline: none;
  }

  .links-card__thumb {
    width: 3.75rem;
    height: 3.75rem;
    border-radius: ${borderRadius.sm};
    background-color: #d9d9d9;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .links-card__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .links-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
    margin-left: 0.5rem;
    justify-content: center;
  }

  .links-card__content--with-thumb {
    margin-left: 0.5rem;
  }

  .links-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.4;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .links-card__description {
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

  .links-card__icon {
    margin-right: 0.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

interface LinksCardProps {
  link: PageSettingsLinkItem;
  href: string;
  logoUrl?: string | null;
  onNavigate$?: PropFunction<() => void>;
}

export const LinksCard = component$<LinksCardProps>(({ link, href, logoUrl, onNavigate$ }) => {
  useStylesScoped$(LINKS_CARD_STYLES);

  const hasImage = Boolean(logoUrl);
  const trimmedDescription = link.description?.trim() ?? "";
  const hasDescription = trimmedDescription.length > 0;
  const cardClass = `links-card${hasDescription ? " links-card--with-description" : ""}`;

  return (
    <a
      href={href}
      class={cardClass}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      {hasImage && (
        <div class="links-card__thumb">
          <img
            src={logoUrl ?? ""}
            alt={link.title ?? link.url ?? "Link thumbnail"}
            width={60}
            height={60}
            loading="lazy"
          />
        </div>
      )}
      <div class={`links-card__content${hasImage ? " links-card__content--with-thumb" : ""}`}>
        <h3 class="links-card__title">{link.title ?? link.url ?? "Untitled link"}</h3>
        {hasDescription && (
          <p class="links-card__description">{trimmedDescription}</p>
        )}
      </div>
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="links-card__icon"
      >
        <path
          d="M2.4375 12.6528L12.4375 2.65283M12.4375 2.65283H2.4375M12.4375 2.65283V12.6528"
          stroke="var(--text-primary)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </a>
  );
});

export default LinksCard;
