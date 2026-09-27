import { component$, useStylesScoped$, useVisibleTask$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, shadows } = designSystem;

const CARD_RADIUS = "0.75rem";
const LOGO_SIZE = "3.25rem";

// Platform logos (SVG data URIs or icon components)
const PLATFORM_LOGOS: Record<string, string> = {
  instagram: "#E4405F",
  youtube: "#FF0000",
  twitter: "#1DA1F2",
  tiktok: "#000000",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  pinterest: "#E60023",
  snapchat: "#FFFC00",
  threads: "#000000",
  reddit: "#FF4500",
  spotify: "#1DB954",
};

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "Twitter/X",
  tiktok: "TikTok",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  threads: "Threads",
  reddit: "Reddit",
  spotify: "Spotify",
};

const FEED_CARD_STYLES = `
  .feed-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    border-radius: ${CARD_RADIUS};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    text-decoration: none;
    color: inherit;
  }
  
  @media (max-width: 768px) {
    .feed-card {
      padding: 0.75rem;
    }
  }

  .feed-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .feed-card__platform {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .feed-card__logo {
    width: ${LOGO_SIZE};
    height: ${LOGO_SIZE};
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: ${shadows.sm};
  }

  .feed-card__platform-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .feed-card__platform-name {
    margin: 0;
    font-size: ${typography.sizes.lg};
    font-weight: ${typography.weights.bold};
    line-height: 1.2;
    color: var(--text-primary);
  }

  .feed-card__username {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    line-height: 1.2;
  }

  .feed-card__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 1rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background-color: var(--text-primary);
    color: var(--surface-2);
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    text-decoration: none;
    transition: opacity 0.2s;
    border: none;
    cursor: pointer;
    white-space: nowrap;
  }

  .feed-card__button:hover {
    opacity: 0.9;
  }

  .feed-card__button-icon {
    width: 1rem;
    height: 1rem;
  }

  .feed-card__grid {
    display: grid;
    gap: 0.75rem;
  }

  .feed-card__grid--3 {
    grid-template-columns: repeat(3, 1fr);
  }

  .feed-card__grid--2col {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .feed-card__grid--2x2 {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
  }
  
  .feed-card__grid--1col {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .feed-card__post {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%; /* 16:9 aspect ratio for videos */
    border-radius: 0.5rem;
    overflow: hidden;
    background-color: var(--surface-3);
  }
  
  .feed-card__grid--3 .feed-card__post:not(.feed-card__post--instagram) {
    padding-bottom: 180%;
  }
  
  .feed-card__grid--3 .feed-card__post--instagram {
    width: 136px !important;
    height: 244px !important;
    padding-bottom: 0 !important;
    min-height: 244px !important;
    max-height: 244px !important;
  }
  
  @media (max-width: 768px) {
    .feed-card__grid--3 .feed-card__post--instagram {
      width: 102.5px !important;
      height: 184px !important;
      min-height: 184px !important;
      max-height: 184px !important;
    }
  }
  
  .feed-card__grid--2x2 .feed-card__post {
    padding-bottom: 56.25%; /* 16:9 aspect ratio for YouTube videos */
  }
  
  .feed-card__grid--2col .feed-card__post {
    padding: 0;
    margin: 0;
    height: 16rem;
    max-height: 16rem;
    width: 210px;
    max-width: 210px;
  }
  
  @media (max-width: 768px) {
    .feed-card__grid--2col .feed-card__post {
      width: 160px;
      max-width: 160px;
    }
    
    .feed-card__post--twitter > div > div,
    .feed-card__post--facebook > div > div,
    .feed-card__post--pinterest > div > div,
    .feed-card__post--reddit > div > div,
    .feed-card__post--threads > div > div {
      transform: scale(0.65) !important;
    }
    
    .feed-card__post--linkedin > div > div {
      transform: scale(0.45) !important;
    }
  }
  
  .feed-card__grid--1col .feed-card__post {
    padding-bottom: 0;
    height: 80px;
    max-height: 80px;
  }
  
  .feed-card__post--instagram {
    background-color: #000;
    overflow: hidden;
  }
  
  .feed-card__post--tiktok {
    background-color: #000;
    overflow: hidden;
  }
  
  .feed-card__post--twitter,
  .feed-card__post--linkedin,
  .feed-card__post--facebook,
  .feed-card__post--pinterest,
  .feed-card__post--reddit,
  .feed-card__post--threads {
    background-color: transparent;
    overflow: hidden;
    width: 100%;
  }
  
  .feed-card__post--twitter > div,
  .feed-card__post--linkedin > div,
  .feed-card__post--facebook > div,
  .feed-card__post--pinterest > div,
  .feed-card__post--reddit > div,
  .feed-card__post--threads > div {
    position: absolute;
    inset: 0;
    width: 100%;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
  }
  
  .feed-card__post--twitter > div > div,
  .feed-card__post--facebook > div > div,
  .feed-card__post--pinterest > div > div,
  .feed-card__post--reddit > div > div,
  .feed-card__post--threads > div > div {
    transform: scale(0.85);
    transform-origin: top left;
    width: max-content;
  }
  
  .feed-card__post--linkedin > div {
    position: absolute;
    inset: 0;
    width: 100%;
    overflow: hidden;
  }
  
  .feed-card__post--linkedin > div > div {
    transform: scale(0.6);
    transform-origin: top left;
    width: max-content;
  }
  
  .feed-card__post--twitter .twitter-tweet-rendered {
    margin: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
  
  .feed-card__post--instagram {
    background-color: #000;
    overflow: hidden;
    position: relative;
  }
  
  .feed-card__post--instagram .ig-shift {
    position: absolute;
    width: 100%;
    top: -80px;
  }
  
  .feed-card__post--instagram .ig-scale {
    transform: scale(1.45);
    transform-origin: top center;
    width: 100%;
  }
  
  .feed-card__post--instagram iframe {
    width: 100%;
    height: 1000px;
    border: 0;
    display: block;
  }
  
  .feed-card__post--tiktok > div {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden !important;
  }
  
  .feed-card__post--instagram iframe {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border: none !important;
    transform: scale(1) !important;
    transform-origin: top left !important;
  }
  
  .feed-card__post--tiktok iframe {
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 100% !important;
    border: none !important;
    display: block !important;
  }

  .feed-card__post-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }
`;

interface FeedCardProps {
  link: PageSettingsLinkItem;
  href: string;
  platformName: string | null;
  postUrls: string[] | null;
  onNavigate$?: PropFunction<() => void>;
}

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const FeedCard = component$<FeedCardProps>(({ link, href, platformName, postUrls, onNavigate$ }) => {
  useStylesScoped$(FEED_CARD_STYLES);

  const title = sanitizeText(link.title) ?? "@username";
  
  // ALWAYS read from link object directly - props may not be passed correctly
  const resolvedPlatform = (link as any).platform_name || platformName;
  const resolvedPosts = (link as any).post_url || postUrls;
  
  // Load embed scripts for Instagram, TikTok, Twitter
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => resolvedPlatform);
    
    const platform = resolvedPlatform?.toLowerCase();
    
    if (platform === "instagram") {
      // Instagram now uses iframe, no script needed
    } else if (platform === "tiktok") {
      const existingScript = document.querySelector('script[src*="tiktok.com/embed.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://www.tiktok.com/embed.js';
        script.async = true;
        document.body.appendChild(script);
      }
    } else if (platform === "twitter") {
      const existingScript = document.querySelector('script[src*="platform.twitter.com/widgets.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://platform.twitter.com/widgets.js';
        script.async = true;
        script.charset = 'utf-8';
        document.body.appendChild(script);
      } else if ((window as any).twttr) {
        (window as any).twttr.widgets.load();
      }
    } else if (platform === "pinterest") {
      const existingScript = document.querySelector('script[src*="assets.pinterest.com/js/pinit.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://assets.pinterest.com/js/pinit.js';
        script.async = true;
        document.body.appendChild(script);
      }
    } else if (platform === "reddit") {
      const existingScript = document.querySelector('script[src*="embed.reddit.com/widgets.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://embed.reddit.com/widgets.js';
        script.async = true;
        document.body.appendChild(script);
      }
    } else if (platform === "threads") {
      const existingScript = document.querySelector('script[src*="threads.net/embed.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://www.threads.net/embed.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }
  });
  const platform = (resolvedPlatform?.toLowerCase() || "instagram").trim();
  const displayName = PLATFORM_NAMES[platform] || resolvedPlatform || "Social Media";
  const logoColor = PLATFORM_LOGOS[platform] || "#000000";
  
  const posts = Array.isArray(resolvedPosts) 
    ? resolvedPosts.filter((url: string) => url && url.trim()) 
    : [];

  // Determine grid layout
  const use3Columns = ["instagram", "tiktok", "snapchat"].includes(platform);
  const useYouTube2x2 = platform === "youtube";
  const useSpotify1Col = platform === "spotify";
  
  let gridClass = "feed-card__grid--2col";
  let maxPosts = 2;
  let totalSlots = 2;
  
  if (use3Columns) {
    gridClass = "feed-card__grid--3";
    maxPosts = 3;
    totalSlots = 3;
  } else if (useYouTube2x2) {
    gridClass = "feed-card__grid--2x2";
    maxPosts = 4;
    totalSlots = 4;
  } else if (useSpotify1Col) {
    gridClass = "feed-card__grid--1col";
    maxPosts = 3;
    totalSlots = 3;
  }
  
  const displayPosts = posts.slice(0, maxPosts);
  const placeholdersNeeded = totalSlots - displayPosts.length;

  return (
    <div class="feed-card">
      <div class="feed-card__header">
        <div class="feed-card__platform">
          <div 
            class="feed-card__logo" 
            style={`background-color: ${logoColor};`}
          >
            <svg 
              width="32" 
              height="32" 
              viewBox="0 0 24 24" 
              fill="white"
              aria-label={displayName}
            >
              {platform === "instagram" && (
                <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 01-1.153 1.772c-.5.509-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 01-1.772-1.153 4.904 4.904 0 01-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 011.153-1.772A4.897 4.897 0 015.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 100 10 5 5 0 000-10zm6.5-.25a1.25 1.25 0 10-2.5 0 1.25 1.25 0 002.5 0zM12 9a3 3 0 110 6 3 3 0 010-6z"/>
              )}
              {platform === "youtube" && (
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              )}
              {platform === "tiktok" && (
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="white"/>
              )}
              {platform === "snapchat" && (
                <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3 0 .719-.179 1.002-.329.18-.09.344-.149.465-.149.494 0 .747.508.747.868 0 .467-.307.866-.868 1.028-.85.224-1.624.9-1.624 2.047 0 .825.627 1.654 1.878 2.498 1.434.967 2.249 2.039 2.249 2.939 0 1.313-.99 2.318-2.636 2.676-.196.046-.388.09-.573.134-.228.06-.442.117-.647.182-.451.148-.697.35-.955.666-.105.139-.239.315-.407.551-.115.164-.32.415-.658.91-.176.259-.389.543-.618.832-.59.748-1.259 1.596-2.247 2.198-.579.354-1.365.535-2.336.535-.784 0-1.543-.104-2.24-.315-.405-.12-.832-.239-1.213-.349-.453-.129-.862-.245-1.202-.329-.614-.152-1.123-.259-1.606-.259-.59 0-1.002.157-1.327.329-.251.134-.499.299-.75.462-.239.15-.479.299-.747.44-.45.239-1.05.434-1.664.434-.104 0-.209 0-.313-.015C1.086 23.521 0 22.506 0 21.117c0-.9.814-2.039 2.249-2.939 1.251-.843 1.878-1.672 1.878-2.498 0-1.146-.774-1.822-1.624-2.046-.561-.163-.868-.562-.868-1.029 0-.36.254-.868.747-.868.12 0 .284.06.465.15.283.149.701.328 1.002.328.198 0 .326-.045.401-.09-.008-.164-.018-.33-.03-.51l-.002-.06c-.105-1.628-.23-3.654.298-4.847 1.583-3.545 4.94-3.821 5.93-3.821z" fill="white"/>
              )}
              {platform === "spotify" && (
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" fill="white"/>
              )}
              {platform === "twitter" && (
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="white"/>
              )}
              {platform === "linkedin" && (
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="white"/>
              )}
              {(platform === "facebook" || platform === "pinterest" || platform === "threads" || platform === "reddit" || (!PLATFORM_LOGOS[platform] && platform !== "twitter" && platform !== "linkedin")) && (
                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
              )}
            </svg>
          </div>
          <div class="feed-card__platform-info">
            <h3 class="feed-card__platform-name">{displayName}</h3>
            <p class="feed-card__username">{title}</p>
          </div>
        </div>
        <a 
          href={href} 
          class="feed-card__button"
          target="_blank"
          rel="noopener noreferrer"
          onClick$={onNavigate$}
        >
          Open
          <svg class="feed-card__button-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
            <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
          </svg>
        </a>
      </div>
      
      <div class={`feed-card__grid ${gridClass}`}>
        {displayPosts.map((postUrl, index) => {
          // YouTube embed
          if (platform === "youtube") {
            // postUrl is already the clean video ID
            if (postUrl) {
              return (
                <div key={`post-${index}`} class="feed-card__post">
                  <iframe
                    src={`https://www.youtube.com/embed/${postUrl}`}
                    title={`YouTube video ${index + 1}`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullscreen
                    style="position: absolute; inset: 0; width: 100%; height: 100%; border: none;"
                    loading="lazy"
                  />
                </div>
              );
            }
          }
          
          // Instagram embed
          if (platform === "instagram") {
            // postUrl is just the ID - /p/ works for both posts and reels
            if (postUrl) {
              const finalUrl = `https://www.instagram.com/p/${postUrl}/embed/`;
              
              const inlineHTML = `
                <div style="position: absolute; width: 100%; top: -80px;">
                  <div style="transform: scale(1.45); transform-origin: top center; width: 100%;">
                    <iframe src="${finalUrl}" scrolling="no" frameborder="0" allowfullscreen title="Instagram post" style="width: 100%; height: 1000px; border: 0; display: block;"></iframe>
                  </div>
                </div>
              `;
              
              return (
                <div 
                  key={`post-${index}`} 
                  class="feed-card__post feed-card__post--instagram" 
                  style="width: 136px; height: 244px; overflow: hidden; position: relative; padding-bottom: 0; background-color: #000;"
                  dangerouslySetInnerHTML={inlineHTML}
                />
              );
            }
          }
          
          // TikTok embed
          if (platform === "tiktok") {
            // postUrl is already the clean video ID
            if (postUrl) {
              return (
                <div key={`post-${index}`} class="feed-card__post feed-card__post--tiktok">
                  <div 
                    style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;"
                    dangerouslySetInnerHTML={`<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@username/video/${postUrl}" data-video-id="${postUrl}" style="width: 100% !important; height: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important;"><section></section></blockquote>`}
                  />
                </div>
              );
            }
          }
          
          // Twitter/X embed
          if (platform === "twitter") {
            // postUrl is already the clean tweet ID
            if (postUrl) {
              return (
                <div key={`post-${index}`} class="feed-card__post feed-card__post--twitter">
                  <div>
                    <div dangerouslySetInnerHTML={`<blockquote class="twitter-tweet" data-theme="dark" data-dnt="true"><a href="https://twitter.com/i/status/${postUrl}"></a></blockquote>`} />
                  </div>
                </div>
              );
            }
          }
          
          // LinkedIn embed
          if (platform === "linkedin") {
            // postUrl is already the clean URN
            if (postUrl) {
              return (
                <div key={`post-${index}`} class="feed-card__post feed-card__post--linkedin">
                  <div>
                    <div dangerouslySetInnerHTML={`<iframe src="https://www.linkedin.com/embed/feed/update/${postUrl}?collapsed=1" height="670" width="350" frameborder="0" allowfullscreen="" title="Embedded post" style="border:none;"></iframe>`} />
                  </div>
                </div>
              );
            }
          }
          
          // Facebook embed
          if (platform === "facebook") {
            return (
              <div key={`post-${index}`} class="feed-card__post feed-card__post--facebook">
                <div>
                  <div dangerouslySetInnerHTML={`<iframe src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(postUrl)}&width=500&show_text=true" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true"></iframe>`} />
                </div>
              </div>
            );
          }
          
          // Pinterest embed
          if (platform === "pinterest") {
            return (
              <div key={`post-${index}`} class="feed-card__post feed-card__post--pinterest">
                <div>
                  <div dangerouslySetInnerHTML={`<a data-pin-do="embedPin" href="${postUrl}"></a>`} />
                </div>
              </div>
            );
          }
          
          // Reddit embed
          if (platform === "reddit") {
            return (
              <div key={`post-${index}`} class="feed-card__post feed-card__post--reddit">
                <div>
                  <div dangerouslySetInnerHTML={`<blockquote class="reddit-embed-bq"><a href="${postUrl}"></a></blockquote>`} />
                </div>
              </div>
            );
          }
          
          // Threads embed
          if (platform === "threads") {
            return (
              <div key={`post-${index}`} class="feed-card__post feed-card__post--threads">
                <div>
                  <div dangerouslySetInnerHTML={`<blockquote class="text-post-media" data-text-post-permalink="${postUrl}"><a href="${postUrl}"></a></blockquote>`} />
                </div>
              </div>
            );
          }
          
          // Spotify embed
          if (platform === "spotify") {
            // postUrl is already in format "type/id" (e.g., "track/123abc")
            const parts = postUrl.split('/');
            if (parts.length === 2) {
              const [type, id] = parts;
              return (
                <div key={`post-${index}`} class="feed-card__post">
                  <iframe
                    src={`https://open.spotify.com/embed/${type}/${id}?utm_source=generator`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    style="position: absolute; inset: 0; border-radius: 0.5rem;"
                  />
                </div>
              );
            }
          }
          
          // Snapchat embed (show as link for now)
          if (platform === "snapchat") {
            return (
              <a
                key={`post-${index}`}
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="feed-card__post"
              >
                <span class="feed-card__post-placeholder">Snap {index + 1}</span>
              </a>
            );
          }
          
          // For other platforms or invalid URLs, show a link
          return (
            <a
              key={`post-${index}`}
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="feed-card__post"
            >
              <span class="feed-card__post-placeholder">Post {index + 1}</span>
            </a>
          );
        })}
        {Array.from({ length: placeholdersNeeded }).map((_, index) => (
          <div key={`placeholder-${index}`} class="feed-card__post">
            <span class="feed-card__post-placeholder">•</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default FeedCard;
