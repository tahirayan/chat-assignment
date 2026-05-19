import {
  CLIENT_EVENTS,
  type ClientToServerEvents,
  SERVER_EVENTS,
  type ServerToClientEvents,
} from "@chat/shared-types";
import type { Socket } from "socket.io-client";
import { watch } from "vue";
import { i18n } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useCallStore } from "../stores/call";
import { useChatStore } from "../stores/chat";
import { useNotificationsStore } from "../stores/notifications";
import { useUiStore } from "../stores/ui";
import { useUsersStore } from "../stores/users";
import { useBrowserNotifications } from "./useBrowserNotifications";
import { useNotificationSound } from "./useNotificationSound";
import {
  endCall,
  handleAccepted,
  handleAnswer,
  handleEnded,
  handleIce,
  handleIncoming,
  handleOffer,
  handleRejected,
} from "./useWebRTC";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Module-scoped singleton. Multiple calls to useSocket() share one connection.
let socket: ChatSocket | null = null;
let installed = false;

// socket.io-client is ~50 KB gzip and only needed once the user is
// authenticated — defer it behind a dynamic import so it's not on the
// critical chain for the AuthView. Cached after first load.
let ioLoader: Promise<typeof import("socket.io-client").io> | null = null;
function loadIo(): Promise<typeof import("socket.io-client").io> {
  if (!ioLoader) {
    ioLoader = import("socket.io-client").then((m) => m.io);
  }
  return ioLoader;
}

// Single-flight refresh: the server may emit TOKEN_EXPIRED at the same
// moment a connect_error fires with "unauthorized". Without this guard we'd
// kick off two parallel /auth/refresh calls and one would race the other,
// occasionally clobbering a freshly-rotated refresh cookie.
let pendingRefresh: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (pendingRefresh) {
    return pendingRefresh;
  }
  const authStore = useAuthStore();
  pendingRefresh = authStore.refresh().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

/**
 * Set by ChatView while mounted (and cleared on unmount) so the message:new
 * listener can suppress the unread-badge bump for messages arriving in the
 * thread the user is actively viewing.
 */
let activeThreadId: string | null = null;

export function setActiveThread(partnerId: string | null): void {
  activeThreadId = partnerId;
}

/**
 * Called on every successful (re)connect — including the very first one.
 * Pulls fresh server state so any events the client missed while
 * disconnected (e.g. `message:read` while reconnecting) get reconciled.
 * Idempotent — fetching twice in a row is fine.
 */
function resyncFromServer(): void {
  const usersStore = useUsersStore();
  const chatStore = useChatStore();
  usersStore.fetchAll().catch(() => undefined);
  chatStore.fetchConversations().catch(() => undefined);
  if (activeThreadId) {
    chatStore.fetchHistory(activeThreadId).catch(() => undefined);
    chatStore.markRead(activeThreadId).catch(() => undefined);
  }
}

function attachListeners(s: ChatSocket): void {
  const usersStore = useUsersStore();
  const chatStore = useChatStore();

  // Resync server state on every connect (including reconnects after a
  // socket drop) so missed events don't leave the UI out of sync with the
  // server's source of truth. Without this, e.g. a `message:read` emitted
  // while we were briefly disconnected would never reach us — read
  // receipts in the UI would silently disagree with the DB.
  s.on("connect", () => {
    resyncFromServer();
  });

  // ─── Presence ────────────────────────────────────────────────────────────
  s.on(SERVER_EVENTS.USER_ONLINE, ({ userId }) => {
    usersStore.setOnline(userId);
  });

  s.on(SERVER_EVENTS.USER_OFFLINE, ({ userId, lastSeenAt }) => {
    usersStore.setOffline(userId, lastSeenAt);
  });

  // ─── User profile / registration / Pro flip ─────────────────────────────
  // Fires on three server-side events: new user registered, profile PATCH,
  // Stripe webhook flipping isPro. The PublicUser payload is the full
  // current snapshot — upsert by id and fan out so every surface (community
  // list, conversation rows, Pro badge, self-profile in another tab)
  // reconciles without a refetch.
  s.on(SERVER_EVENTS.USER_UPDATED, (payload) => {
    const authStore = useAuthStore();
    if (authStore.user?.id === payload.id) {
      // Self-update from another device/tab or the Pro-flip webhook.
      // Don't add ourselves to `users` (that store is "other users only").
      authStore.mergePublicProfile(payload);
    } else {
      usersStore.upsert(payload);
    }
    // Either way, a conversation row partner may need refreshing.
    chatStore.updatePartner(payload);
  });

  // ─── Messages ────────────────────────────────────────────────────────────
  // `message:delivered` arrives BEFORE the echoed `message:new` on the
  // sender's socket (server emits delivered first). That ordering lets the
  // sender swap its optimistic msg's clientId → server id, so the echoed
  // message:new is dedup'd by id.
  s.on(SERVER_EVENTS.MESSAGE_DELIVERED, (payload) => {
    chatStore.reconcileDelivered(payload);
  });

  s.on(SERVER_EVENTS.MESSAGE_NEW, (msg) => {
    chatStore.addMessage(msg, { activeThreadId });

    // ─── Phase 19: OS notification + chime ───────────────────────────────
    // Messages do NOT enter the bell dropdown (the bell is reserved for
    // missed calls — messages are visible in the chat thread itself).
    // We do however dispatch a WhatsApp-style OS notification whenever
    // the user isn't actively reading that exact conversation, even if
    // the tab is foreground but on a different route.
    //
    // Guard order:
    //   1. Drop our own message echoed back for multi-tab sync.
    //   2. Drop when the user is literally looking at this thread
    //      (active route is the chat AND the tab is visible). Visibility
    //      check matters because "active thread" persists in a hidden
    //      tab and we still want to notify in that case.
    const authStore = useAuthStore();
    const selfId = authStore.user?.id;
    if (!selfId || msg.senderId === selfId) {
      return;
    }
    const isActivelyViewing =
      activeThreadId === msg.senderId &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus();
    if (isActivelyViewing) {
      return;
    }

    const sender = usersStore.byId.get(msg.senderId);
    const senderName = sender?.displayName ?? msg.senderId;
    const browserNotif = useBrowserNotifications();
    browserNotif.dispatch({
      kind: "message",
      senderId: msg.senderId,
      title: senderName,
      body: msg.body.slice(0, 140),
      icon: sender?.avatarUrl ?? undefined,
      onClick: () => {
        window.location.assign(`/chat/${msg.senderId}`);
      },
    });

    const sound = useNotificationSound();
    sound.play();
  });

  s.on(SERVER_EVENTS.MESSAGE_READ, (payload) => {
    chatStore.applyReadReceipt(payload);
  });

  // ─── Typing ──────────────────────────────────────────────────────────────
  s.on(SERVER_EVENTS.TYPING_START, ({ fromUserId }) => {
    chatStore.setTyping(fromUserId, true);
  });

  s.on(SERVER_EVENTS.TYPING_STOP, ({ fromUserId }) => {
    chatStore.setTyping(fromUserId, false);
  });

  // ─── Call signaling ──────────────────────────────────────────────────────
  // Per PRD §8.3 + §13: incoming/accepted/rejected/offer/answer/ice/ended
  // are dispatched to useWebRTC's free handlers (kept outside any reactive
  // module to avoid circular imports between useSocket and useWebRTC).
  s.on(SERVER_EVENTS.CALL_INCOMING, (payload) => {
    handleIncoming(payload);

    // OS notification for incoming calls — the CallModal pops on-screen
    // for in-tab UX, the OS notif covers the backgrounded-tab case.
    // We do NOT add a bell entry here: an incoming call only becomes a
    // "missed call" once it actually goes unanswered (handled in
    // CALL_ENDED below).
    const browserNotif = useBrowserNotifications();
    browserNotif.dispatch({
      kind: "incomingCall",
      senderId: payload.fromUser.id,
      title: i18n.global.t("notifications.incomingCall", {
        name: payload.fromUser.displayName,
      }),
      icon: payload.fromUser.avatarUrl ?? undefined,
      onClick: () => {
        window.focus();
      },
    });
  });
  s.on(SERVER_EVENTS.CALL_ACCEPTED, () => {
    handleAccepted().catch(() => undefined);
  });
  s.on(SERVER_EVENTS.CALL_REJECTED, () => {
    handleRejected();
  });
  s.on(SERVER_EVENTS.CALL_OFFER, (payload) => {
    handleOffer(payload).catch(() => undefined);
  });
  s.on(SERVER_EVENTS.CALL_ANSWER, (payload) => {
    handleAnswer(payload).catch(() => undefined);
  });
  s.on(SERVER_EVENTS.CALL_ICE, (payload) => {
    handleIce(payload).catch(() => undefined);
  });
  s.on(SERVER_EVENTS.CALL_ENDED, (payload) => {
    // Missed-call detection MUST run before handleEnded — that handler
    // resets the call store to idle, after which we can't tell whether
    // the call had been answered. If our local state was still `ringing`
    // when the caller hung up, we never accepted → it's a missed call.
    const callStore = useCallStore();
    const wasRinging = callStore.state === "ringing";
    const peer = callStore.remoteUser;
    handleEnded(payload);

    if (!(wasRinging && peer)) {
      return;
    }
    const notifications = useNotificationsStore();
    const entry = notifications.push({
      kind: "missedCall",
      senderId: peer.id,
      senderName: peer.displayName,
      createdAt: Date.now(),
    });
    const browserNotif = useBrowserNotifications();
    browserNotif.dispatch({
      kind: "missedCall",
      senderId: peer.id,
      title: i18n.global.t("notifications.missedCall", {
        name: peer.displayName,
      }),
      icon: peer.avatarUrl ?? undefined,
      onClick: () => {
        notifications.markRead(entry.id);
        window.location.assign(`/chat/${peer.id}`);
      },
    });
    const sound = useNotificationSound();
    sound.play();
  });

  // Server-emitted errors. CALLEE_OFFLINE comes from call signaling;
  // TOKEN_EXPIRED comes from the JWT expiry timer enforced server-side.
  s.on(SERVER_EVENTS.ERROR, (payload) => {
    const uiStore = useUiStore();
    if (payload.code === "CALLEE_OFFLINE") {
      uiStore.pushToast("warning", i18n.global.t("call.calleeOffline"));
      endCall("failed", { notifyPeer: false });
      return;
    }
    if (payload.code === "TOKEN_EXPIRED") {
      // Server will disconnect us right after this emit. Refresh the
      // access token now so that by the time socket.io's auto-reconnect
      // ticks, the new token is already in authStore and the watcher has
      // updated `socket.auth.token`.
      refreshAccessToken().catch(() => undefined);
    }
  });

  s.on("connect_error", (err) => {
    if (typeof window !== "undefined" && window.console) {
      window.console.warn("[socket] connect_error", err.message);
    }
    // Server rejects the handshake with "unauthorized" when the JWT is
    // expired/invalid. Refresh and let the watcher reconnect. Without
    // this the reconnect loop hammers the server with the stale token
    // until the user manually reloads.
    if (err.message === "unauthorized") {
      refreshAccessToken().catch(() => undefined);
    }
  });
}

async function connect(token: string): Promise<ChatSocket> {
  // Default transports: ["polling", "websocket"] — socket.io starts with
  // HTTP long-polling and upgrades to WebSocket. We DO NOT force
  // websocket-only because:
  //   1. Polling tolerates flaky proxies (Vite dev, Netlify rewrites) that
  //      occasionally drop the WS upgrade with ECONNRESET.
  //   2. Without the polling fallback a single WS hiccup leaves the user
  //      with an empty server-side room, and any events emitted to them
  //      during that gap (e.g. `message:read`) are silently dropped.
  // The `connect` listener installed below does a server-state resync on
  // every reconnect as a second line of defense.
  const io = await loadIo();
  const next: ChatSocket = io({
    path: "/socket.io",
    auth: { token },
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  attachListeners(next);
  return next;
}

function disconnect(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Returns the singleton socket and ensures it follows the access token:
 *   • token present → socket connected with that token
 *   • token null    → socket disconnected
 *   • token changes → reconnect with the new token
 *
 * Call this once at app bootstrap (e.g. from App.vue) so the watcher is
 * registered before any component subscribes.
 */
export function useSocket(): {
  socket: () => ChatSocket | null;
  emit: <E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ) => ChatSocket;
  events: { client: typeof CLIENT_EVENTS; server: typeof SERVER_EVENTS };
} {
  if (!installed) {
    installed = true;
    const authStore = useAuthStore();

    watch(
      () => authStore.accessToken,
      async (token) => {
        if (!token) {
          disconnect();
          return;
        }
        if (socket?.auth) {
          // Token rotated mid-session → reconnect with the new token.
          (socket.auth as { token?: string }).token = token;
          socket.disconnect();
          socket.connect();
          return;
        }
        const next = await connect(token);
        // Race guard: socket.io-client loads asynchronously the first
        // time, so the user may have logged out (or rotated the token
        // again) while we were waiting for the chunk. Discard the new
        // connection in that case instead of leaving an orphan.
        if (authStore.accessToken !== token) {
          next.removeAllListeners();
          next.disconnect();
          return;
        }
        socket = next;
      },
      { immediate: true }
    );
  }

  function emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): ChatSocket {
    if (!socket) {
      throw new Error(
        "Cannot emit before the socket is connected. Wait for authStore.accessToken to be set."
      );
    }
    return (socket as ChatSocket).emit(event, ...args);
  }

  return {
    socket: () => socket,
    emit,
    events: { client: CLIENT_EVENTS, server: SERVER_EVENTS },
  };
}
