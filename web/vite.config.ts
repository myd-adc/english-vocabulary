import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // New service worker activates at once and the page reloads, so a deploy shows up right away.
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Dicktionary",
        short_name: "Dicktionary",
        description: "Особистий англо-український словник з автоперекладом і темами",
        lang: "uk",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f2f3ef",
        theme_color: "#f2f3ef",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        navigateFallback: "/index.html",
        // API, MCP/OAuth and health traffic is always live, never answered from the shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/mcp/, /^\/\.well-known\//, /^\/health/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  css: { modules: { localsConvention: "camelCase" } },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
