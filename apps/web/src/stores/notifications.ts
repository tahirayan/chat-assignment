/**
 * Phase 19 — Missed-call inbox (PLAN.md, revised).
 *
 * The bell dropdown in the TopBar shows ONLY missed calls — new
 * messages are surfaced via OS notifications (handled in
 * `useSocket` + `useBrowserNotifications`), not the in-app feed,
 * because the chat thread itself is where you read messages.
 *
 * Per-user, localStorage-persisted, capacity-bound to 50 entries and
 * 7 days. Storage key: `notifications:feed:<userId>`. Scoping by user
 * means a second user signing in on a shared device can't see the
 * prior user's history.
 *
 * The `kind` union stays wider than what we currently push so the
 * type is future-proof — if we ever surface system events like
 * "Pro upgrade succeeded" in the same dropdown we won't need to
 * rename the type.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type NotificationKind = "message" | "incomingCall" | "missedCall";

export interface NotificationEntry {
  /** Optional preview — populated for messages, omitted for calls. */
  body?: string;
  createdAt: number;
  id: string;
  kind: NotificationKind;
  /** Unix-ms when the user opened this entry, or null when still unread. */
  readAt: number | null;
  /** Originator user id — used for routing on click and OS-tag dedup. */
  senderId: string;
  /** Pre-translated sender name at the time the event arrived. */
  senderName: string;
}

const FEED_KEY_PREFIX = "notifications:feed:";
const MAX_ENTRIES = 50;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `${FEED_KEY_PREFIX}${userId}`;
}

function readFeed(userId: string): NotificationEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Trust-but-narrow: filter to entries that have the required keys.
    // A schema rev that drops a field shouldn't crash the store.
    return parsed.filter(
      (e): e is NotificationEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.id === "string" &&
        typeof e.senderId === "string" &&
        typeof e.createdAt === "number"
    );
  } catch {
    return [];
  }
}

function writeFeed(userId: string, entries: NotificationEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(entries));
  } catch {
    // Quota / private-browsing — feed survives in memory until the tab
    // closes. Don't crash the UI over a storage failure.
  }
}

/** Crypto.randomUUID isn't on every node target, but is on every browser we ship to. */
function newId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback — only ever used in jsdom test env.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function prune(entries: NotificationEntry[]): NotificationEntry[] {
  const cutoff = Date.now() - TTL_MS;
  const fresh = entries.filter((e) => e.createdAt >= cutoff);
  if (fresh.length <= MAX_ENTRIES) {
    return fresh;
  }
  // Drop oldest first — fresh is in insertion order (newest at index 0
  // after push), so we slice the head.
  return fresh.slice(0, MAX_ENTRIES);
}

export const useNotificationsStore = defineStore("notifications", () => {
  const entries = ref<NotificationEntry[]>([]);
  const currentUserId = ref<string | null>(null);

  const unreadCount = computed(
    () => entries.value.filter((e) => e.readAt === null).length
  );

  const hasAny = computed(() => entries.value.length > 0);

  /**
   * Bind the store to a user. Loads their persisted feed from
   * localStorage. Call this from the auth watcher in App.vue every time
   * the authenticated user changes; pass `null` on logout (clears in
   * memory; the localStorage key is dropped by authStore.logout).
   */
  function initForUser(userId: string | null): void {
    currentUserId.value = userId;
    entries.value = userId ? prune(readFeed(userId)) : [];
    if (userId) {
      // Re-persist after prune so the next page-load doesn't re-prune.
      writeFeed(userId, entries.value);
    }
  }

  // Burst-tolerant persistence: writes are coalesced to one localStorage
  // write per microtask so a flurry of pushes (e.g. catching up after
  // reconnect) doesn't fire a sync setItem per entry.
  let persistQueued = false;
  function persist(): void {
    if (!currentUserId.value || persistQueued) {
      return;
    }
    persistQueued = true;
    queueMicrotask(() => {
      persistQueued = false;
      if (currentUserId.value) {
        writeFeed(currentUserId.value, entries.value);
      }
    });
  }

  /**
   * Append a new notification. Most recent at index 0.
   * Caller is responsible for any application-level dedup (e.g. don't
   * push a `message` entry when the user is actively viewing that
   * thread — useSocket gates that).
   */
  function push(
    input: Omit<NotificationEntry, "id" | "readAt">
  ): NotificationEntry {
    const entry: NotificationEntry = {
      id: newId(),
      readAt: null,
      ...input,
    };
    entries.value = prune([entry, ...entries.value]);
    persist();
    return entry;
  }

  function markRead(id: string): void {
    const now = Date.now();
    let changed = false;
    entries.value = entries.value.map((e) => {
      if (e.id === id && e.readAt === null) {
        changed = true;
        return { ...e, readAt: now };
      }
      return e;
    });
    if (changed) {
      persist();
    }
  }

  function markAllRead(): void {
    const now = Date.now();
    let changed = false;
    entries.value = entries.value.map((e) => {
      if (e.readAt === null) {
        changed = true;
        return { ...e, readAt: now };
      }
      return e;
    });
    if (changed) {
      persist();
    }
  }

  function clear(): void {
    entries.value = [];
    persist();
  }

  return {
    entries,
    unreadCount,
    hasAny,
    initForUser,
    push,
    markRead,
    markAllRead,
    clear,
  };
});
