/**
 * Phase 19 — OS Notification API dispatch (PLAN.md).
 *
 * WhatsApp-style: an OS notification fires even when the browser tab is
 * visible, as long as the user isn't actively reading the conversation
 * that produced the event. The "am I on this thread?" decision is the
 * caller's — useSocket gates it. This composable only enforces the
 * technical preconditions:
 *   1. Permission is granted (`Notification.permission === "granted"`).
 *   2. Dedup via the `tag` field — `notif:<kind>:<senderId>` collapses
 *      a flurry from one sender into a single OS notification.
 *   3. Multi-tab dedup via BroadcastChannel — only the elected
 *      dispatcher tab actually calls `new Notification(...)`. Without
 *      this, N open tabs of the same user produce N notifications.
 *
 * Permission UX rules:
 *   - Never prompt on page load.
 *   - Prompt on first qualifying hidden-tab event, EXCEPT on Safari
 *     where `Notification.requestPermission()` requires a user gesture
 *     — there the prompt only happens through the ProfileView toggle.
 *   - A decline is sticky (`notifications:permission-dismissed`).
 *     Re-prompts only happen through the ProfileView toggle.
 */

import { ref } from "vue";

const PERMISSION_DISMISSED_KEY = "notifications:permission-dismissed";
const BROADCAST_CHANNEL = "notifications";
const DISPATCHER_PING_MS = 200;

// Hoisted regexes — Biome `useTopLevelRegex` prefers literals at module
// scope to avoid re-allocating per call.
const UA_IOS = /iPad|iPhone|iPod/;
// Negative lookahead trick: "anything-but-the-non-Safari-vendors followed by 'safari'"
const UA_SAFARI = /^((?!chrome|android|crios|fxios|edg).)*safari/i;

type Permission = "default" | "granted" | "denied" | "unsupported";

export interface DispatchPayload {
  body?: string;
  icon?: string;
  /** Used to build the OS-level tag for dedup. */
  kind: "message" | "incomingCall" | "missedCall";
  /** Called when the user clicks the notification. */
  onClick?: () => void;
  senderId: string;
  title: string;
}

const permission = ref<Permission>(detectPermission());
const dismissed = ref<boolean>(readDismissed());

// Multi-tab dispatcher election state.
let channel: BroadcastChannel | null = null;
let amDispatcher = false;
let installed = false;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function detectPermission(): Permission {
  if (!isBrowser() || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

function readDismissed(): boolean {
  if (!isBrowser()) {
    return false;
  }
  return window.localStorage.getItem(PERMISSION_DISMISSED_KEY) === "1";
}

function persistDismissed(value: boolean): void {
  if (!isBrowser()) {
    return;
  }
  if (value) {
    window.localStorage.setItem(PERMISSION_DISMISSED_KEY, "1");
  } else {
    window.localStorage.removeItem(PERMISSION_DISMISSED_KEY);
  }
  dismissed.value = value;
}

/**
 * Safari/iOS need a user-gesture caller for `requestPermission()`, and
 * iOS Safari additionally rejects the prompt outside standalone PWA mode.
 * Detection is best-effort UA sniffing + standalone check.
 */
function isAppleSafari(): boolean {
  if (!isBrowser()) {
    return false;
  }
  const ua = window.navigator.userAgent;
  const isIOS =
    UA_IOS.test(ua) ||
    (ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1);
  const isSafari = UA_SAFARI.test(ua);
  return isIOS || isSafari;
}

// Exported for future use in the ProfileView toggle UI to gate the
// iOS-Safari prompt on standalone PWA mode (Apple requires home-screen
// install before notification permission can be requested).
export function isStandalonePWA(): boolean {
  if (!isBrowser()) {
    return false;
  }
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true
  );
}

// ─── Dispatcher election ────────────────────────────────────────────────
// First tab to load installs a BroadcastChannel listener. Each tab pings
// "hello" on install; whichever ping arrives first to existing tabs wins
// dispatcher duty. New tabs that hear an existing "hello" defer.
//
// On dispatcher tab close, a "bye" message lets the next tab take over.
// Simple election that doesn't try to be perfect — worst case during a
// race window, one missed dedup. Acceptable for notifications.

interface ChannelMessage {
  ts: number;
  type: "hello" | "bye" | "claim";
}

function installDispatcherElection(): void {
  if (!isBrowser() || typeof BroadcastChannel === "undefined") {
    // Older browser — assume single tab. Always dispatch.
    amDispatcher = true;
    return;
  }
  if (installed) {
    return;
  }
  installed = true;

  channel = new BroadcastChannel(BROADCAST_CHANNEL);
  amDispatcher = true; // optimistically claim; another tab will correct us

  channel.addEventListener("message", (ev: MessageEvent<ChannelMessage>) => {
    if (!ev.data) {
      return;
    }
    if (ev.data.type === "hello" || ev.data.type === "claim") {
      // Another tab is alive. Defer to the older one (lower ts wins).
      if (ev.data.ts < (performance.timeOrigin ?? Date.now())) {
        amDispatcher = false;
      }
    } else if (ev.data.type === "bye") {
      // Old dispatcher gone. Reclaim after a small jitter so two reclaim
      // attempts don't collide. (200 ms is below human notice for a
      // notification.)
      setTimeout(() => {
        channel?.postMessage({
          type: "claim",
          ts: performance.timeOrigin ?? Date.now(),
        });
        amDispatcher = true;
      }, Math.random() * DISPATCHER_PING_MS);
    }
  });

  channel.postMessage({
    type: "hello",
    ts: performance.timeOrigin ?? Date.now(),
  });

  window.addEventListener("beforeunload", onBeforeUnload);
}

function onBeforeUnload(): void {
  channel?.postMessage({ type: "bye", ts: Date.now() });
  channel?.close();
  channel = null;
}

/** Tear down the dispatcher election. Call from authStore.logout to
 *  release the BroadcastChannel + beforeunload listener. */
export function teardownDispatcherElection(): void {
  if (!isBrowser()) {
    return;
  }
  window.removeEventListener("beforeunload", onBeforeUnload);
  onBeforeUnload();
  amDispatcher = false;
}

export function useBrowserNotifications(): {
  permission: typeof permission;
  dismissed: typeof dismissed;
  /** True iff this tab is the elected dispatcher. */
  isDispatcher: () => boolean;
  /** Best-effort capability check; UI hides toggles when false. */
  isSupported: () => boolean;
  /** Whether OS prompts can be raised from non-gesture contexts here. */
  canPromptWithoutGesture: () => boolean;
  /** Promise resolves to the new permission state. */
  requestPermission: () => Promise<Permission>;
  /** Persist "user said no" so we never re-prompt automatically. */
  dismiss: () => void;
  /** Clear the dismissed flag so the next opportunity can re-prompt. */
  unDismiss: () => void;
  /** Fire an OS notification if all guardrails pass. Returns true on dispatch. */
  dispatch: (payload: DispatchPayload) => boolean;
} {
  installDispatcherElection();

  function isSupported(): boolean {
    return permission.value !== "unsupported";
  }

  function canPromptWithoutGesture(): boolean {
    // Apple platforms throw on non-gesture requestPermission calls.
    // iOS Safari additionally requires the PWA to be installed.
    if (isAppleSafari()) {
      return false;
    }
    return true;
  }

  async function requestPermission(): Promise<Permission> {
    if (!isSupported()) {
      return permission.value;
    }
    try {
      const result = await Notification.requestPermission();
      permission.value = result;
      if (result === "denied") {
        persistDismissed(true);
      } else if (result === "granted") {
        persistDismissed(false);
      }
      return permission.value;
    } catch {
      // requestPermission throws in Safari when called outside a user
      // gesture. Treat as a soft denial — the user can retry via the
      // ProfileView toggle.
      return permission.value;
    }
  }

  function dispatch(payload: DispatchPayload): boolean {
    // Whether the user *wants* a notification for this event is the
    // caller's call — useSocket gates on "am I actively reading this
    // thread?" — not the dispatcher's. WhatsApp-style: an OS notification
    // fires even with the tab visible, as long as the user isn't on the
    // exact conversation. We only check the technical preconditions here.
    if (!isSupported() || permission.value !== "granted") {
      return false;
    }
    if (!isBrowser()) {
      return false;
    }
    if (!amDispatcher) {
      return false;
    }
    try {
      const notif = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon ?? "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `notif:${payload.kind}:${payload.senderId}`,
        renotify: false,
      } as NotificationOptions);
      notif.addEventListener("click", () => {
        window.focus();
        notif.close();
        payload.onClick?.();
      });
      return true;
    } catch {
      // Some browsers throw if the page isn't HTTPS or service-worker'd
      // and the user is offline. Failures are silent — the in-app feed
      // still got the entry.
      return false;
    }
  }

  return {
    permission,
    dismissed,
    isDispatcher: () => amDispatcher,
    isSupported,
    canPromptWithoutGesture,
    requestPermission,
    dismiss: () => persistDismissed(true),
    unDismiss: () => persistDismissed(false),
    dispatch,
  };
}
