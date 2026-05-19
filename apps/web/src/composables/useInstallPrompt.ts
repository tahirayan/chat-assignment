/**
 * PWA install-prompt orchestration (PRD §16.2).
 *
 *   Android/Chrome: browser fires `beforeinstallprompt`; we defer it and
 *     expose `promptInstall()` so the user can trigger it from our banner
 *     UI at a moment we control (Chrome won't let us call it unprompted).
 *   iOS Safari: there is no native API — we detect iOS + non-standalone
 *     and the banner renders a "Tap Share → Add to Home Screen" hint.
 *
 * Singleton at module scope so the `beforeinstallprompt` listener is
 * registered exactly once even if `useInstallPrompt()` is called from
 * multiple components.
 */

import { type ComputedRef, computed, type Ref, ref } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "install-dismissed";

const IOS_UA = /iphone|ipad|ipod/i;
const MOBILE_UA = /mobile|android|iphone|ipad|ipod/i;

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const canInstall = ref(false);
const dismissed = ref(readDismissed());

let installed = false;

function readDismissed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

function persistDismissed(): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DISMISS_KEY, "1");
  }
  dismissed.value = true;
}

function install(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Chrome shows its mini-infobar by default — prevent it so our banner
    // is the canonical surface and we can trigger `prompt()` ourselves.
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
    canInstall.value = true;
  });

  // When the app is actually installed, clear the deferred event and the
  // banner for this session. We deliberately do NOT persist a "dismissed"
  // flag here — `isStandalone.value === true` already suppresses the
  // banner while the PWA is running, and persisting would mean that if
  // the user later uninstalls the PWA, the banner would stay hidden
  // until they manually clear site data. Letting standalone-mode do the
  // work means uninstalling cleanly re-surfaces the banner.
  window.addEventListener("appinstalled", () => {
    deferredPrompt.value = null;
    canInstall.value = false;
  });
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  // iPadOS 13+ identifies as Mac with touch; we treat that as iOS so the
  // banner shows the right share-sheet copy.
  const ua = navigator.userAgent;
  return (
    IOS_UA.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") {
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

function detectMobile(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return MOBILE_UA.test(navigator.userAgent);
}

export function useInstallPrompt(): {
  canInstall: Ref<boolean>;
  isIOS: ComputedRef<boolean>;
  isStandalone: ComputedRef<boolean>;
  isMobile: ComputedRef<boolean>;
  dismissed: Ref<boolean>;
  shouldShowBanner: ComputedRef<boolean>;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
} {
  install();

  const isIOS = computed(detectIOS);
  const isStandalone = computed(detectStandalone);
  const isMobile = computed(detectMobile);

  // PRD §16.3: banner shows on mobile (not when running standalone),
  // when not previously dismissed, AND either we have a deferred Chrome
  // prompt OR we're on iOS Safari (no API → show the share-sheet hint).
  const shouldShowBanner = computed(
    () =>
      isMobile.value &&
      !isStandalone.value &&
      !dismissed.value &&
      (canInstall.value || isIOS.value)
  );

  async function promptInstall(): Promise<void> {
    const evt = deferredPrompt.value;
    if (!evt) {
      return;
    }
    await evt.prompt();
    // userChoice resolves regardless of outcome; we treat both paths the
    // same — the banner is done either way. `appinstalled` will fire on
    // accept and clear state idempotently.
    await evt.userChoice.catch(() => undefined);
    deferredPrompt.value = null;
    canInstall.value = false;
    persistDismissed();
  }

  function dismiss(): void {
    canInstall.value = false;
    persistDismissed();
  }

  return {
    canInstall,
    isIOS,
    isStandalone,
    isMobile,
    dismissed,
    shouldShowBanner,
    promptInstall,
    dismiss,
  };
}
