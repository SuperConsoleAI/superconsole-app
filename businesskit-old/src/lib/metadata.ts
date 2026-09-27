export interface LinkMetadata {
  title: string;
  description: string;
  image: string;
  logo: string;
  favicon: string;
  url: string;
  domain: string;
  imageType?: "logo" | "og_image";
}

export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function fetchMetadata(url: string): Promise<LinkMetadata | null> {
  const normalizedUrl = normalizeUrl(url);
  const domain = extractDomain(normalizedUrl);

  if (!isValidUrl(normalizedUrl)) {
    return null;
  }

  try {
    const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(normalizedUrl)}`);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as any;
    if (payload.status !== "success" || !payload.data) {
      return null;
    }

    const metadata = payload.data;
    const image = (() => {
      if (!metadata?.image) return "";
      if (typeof metadata.image === "string") return metadata.image;
      if (typeof metadata.image.url === "string") return metadata.image.url;
      return "";
    })();

    const logo = (() => {
      if (!metadata?.logo) return "";
      if (typeof metadata.logo === "string") return metadata.logo;
      if (typeof metadata.logo.url === "string") return metadata.logo.url;
      return "";
    })();

    const faviconUrl = logo || `https://logo.clearbit.com/${domain}`;
    const brandfetchLogo = await fetchBrandfetchLogo(domain);
    
    return {
      title: metadata.title || domain || normalizedUrl,
      description: metadata.description || "",
      image,
      logo: brandfetchLogo,
      favicon: faviconUrl,
      url: normalizedUrl,
      domain,
      imageType: image ? "og_image" : undefined,
    };
  } catch (error) {
    console.error("Metadata fetch failed", error);
    return null;
  }
}

async function fetchBrandLogo(domain: string): Promise<string | null> {
  if (!domain) return null;
  const logoUrl = `https://logo.clearbit.com/${domain}`;

  try {
    const headResponse = await fetch(logoUrl, { method: "HEAD" });
    if (headResponse.ok) {
      return logoUrl;
    }
  } catch (error) {
    console.error("Brand logo fetch failed", error);
  }
  return null;
}

async function fetchBrandfetchLogo(domain: string): Promise<string> {
  if (!domain) return "";
  return `https://cdn.brandfetch.io/${domain}/w/400/h/400?c=1idAxtQe8Wa3NlwkzTG`;
}

export async function fetchEnhancedMetadata(url: string, categorySlug: string): Promise<LinkMetadata | null> {
  const metadata = await fetchMetadata(url);
  if (!metadata) {
    return null;
  }

  // For links/tools: brand logo → logo field (logo_url), keep OG image as-is (image_url)
  if (categorySlug === "links" || categorySlug === "tools") {
    const brandLogo = await fetchBrandLogo(metadata.domain);
    if (brandLogo) {
      return {
        ...metadata,
        logo: brandLogo,          // → logo_url
        imageType: "logo",
      };
    }
  }

  return {
    ...metadata,
    imageType: metadata.image ? "og_image" : metadata.imageType,
  };
}
