import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { borderRadius } = designSystem;

const GALLERY_CARD_STYLES = `
  .gallery-card {
    display: block;
    position: relative;
    overflow: hidden;
    border-radius: ${borderRadius.lg};
    background-color: transparent;
    text-decoration: none;
    color: inherit;
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .gallery-card__image {
    display: block;
    width: 100%;
    height: auto;
  }

  .gallery-card__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 10rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: repeating-linear-gradient(
      45deg,
      rgba(0, 0, 0, 0.05),
      rgba(0, 0, 0, 0.05) 15px,
      rgba(0, 0, 0, 0.08) 15px,
      rgba(0, 0, 0, 0.08) 30px
    );
  }
`;

interface GalleryCardProps {
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

export const GalleryCard = component$<GalleryCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(GALLERY_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.description) ?? "Gallery item";
  const rawWidth = typeof link.image_width === "number" ? link.image_width : null;
  const rawHeight = typeof link.image_height === "number" ? link.image_height : null;
  const fallbackWidth = 800;
  const fallbackHeight = 600;
  const width = rawWidth && rawWidth > 0 ? rawWidth : fallbackWidth;
  const height = rawHeight && rawHeight > 0 ? rawHeight : Math.round((width / fallbackWidth) * fallbackHeight);

  return (
    <a
      class="gallery-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      {imageUrl ? (
        <img
          class="gallery-card__image"
          src={imageUrl}
          alt={title}
          loading="lazy"
          width={width}
          height={height}
        />
      ) : (
        <span class="gallery-card__placeholder">No image available</span>
      )}
    </a>
  );
});

export default GalleryCard;
