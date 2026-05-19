/**
 * Web Push payload shape (PLAN.md Phase 20).
 *
 * Server-side encodes one of these as JSON and hands it to web-push; the
 * client-side service worker decodes it and calls
 * `self.registration.showNotification` accordingly. Keeping the union
 * tight here means both sides stay in sync without runtime branches.
 */
export type PushPayload = PushMessagePayload | PushMissedCallPayload;

export interface PushMessagePayload {
  /** Pre-translated message preview (truncated server-side). */
  body: string;
  /** Avatar URL — data URLs aren't passed (too big), `null` falls back to app icon. */
  iconUrl: string | null;
  kind: "message";
  /** Originator user id. */
  senderId: string;
  /** Pre-translated display name at send time. */
  senderName: string;
  /** Absolute path the service worker navigates to on click. */
  threadUrl: string;
}

export interface PushMissedCallPayload {
  iconUrl: string | null;
  kind: "missedCall";
  senderId: string;
  senderName: string;
  threadUrl: string;
}

/** What the client POSTs to /api/push/subscribe. */
export interface PushSubscribeRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
