import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius, shadows } = designSystem;

const CONTENT_CARD_STYLES = `
  .content-card {
    display: flex;
    flex-direction: column;
    padding: 0;
    border-radius: ${borderRadius.lg};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    box-sizing: border-box;
    overflow: hidden;
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }

  .content-card:hover,
  .content-card:focus-visible {
    outline: none;
    box-shadow: ${shadows.md};
    transform: translateY(-1px);
  }

  .content-card__image {
    width: 100%;
    aspect-ratio: 16 / 9;
    background-color: var(--muted, #d9d9d9);
    flex-shrink: 0;
  }

  .content-card__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .content-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    flex: 1;
  }

  .content-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.25;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .content-card__excerpt {
    margin: 0;
    font-size: ${typography.sizes.xs};
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .content-card__date {
    display: none;
  }
`;

interface ContentCardProps {
  title: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  href: string;
  onNavigate$?: PropFunction<() => void>;
}

export const ContentCard = component$<ContentCardProps>(({ title, excerpt, imageUrl, href, onNavigate$ }) => {
  useStylesScoped$(CONTENT_CARD_STYLES);

  const trimmedExcerpt = excerpt?.trim() ?? "";
  const hasExcerpt = trimmedExcerpt.length > 0;
  const hasImage = Boolean(imageUrl);

  return (
    <a
      href={href}
      class="content-card"
      onClick$={onNavigate$}
    >
      {hasImage && (
        <div class="content-card__image">
          <img
            src={imageUrl ?? ""}
            alt={title}
            width={336}
            height={189}
            loading="lazy"
          />
        </div>
      )}
      <div class="content-card__body">
        <h3 class="content-card__title">{title}</h3>
        {hasExcerpt && <p class="content-card__excerpt">{trimmedExcerpt}</p>}
      </div>
    </a>
  );
});

export default ContentCard;
