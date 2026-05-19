---
name: pwa-and-install
description: PWA configuration — vite-plugin-pwa autoUpdate, manifest (name "Chat", standalone portrait), Workbox runtime caching (CacheFirst for images, NetworkFirst for /api/users, no caching for auth/messages/conversations), Android beforeinstallprompt + iOS Safari instructional banner. Use when editing apps/web/vite.config.ts (PWA section), the manifest, apps/web/public/icons/, apps/web/src/composables/useInstallPrompt.ts, or apps/web/src/components/InstallPromptBanner.vue. Required for any Lighthouse PWA score regression.
---

# PWA — vite-plugin-pwa + Install Prompts

The PWA goal per PRD §16 is Lighthouse PWA score > 90, Android install via `beforeinstallprompt`, and an iOS Safari instructional banner.

## When to Use This Skill

- Editing `apps/web/vite.config.ts` PWA config
- Adding or changing manifest/icons
- Working on `composables/useInstallPrompt.ts` or `components/InstallPromptBanner.vue`
- Adding a Workbox runtime caching strategy

## Quick Reference

| Concern             | Choice                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| **Plugin**          | `vite-plugin-pwa` (Workbox under the hood)                              |
| **Register type**   | `autoUpdate`                                                            |
| **App name**        | `"Chat"`                                                                |
| **Display**         | `standalone`, portrait                                                  |
| **Theme color**     | `#5b6bf0` (brand-500 OKLCH → hex)                                       |
| **Icons**           | 192, 512, 512-maskable, apple-touch-icon-180                            |
| **Cache: images**   | CacheFirst, max 60 entries, 7-day expiration                            |
| **Cache: `/api/users`** | NetworkFirst with 3 s timeout                                       |
| **Cache: chat history** | DO NOT cache — must be fresh                                        |

## vite-plugin-pwa Config (PRD §16.1)

```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chat',
        short_name: 'Chat',
        description: 'Real-time chat with audio and video calls',
        theme_color: '#5b6bf0',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'images', expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^\/api\/users/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-users', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
})
```

**Do not cache** the Socket.io connection, `/api/messages/*`, `/api/conversations`, or `/api/auth/*` — they must always hit the network.

## Install Prompt — Android (PRD §16.2)

```ts
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const canInstall = ref(false)

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt.value = e as BeforeInstallPromptEvent
  canInstall.value = true
})

async function promptInstall() {
  if (!deferredPrompt.value) return
  await deferredPrompt.value.prompt()
  deferredPrompt.value = null
  canInstall.value = false
  localStorage.setItem('install-dismissed', '1')
}
```

## Install Prompt — iOS Safari

iOS Safari does not fire `beforeinstallprompt`. The PWA must show a **custom instructional banner**:

```ts
const isIOS = computed(() => /iphone|ipad|ipod/i.test(navigator.userAgent))
const isStandalone = computed(() =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true
)
```

When `isIOS && !isStandalone && !dismissed`, show a banner with "Tap the share button, then 'Add to Home Screen'". Dismissal persists in `localStorage` under `install-dismissed`.

## Banner Show Logic (PRD §16.3)

Show `InstallPromptBanner` when:

- `isMobile.value === true`
- `isStandalone.value === false`
- `localStorage.getItem('install-dismissed') !== '1'`
- AND either `canInstall.value === true` (Android/Chrome) OR `isIOS.value === true` (iOS Safari custom instructions)

## Icon Generation

Single SVG source → generated PNGs via `pwa-asset-generator` (one-off):

```bash
pnpm dlx pwa-asset-generator apps/web/public/icons/source.svg apps/web/public/icons \
  --background "#5b6bf0" \
  --opaque false \
  --maskable false \
  --type png

# Maskable separately (safe-area inset)
pnpm dlx pwa-asset-generator apps/web/public/icons/source.svg apps/web/public/icons \
  --maskable true \
  --padding "10%" \
  --background "#5b6bf0"
```

Then trim the generated set to: 192, 512, 512-maskable, apple-touch-icon-180. Commit them.

## Service Worker Behavior

- **autoUpdate**: new service worker activates on next navigation. The user doesn't see "Update available" prompts.
- **navigateFallback**: SPA routes (e.g. `/community`, `/chat/:userId`) fall back to `/index.html` so direct-loaded URLs work offline as the shell.
- **Stale-while-revalidate** for static assets (handled by Workbox default for the precache manifest).

## Offline Behavior

After first load:

- Shell loads offline (manifest + index.html cached)
- User list at `/community` shows last cached snapshot for 3 s before timing out to error state
- Chat history is **not** offline — show an error state with a retry
- Sending messages while offline is **not supported** — show a "You're offline" toast; the Socket.io client will reconnect automatically

## Checklist

- [ ] Production build serves a valid web manifest (Lighthouse PWA audit passes)
- [ ] All four icons present and correctly sized
- [ ] `navigateFallback: '/index.html'` set
- [ ] No caching of `/api/auth/*`, `/api/messages/*`, `/api/conversations`, or Socket.io
- [ ] Install banner appears on Android Chrome (verified manually)
- [ ] Install banner shows custom iOS Safari instructions (verified manually)
- [ ] Dismissal persists across reloads via localStorage

## See also

- `responsive-layout` — for banner placement and safe-area inset
- `i18n-vue-i18n` — for translating the install banner copy
- `deployment` — for the production HTTPS guarantee that PWAs require

## References

- PRD §16 PWA Configuration
- `vite-plugin-pwa` docs: https://vite-pwa-org.netlify.app/
- Workbox runtime caching strategies: https://developer.chrome.com/docs/workbox/caching-strategies-overview/
- `apps/web/vite.config.ts`
- `apps/web/src/composables/useInstallPrompt.ts`
- `apps/web/src/components/InstallPromptBanner.vue`
