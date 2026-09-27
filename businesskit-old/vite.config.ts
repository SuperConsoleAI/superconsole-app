/**
 * vite.config.ts — BusinessKit Tauri App
 *
 * Uses Qwik City static adapter (pre-renders HTML → Tauri webview loads it).
 * Tailwind v4 via @tailwindcss/vite — no postcss config needed.
 * Tauri dev server runs at http://localhost:5173 (macOS) or 5174 (iOS)
 * Set VITE_PORT=5174 to run on a different port.
 */
import { defineConfig } from "vite";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { qwikCity } from "@builder.io/qwik-city/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(() => {
  const port = parseInt(process.env.VITE_PORT ?? "5173", 10);
  return {
    plugins: [
      tailwindcss(),          // Tailwind v4 — must come before qwikCity
      qwikCity(),
      qwikVite(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
    ],
    server: {
      host: true, // Listen on all network interfaces (0.0.0.0) required for iOS physical devices
      port,
      strictPort: true,
      headers: {
        "Cache-Control": "public, max-age=0",
      },
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
    preview: {
      headers: {
        "Cache-Control": "public, max-age=600",
      },
    },
  };
});
