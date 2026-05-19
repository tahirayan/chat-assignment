/// <reference types='vitest' />

import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Inject `<link rel="modulepreload">` for the two first-screen route
 * chunks so they're fetched in parallel with the main JS bundle instead
 * of after. Vite skips dynamic-import chunks in its automatic preload
 * because they're not in the static module graph — but for routes that
 * an unauthenticated (AuthView) or authenticated (ChatsView) user hits
 * immediately, the second-round-trip is on the critical path. Preloading
 * collapses the chain depth.
 */
function preloadFirstScreenRoutes(): Plugin {
  const TARGETS = ["AuthView", "ChatsView"];

  return {
    name: "preload-first-screen-routes",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) {
          return [];
        }
        return Object.values(bundle)
          .filter(
            (chunk) =>
              chunk.type === "chunk" &&
              TARGETS.some((t) => chunk.fileName.includes(`${t}-`))
          )
          .map((chunk) => ({
            tag: "link",
            attrs: {
              rel: "modulepreload",
              crossorigin: "",
              href: `/${chunk.fileName}`,
            },
            injectTo: "head" as const,
          }));
      },
    },
  };
}

const isVitest = Boolean(process.env.VITEST);

export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  cacheDir: "../../node_modules/.vite/apps/web",
  // Read .env / .env.local from the workspace root so the api and web
  // share one source of truth in dev. Vite still respects per-mode
  // overrides — drop a per-app .env.local if you ever need to fork.
  envDir: "../..",
  server: {
    port: 4200,
    host: "localhost",
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4300,
    host: "localhost",
  },
  plugins: [
    vue(),
    tailwindcss(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(["*.md"]),
    preloadFirstScreenRoutes(),
    // VitePWA's injectManifest plugin resolves asset URLs during the
    // transform pipeline; in vitest (jsdom) that resolution fails for
    // the `/icons/*` paths because there's no real server. Skip the
    // plugin entirely under the test mode — the SW isn't exercised in
    // unit tests anyway.
    ...(isVitest || mode === "test"
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            // Phase 20: switched from `generateSW` to `injectManifest` so we
            // can ship a custom service worker with a `push` event handler.
            // Workbox precaching + runtime caches are still applied via
            // `src/sw.ts` calling into workbox primitives directly.
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.ts",
            includeAssets: [
              "favicon.svg",
              "favicon.ico",
              "apple-touch-icon.png",
            ],
            devOptions: { enabled: false },
            manifest: {
              name: "Lylia Chat",
              short_name: "Lylia",
              description: "Real-time chat with audio and video calls",
              theme_color: "#5b6bf0",
              background_color: "#ffffff",
              display: "standalone",
              orientation: "portrait",
              scope: "/",
              start_url: "/",
              icons: [
                {
                  src: "/icons/icon-192.png",
                  sizes: "192x192",
                  type: "image/png",
                },
                {
                  src: "/icons/icon-512.png",
                  sizes: "512x512",
                  type: "image/png",
                },
                {
                  src: "/icons/icon-512-maskable.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "maskable",
                },
              ],
            },
            injectManifest: {
              // Skip caching of source-maps to keep the precache lean.
              globIgnores: ["**/*.map"],
              // Larger payload than the default to accommodate the AuthView
              // chunk (vee-validate is heavy).
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
          }),
        ]),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: "../../dist/apps/web",
    emptyOutDir: true,
    reportCompressedSize: true,
    // Modern browsers only — also enables top-level await in main.ts for
    // the pre-mount locale-load (esbuild errors out otherwise).
    target: "es2022",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        // Vendor-split for cache stability: framework code rarely changes
        // between deploys, so isolating it in its own chunk means a typo
        // fix doesn't bust 100 KB of cached vue/pinia/router code.
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }
          if (
            id.includes("/vue/") ||
            id.includes("/@vue/") ||
            id.includes("/vue-router/") ||
            id.includes("/pinia/") ||
            id.includes("/vue-i18n/") ||
            id.includes("/@intlify/")
          ) {
            return "vendor-vue";
          }
          if (
            id.includes("/socket.io-client/") ||
            id.includes("/engine.io-client/")
          ) {
            return "vendor-socketio";
          }
          if (id.includes("/axios/")) {
            return "vendor-http";
          }
          return;
        },
      },
    },
  },
  test: {
    name: "web",
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/web",
      provider: "v8" as const,
    },
  },
}));
