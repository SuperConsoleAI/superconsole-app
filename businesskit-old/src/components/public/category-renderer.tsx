import type { PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import BooksCard from "./cards/BooksCard";
import LinksCard from "./cards/LinksCard";
import NewsletterCard from "./cards/NewsletterCard";
import GearsCard from "./cards/GearsCard";
import WearsCard from "./cards/WearsCard";
import StoreCard from "./cards/StoreCard";
import EventsCard from "./cards/EventsCard";
import CoursesCard from "./cards/CoursesCard";
import GalleryCard from "./cards/GalleryCard";
import FeaturedCard from "./cards/FeaturedCard";
import PortfolioCard from "./cards/PortfolioCard";
import DownloadsCard from "./cards/DownloadsCard";
import ToolsCard from "./cards/ToolsCard";
import ShopProductCard from "./ShopProductCard";
import FaqsCard from "./cards/FaqsCard";
import StartupsCard from "./cards/StartupsCard";
import FeedCard from "./cards/FeedCard";
import ContentCard from "./cards/ContentCard";

export type CategoryType =
  | "books"
  | "links"
  | "newsletter"
  | "gears"
  | "wears"
  | "store"
  | "events"
  | "portfolio"
  | "downloads"
  | "courses"
  | "featured"
  | "features"
  | "gallery"
  | "tools"
  | "shop"
  | "faqs"
  | "startups"
  | "feed"
  | "default";

export const resolveCategoryType = (identifier: string): CategoryType => {
  const value = identifier.trim().toLowerCase();
  if (!value) {
    return "default";
  }
  if (value.includes("shop")) return "shop";
  if (value.includes("book")) return "books";
  if (value.includes("newsletter")) return "newsletter";
  if (value.includes("gear")) return "gears";
  if (value.includes("wear")) return "wears";
  if (value.includes("store")) return "store";
  if (value.includes("event")) return "events";
  if (value.includes("portfolio")) return "portfolio";
  if (value.includes("download")) return "downloads";
  if (value.includes("course")) return "courses";
  if (value.includes("featured")) return "featured";
  if (value.includes("features")) return "features";
  if (value.includes("gallery")) return "gallery";
  if (value.includes("tool")) return "tools";
  if (value.includes("link")) return "links";
  if (value.includes("faq") || value.includes("question")) return "faqs";
  if (value.includes("startup")) return "startups";
  if (value.includes("feed")) return "feed";
  return "default";
};

export interface CategoryCardProps {
  key?: string;
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  logoUrl?: string | null;
  platformName?: string | null;
  postUrls?: string[] | null;
  onNavigate$?: PropFunction<() => void>;
  index?: number;
}

export const renderSpecializedCategoryCard = (
  type: CategoryType,
  props: CategoryCardProps,
) => {
  switch (type) {
    case "books":
      return <BooksCard key={props.key} {...props} />;
    case "links":
      return <LinksCard key={props.key} link={props.link} href={props.href} logoUrl={props.logoUrl ?? null} onNavigate$={props.onNavigate$} />;
    case "newsletter":
      return <NewsletterCard key={props.key} {...props} />;
    case "gears":
      return <GearsCard key={props.key} {...props} />;
    case "wears":
      return <WearsCard key={props.key} {...props} />;
    case "store":
      return <StoreCard key={props.key} {...props} />;
    case "events":
      return <EventsCard key={props.key} {...props} />;
    case "shop":
      return <ShopProductCard key={props.key} {...props} />;
    case "courses":
      return <CoursesCard key={props.key} {...props} />;
    case "gallery":
      return <GalleryCard key={props.key} {...props} />;
    case "featured":
      return <FeaturedCard key={props.key} {...props} logoUrl={props.logoUrl ?? null} />;
    case "features":
      return <NewsletterCard key={props.key} {...props} />;
    case "portfolio":
      return <PortfolioCard key={props.key} {...props} />;
    case "downloads":
      return <DownloadsCard key={props.key} {...props} />;
    case "tools":
      return <ToolsCard key={props.key} link={props.link} href={props.href} logoUrl={props.logoUrl ?? null} onNavigate$={props.onNavigate$} />;
    case "faqs":
      return <FaqsCard key={props.key} link={props.link} index={props.index ?? 0} />;
    case "startups":
      return <StartupsCard key={props.key} {...props} logoUrl={props.logoUrl ?? null} />;
    case "feed":
      return <FeedCard key={props.key} {...props} platformName={props.platformName ?? null} postUrls={props.postUrls ?? null} />;
    default:
      return <ContentCard key={props.key} title={props.link.title ?? ""} excerpt={props.link.description ?? null} imageUrl={props.imageUrl} href={props.href} onNavigate$={props.onNavigate$} />;
  }
};
