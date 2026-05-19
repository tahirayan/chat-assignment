/**
 * Phase 20 — Web Push subscription orchestration.
 *
 * Public API:
 *   useWebPush().subscribe()   — register the service worker (if not
 *                                 already), create a PushSubscription,
 *                                 POST it to /api/push/subscribe.
 *   useWebPush().unsubscribe() — drop the current subscription locally
 *                                 + DELETE it from the server.
 *
 * Idempotent: calling subscribe twice in a row is a no-op (second call
 * sees the existing subscription and reposts it, which the server
 * upserts cleanly).
 *
 * The browser owns the subscription identity (the `endpoint` URL) — we
 * just persist it server-side so the api can later push to it.
 */

import type { PushSubscribeRequest } from "@chat/shared-types";
import { api } from "../api/client";

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ??
  "") as string;

let pending: Promise<PushSubscription | null> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

function isSupported(): boolean {
  return (
    isBrowser() &&
    "PushManager" in window &&
    "Notification" in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

/**
 * The Web Push spec requires the applicationServerKey as a Uint8Array
 * derived from a base64url-encoded VAPID public key. The browser's
 * `atob` only handles standard base64, so we pad and swap the URL-safe
 * chars first.
 */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isBrowser()) {
    return null;
  }
  // VitePWA's registerType: autoUpdate registers the SW automatically;
  // we just await it being ready.
  return await navigator.serviceWorker.ready;
}

function toSubscribeRequest(sub: PushSubscription): PushSubscribeRequest {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      // PushSubscription.toJSON().keys exists when the subscription has
      // been created via subscribe() — undefined would only happen on
      // a malformed object, which we treat as a fatal error.
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

export function useWebPush(): {
  isSupported: () => boolean;
  subscribe: () => Promise<PushSubscription | null>;
  unsubscribe: () => Promise<void>;
} {
  function subscribe(): Promise<PushSubscription | null> {
    if (!isSupported()) {
      return Promise.resolve(null);
    }
    // Single-flight: if subscribe is called twice in quick succession
    // (e.g. consent banner + Profile toggle on the same render), share
    // the in-flight result.
    if (pending) {
      return pending;
    }
    pending = (async () => {
      try {
        const reg = await getRegistration();
        if (!reg) {
          return null;
        }
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          // TS 5.9 narrowed the applicationServerKey overload to
          // BufferSource — `Uint8Array<ArrayBuffer>` qualifies but the
          // inferred return of our helper is `Uint8Array<ArrayBufferLike>`.
          // Allocate a fresh ArrayBuffer and copy in to satisfy the type.
          const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          const buffer = new ArrayBuffer(keyBytes.byteLength);
          new Uint8Array(buffer).set(keyBytes);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: buffer,
          });
        }
        const body = toSubscribeRequest(sub);
        if (!(body.keys.p256dh && body.keys.auth)) {
          return null;
        }
        await api.post("/push/subscribe", body);
        return sub;
      } catch (err) {
        window.console.warn("[web-push] subscribe failed", err);
        return null;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  async function unsubscribe(): Promise<void> {
    if (!isSupported()) {
      return;
    }
    try {
      const reg = await getRegistration();
      if (!reg) {
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        return;
      }
      const endpoint = sub.endpoint;
      // Best-effort: drop the server row first (using the still-valid
      // bearer token), then unsubscribe locally. If we did it the other
      // way and the local unsubscribe succeeded but the DELETE failed,
      // we'd leave a stale row that'd be cleaned up by 410-gone on the
      // next push attempt anyway — but the explicit DELETE is faster.
      await api
        .delete("/push/subscribe", { params: { endpoint } })
        .catch(() => undefined);
      await sub.unsubscribe();
    } catch (err) {
      window.console.warn("[web-push] unsubscribe failed", err);
    }
  }

  return { isSupported, subscribe, unsubscribe };
}
