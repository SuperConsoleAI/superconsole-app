import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { spacing, typography, borderRadius, shadows } = designSystem;

const TOOLS_CARD_STYLES = `
  .tools-card {
    display: flex;
    align-items: center;
    gap: ${spacing.md};
    padding: ${spacing.sm};
    border-radius: ${borderRadius.md};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
  }

  .tools-card:hover,
  .tools-card:focus-visible {
    outline: none;
  }

  .tools-card__thumb {
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

  .tools-card__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tools-card__content {
    display: flex;
    flex-direction: column;
    gap: ${spacing.xs};
    flex: 1;
    min-width: 0;
  }

  .tools-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.4;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tools-card__description {
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

interface ToolsCardProps {
  link: PageSettingsLinkItem;
  href: string;
  logoUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const ToolsCard = component$<ToolsCardProps>(({ link, href, logoUrl, onNavigate$ }) => {
  useStylesScoped$(TOOLS_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled tool";
  const description = sanitizeText(link.description);

  return (
    <a
      class="tools-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      {logoUrl ? (
        <div class="tools-card__thumb">
          <img
            src={logoUrl}
            alt={title}
            width={60}
            height={60}
            loading="lazy"
          />
        </div>
      ) : null}
      <div class="tools-card__content">
        <h3 class="tools-card__title">{title}</h3>
        {description && <p class="tools-card__description">{description}</p>}
      </div>
    </a>
  );
});

export default ToolsCard;
