/// <reference lib="webworker" />

/**
 * Phase 20 — Custom service worker (PLAN.md).
 *
 * Replaces the default vite-plugin-pwa generated SW so we can wire a
 * `push` event handler for Web Push notifications. The Workbox pieces
 * we used before (precache + runtime caches) are reimplemented here.
 *
 * IMPORTANT: this file is compiled by Workbox's `injectManifest` — the
 * literal call `precacheAndRoute(self.__WB_MANIFEST)` is replaced at
 * build time with the actual asset manifest. Don't rename the symbol.
 */

import type { PushPayload } from "@chat/shared-types";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

const APP_ICON = "/icons/icon-192.png";
const IMAGE_URL = /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp)$/;
const USERS_API = /^\/api\/users/;
const NAV_DENY_API = /^\/api\//;
const NAV_DENY_SOCKET = /^\/socket\.io\//;

// ─── Precache + activation ──────────────────────────────────────────────
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback — every navigation request not destined for
// the API or socket tunnel falls back to the cached index.html so deep
// links work offline.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [NAV_DENY_API, NAV_DENY_SOCKET],
  })
);

// Image cache — long-lived, capped.
registerRoute(
  ({ url }) => IMAGE_URL.test(url.href),
  new CacheFirst({
    cacheName: "images",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

// /api/users — stale-while-network. Other API endpoints intentionally
// uncached (auth-sensitive).
registerRoute(
  ({ url }) => USERS_API.test(url.pathname),
  new NetworkFirst({
    cacheName: "api-users",
    networkTimeoutSeconds: 3,
  })
);

// ─── Web Push (Phase 20) ────────────────────────────────────────────────
// On a push event:
//   1. Decode the payload (validated server-side; we still narrow).
//   2. Check whether any client window of this origin is alive — if so,
//      the in-tab `Notification` API handler in useSocket has already
//      fired, so the OS notification would be a duplicate. Skip showing.
//   3. Otherwise, call `showNotification` with the right title/body/icon
//      and a tag for OS-level dedup of same-sender bursts.

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    // Malformed payload — Web Push allows binary; we only send JSON.
    return;
  }

  event.waitUntil(handlePush(payload));
});

async function handlePush(payload: PushPayload): Promise<void> {
  // If any client window is open AND focused, the in-tab notification
  // path has already handled this event. If clients exist but none are
  // focused (e.g. user has the app in a background tab), we DO show the
  // OS notif so the user sees it without switching tabs.
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const someFocused = clients.some((c) => c.focused);
  if (someFocused) {
    return;
  }

  const title = payload.kind === "message" ? payload.senderName : "Missed call";
  const body =
    payload.kind === "message"
      ? payload.body
      : `${payload.senderName} tried to call you`;

  await self.registration.showNotification(title, {
    body,
    icon: payload.iconUrl ?? APP_ICON,
    badge: APP_ICON,
    tag: `notif:${payload.kind}:${payload.senderId}`,
    data: { threadUrl: payload.threadUrl },
    // Vibrate on devices that support it (Android Chrome).
    // Two short pulses — feels like a message ping, not a phone call.
    // (Types omit `vibrate` on the strict NotificationOptions; cast.)
  } as NotificationOptions);
}

// ─── Notification click ─────────────────────────────────────────────────
// Focus an existing client if one is on the right URL, otherwise open
// a new window. Mirrors what most chat apps do.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { threadUrl?: string } | undefined;
  const targetUrl = data?.threadUrl ?? "/";
  event.waitUntil(focusOrOpen(targetUrl));
});

async function focusOrOpen(path: string): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  // Prefer focusing an existing client and navigating it; that keeps
  // the user's app state (auth, sockets) instead of spawning a new tab.
  for (const client of clients) {
    if ("navigate" in client && "focus" in client) {
      await client.navigate(path).catch(() => undefined);
      await client.focus();
      return;
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(path);
  }
}
