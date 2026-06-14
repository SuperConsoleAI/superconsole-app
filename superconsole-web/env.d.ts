/// <reference types="vite/client" />

// Cloudflare Worker environment bindings (secrets/vars).
// Local values come from .dev.vars; production from `wrangler secret put`.
declare module "cloudflare:workers" {
  interface Env {
    WORKOS_API_KEY: string;
    WORKOS_CLIENT_ID: string;
    WORKOS_COOKIE_PASSWORD: string;
    WORKOS_REDIRECT_URI: string;
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
  }
  export const env: Env;
}
