import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA, type ManifestOptions } from "vite-plugin-pwa";

// The Web App Manifest, including File Handling (open .flexova files from the OS on desktop Chromium).
const manifest: Partial<ManifestOptions> & Record<string, unknown> = {
  name: "FlexPad",
  short_name: "FlexPad",
  description: "Read Flexova documents on any device, online or offline.",
  id: "/",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0b5fff",
  icons: [
    { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  file_handlers: [{ action: "/", accept: { "application/vnd.flexova+zip": [".flexova"] } }],
  launch_handler: { client_mode: "focus-existing" },
};

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** The commit being built, for the AGPL source offer: Cloudflare Pages, then GitHub Actions, then git. */
function commit(): string {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  define: {
    __FLEXPAD_VERSION__: JSON.stringify(version),
    __FLEXPAD_COMMIT__: JSON.stringify(commit()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/*"],
      manifest,
      workbox: {
        // Precache the app shell only; documents live in the library (IndexedDB), never in the SW cache.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        globIgnores: ["samples/**"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
