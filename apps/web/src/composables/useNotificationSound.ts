/**
 * Phase 19 — Notification chime (PLAN.md).
 *
 * Tight constraints, all driven by browser quirks:
 *   - `Audio.play()` rejects on Chrome before a user gesture has
 *     touched the page. We lazy-construct the Audio object only on
 *     first play attempt, and we never call play() on page load.
 *   - Rapid back-to-back triggers (three messages in a second) should
 *     chime once, not three times. 1 s debounce.
 *   - Mute toggle persists in localStorage so it survives reload.
 */

import { ref } from "vue";

const MUTED_KEY = "notifications:sound-muted";
const DEBOUNCE_MS = 1000;
const AUDIO_PATH = "/sounds/notify.wav";

const muted = ref<boolean>(readMuted());
let audio: HTMLAudioElement | null = null;
let lastPlayedAt = 0;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readMuted(): boolean {
  if (!isBrowser()) {
    return false;
  }
  return window.localStorage.getItem(MUTED_KEY) === "1";
}

function persistMuted(value: boolean): void {
  if (!isBrowser()) {
    return;
  }
  if (value) {
    window.localStorage.setItem(MUTED_KEY, "1");
  } else {
    window.localStorage.removeItem(MUTED_KEY);
  }
  muted.value = value;
}

function ensureAudio(): HTMLAudioElement | null {
  if (!isBrowser()) {
    return null;
  }
  if (!audio) {
    audio = new Audio(AUDIO_PATH);
    audio.preload = "auto";
    audio.volume = 0.6;
  }
  return audio;
}

export function useNotificationSound(): {
  muted: typeof muted;
  setMuted: (value: boolean) => void;
  /** Play the chime if not muted, not debounced, and the asset loads. */
  play: () => void;
} {
  function play(): void {
    if (muted.value) {
      return;
    }
    const now = Date.now();
    if (now - lastPlayedAt < DEBOUNCE_MS) {
      return;
    }
    lastPlayedAt = now;
    const el = ensureAudio();
    if (!el) {
      return;
    }
    // currentTime = 0 lets a second valid play overlap an in-flight
    // one without waiting for it to finish. Necessary for the case
    // where the user un-mutes and then a fresh event arrives.
    el.currentTime = 0;
    el.play().catch(() => {
      // Autoplay policy rejection on the very first try — that's fine.
      // We'll have a user gesture by the time the next event lands.
    });
  }

  return {
    muted,
    setMuted: persistMuted,
    play,
  };
}
