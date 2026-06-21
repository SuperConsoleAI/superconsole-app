// Brandfetch Logo Link CDN. The client id is a public token meant for the
// CDN URL (no server call / secret needed) — only the richer Brand API needs
// the private key. So connector logos are just plain <img> sources.
export const BRANDFETCH_CLIENT_ID = "1id3Uccdk9ocT-mARlF";

// Connector service id -> brand domain for logo lookup.
const CONNECTOR_DOMAINS: Record<string, string> = {
  github: "github.com",
  slack: "slack.com",
  linear: "linear.app",
  gmail: "gmail.com",
  notion: "notion.so",
  jira: "atlassian.com",
  wordpress: "wordpress.com",
  stripe: "stripe.com",
  supabase: "supabase.com",
  vercel: "vercel.com",
  cloudflare: "cloudflare.com",
  openai: "openai.com",
  anthropic: "anthropic.com",
  telegram: "telegram.org",
  discord: "discord.com",
  sentry: "sentry.io",
  figma: "figma.com",
  google: "google.com",
  aws: "aws.amazon.com",
};

export function brandfetchLogo(domain: string): string {
  return `https://cdn.brandfetch.io/${domain}?c=${BRANDFETCH_CLIENT_ID}`;
}

// Google favicon service, used when the Brandfetch CDN has no logo.
export function faviconFallback(domain: string): string {
  return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64`;
}

export function connectorDomain(service: string): string | null {
  return CONNECTOR_DOMAINS[service.toLowerCase()] ?? null;
}

export function connectorLogo(service: string): string | null {
  const domain = connectorDomain(service);
  return domain ? brandfetchLogo(domain) : null;
}
