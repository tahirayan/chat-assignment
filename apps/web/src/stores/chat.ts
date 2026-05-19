import type {
  Conversation,
  Message,
  MessageDeliveredPayload,
  MessageReadServerPayload,
  PublicUser,
} from "@chat/shared-types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";
import { useAuthStore } from "./auth";
import { useUsersStore } from "./users";

type ChatSocketEmitter = (
  event: "message:send",
  payload: { recipientId: string; body: string; clientId: string }
) => void;

interface SendOptions {
  emit: ChatSocketEmitter;
}

function compareMessages(a: Message, b: Message): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id);
}

/** History page size — matches PRD §11.5 ("50 older messages per scroll page"). */
const HISTORY_PAGE_SIZE = 50;
/** Hard cap on the in-memory buffer per conversation — PRD §11.5. */
const HISTORY_BUFFER_CAP = 200;
/** Defensive auto-clear for typing indicators if `typing:stop` is lost. */
const TYPING_AUTO_CLEAR_MS = 6000;

export const useChatStore = defineStore("chat", () => {
  const authStore = useAuthStore();
  const usersStore = useUsersStore();

  // ─── State ────────────────────────────────────────────────────────────────
  const messagesByUser = ref<Map<string, Message[]>>(new Map());
  const loadingByUser = ref<Map<string, boolean>>(new Map());
  const errorByUser = ref<Map<string, string | null>>(new Map());
  /** Has the most recent fetch returned a full page? If false, no older messages. */
  const hasMoreByUser = ref<Map<string, boolean>>(new Map());
  const olderLoadingByUser = ref<Map<string, boolean>>(new Map());

  const conversations = ref<Conversation[]>([]);
  const conversationsLoading = ref(false);
  const conversationsError = ref<string | null>(null);

  /** `partnerId → true` when that partner is actively typing to me. */
  const typingByUser = ref<Map<string, boolean>>(new Map());
  /** Defensive auto-clear timers, keyed by partnerId. */
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Set by ChatView (mirrors useSocket.activeThreadId) so addMessage can
   *  auto-mark-read when a new message arrives in the focused thread. */
  const activeThreadId = ref<string | null>(null);

  // ─── Getters ──────────────────────────────────────────────────────────────
  const totalUnread = computed(() =>
    conversations.value.reduce((sum, c) => sum + c.unreadCount, 0)
  );

  function partnerIdOf(msg: Message): string | null {
    const selfId = authStore.user?.id;
    if (!selfId) {
      return null;
    }
    if (msg.senderId === selfId) {
      return msg.recipientId;
    }
    if (msg.recipientId === selfId) {
      return msg.senderId;
    }
    return null;
  }

  function listFor(partnerId: string): Message[] {
    return messagesByUser.value.get(partnerId) ?? [];
  }

  const messagesFor = (partnerId: string) =>
    computed<Message[]>(() => listFor(partnerId));

  const isLoadingFor = (partnerId: string) =>
    computed<boolean>(() => loadingByUser.value.get(partnerId) === true);

  const errorFor = (partnerId: string) =>
    computed<string | null>(() => errorByUser.value.get(partnerId) ?? null);

  function conversationFor(partnerId: string): Conversation | null {
    return conversations.value.find((c) => c.partner.id === partnerId) ?? null;
  }

  // ─── Internal: conversation maintenance ───────────────────────────────────
  /**
   * PRD §24 note 16 — `addMessage` is one atomic action that (a) appends to
   * the thread, (b) updates/inserts the matching Conversation entry, and
   * (c) moves that conversation to position 0. All three together so the
   * recents list never lags the thread or drifts out of sync.
   *
   * `activeThreadId` tells us whether to bump the unread badge — when the
   * recipient is currently looking at that thread, we don't.
   */
  function upsertConversationFromMessage(
    msg: Message,
    activeThreadId: string | null
  ): void {
    const selfId = authStore.user?.id;
    if (!selfId) {
      return;
    }
    const partnerId = partnerIdOf(msg);
    if (!partnerId) {
      return;
    }
    const isIncoming = msg.recipientId === selfId;
    const isViewingThread = activeThreadId === partnerId;

    const idx = conversations.value.findIndex(
      (c) => c.partner.id === partnerId
    );

    if (idx >= 0) {
      const existing = conversations.value[idx];
      if (!existing) {
        return;
      }
      const nextUnread =
        isIncoming && !isViewingThread
          ? existing.unreadCount + 1
          : existing.unreadCount;
      const updated: Conversation = {
        partner: existing.partner,
        lastMessage: msg,
        unreadCount: nextUnread,
      };
      const without = conversations.value.filter((_, i) => i !== idx);
      conversations.value = [updated, ...without];
      return;
    }

    // New conversation — partner info from the users store.
    const partner: PublicUser | undefined = usersStore.byId.get(partnerId);
    if (!partner) {
      // Partner not loaded (e.g. registered after our last /api/users
      // fetch). Pull a fresh conversations list to pick them up.
      fetchConversations().catch(() => undefined);
      return;
    }
    const inserted: Conversation = {
      partner,
      lastMessage: msg,
      unreadCount: isIncoming && !isViewingThread ? 1 : 0,
    };
    conversations.value = [inserted, ...conversations.value];
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  function setMessages(partnerId: string, next: Message[]): void {
    const sorted = [...next].sort(compareMessages);
    messagesByUser.value.set(partnerId, sorted);
    messagesByUser.value = new Map(messagesByUser.value);
  }

  function addMessage(
    msg: Message,
    options: { activeThreadId?: string | null } = {}
  ): void {
    const partnerId = partnerIdOf(msg);
    if (!partnerId) {
      return;
    }
    const list = listFor(partnerId);
    if (list.some((m) => m.id === msg.id)) {
      return;
    }
    const next = [...list, msg].sort(compareMessages);
    messagesByUser.value.set(partnerId, next);
    messagesByUser.value = new Map(messagesByUser.value);

    upsertConversationFromMessage(msg, options.activeThreadId ?? null);

    // Auto-mark-read when an incoming message arrives in the thread the
    // user is currently viewing (PRD §11.5 "Mark conversation as read on
    // mount + on new message arrival while viewing").
    const isIncoming = msg.recipientId === authStore.user?.id;
    if (isIncoming && options.activeThreadId === partnerId) {
      markRead(partnerId).catch(() => undefined);
    }
  }

  // ─── Typing ──────────────────────────────────────────────────────────────
  function setTyping(partnerId: string, isTyping: boolean): void {
    typingByUser.value.set(partnerId, isTyping);
    typingByUser.value = new Map(typingByUser.value);

    const existingTimer = typingTimers.get(partnerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      typingTimers.delete(partnerId);
    }

    if (isTyping) {
      // Defensive: if typing:stop is lost in transit, auto-clear after a
      // generous window so the indicator doesn't hang forever.
      const timer = setTimeout(() => {
        typingByUser.value.set(partnerId, false);
        typingByUser.value = new Map(typingByUser.value);
        typingTimers.delete(partnerId);
      }, TYPING_AUTO_CLEAR_MS);
      typingTimers.set(partnerId, timer);
    }
  }

  const isTypingFor = (partnerId: string) =>
    computed<boolean>(() => typingByUser.value.get(partnerId) === true);

  function reconcileDelivered(payload: MessageDeliveredPayload): void {
    const { clientId, id, createdAt } = payload;
    for (const [partnerId, list] of messagesByUser.value) {
      const idx = list.findIndex((m) => m.id === clientId);
      if (idx === -1) {
        continue;
      }
      const target = list[idx];
      if (!target) {
        return;
      }
      const updated = [...list];
      updated[idx] = { ...target, id, createdAt };
      messagesByUser.value.set(partnerId, updated.sort(compareMessages));
      messagesByUser.value = new Map(messagesByUser.value);

      // Fix the conversation's lastMessage if it was pointing at the
      // optimistic id (so the row preview shows the real timestamp).
      const convIdx = conversations.value.findIndex(
        (c) => c.partner.id === partnerId
      );
      if (convIdx >= 0) {
        const existing = conversations.value[convIdx];
        if (existing && existing.lastMessage.id === clientId) {
          conversations.value = conversations.value.map((c, i) =>
            i === convIdx
              ? { ...c, lastMessage: { ...c.lastMessage, id, createdAt } }
              : c
          );
        }
      }
      return;
    }
  }

  function applyReadReceipt(payload: MessageReadServerPayload): void {
    const partnerId = payload.readerId;
    const list = listFor(partnerId);
    let changed = false;
    const updated = list.map((m) => {
      if (
        m.readAt === null &&
        m.recipientId === partnerId &&
        m.senderId === authStore.user?.id
      ) {
        changed = true;
        return { ...m, readAt: payload.readAt };
      }
      return m;
    });
    if (changed) {
      messagesByUser.value.set(partnerId, updated);
      messagesByUser.value = new Map(messagesByUser.value);
    }
  }

  async function fetchHistory(partnerId: string): Promise<void> {
    loadingByUser.value.set(partnerId, true);
    errorByUser.value.set(partnerId, null);
    try {
      const { data } = await api.get<Message[]>(`/messages/${partnerId}`, {
        params: { limit: HISTORY_PAGE_SIZE },
      });
      setMessages(partnerId, data);
      hasMoreByUser.value.set(partnerId, data.length === HISTORY_PAGE_SIZE);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load conversation";
      errorByUser.value.set(partnerId, msg);
    } finally {
      loadingByUser.value.set(partnerId, false);
    }
  }

  /**
   * Load the next page of older messages (cursor = oldest currently-loaded
   * msg's createdAt). Stops at HISTORY_BUFFER_CAP so memory stays bounded;
   * after that, the UI should switch to an explicit "Load more" button
   * (PRD §11.5).
   */
  async function fetchOlder(partnerId: string): Promise<void> {
    if (olderLoadingByUser.value.get(partnerId) === true) {
      return;
    }
    if (hasMoreByUser.value.get(partnerId) === false) {
      return;
    }
    const current = listFor(partnerId);
    if (current.length >= HISTORY_BUFFER_CAP) {
      return;
    }
    const oldest = current[0];
    if (!oldest) {
      return;
    }
    olderLoadingByUser.value.set(partnerId, true);
    try {
      const { data } = await api.get<Message[]>(`/messages/${partnerId}`, {
        params: { before: oldest.createdAt, limit: HISTORY_PAGE_SIZE },
      });
      if (data.length === 0) {
        hasMoreByUser.value.set(partnerId, false);
        return;
      }
      // Prepend, dedup by id, re-sort.
      const merged: Message[] = [...data, ...current];
      const seen = new Set<string>();
      const deduped = merged.filter((m) => {
        if (seen.has(m.id)) {
          return false;
        }
        seen.add(m.id);
        return true;
      });
      messagesByUser.value.set(partnerId, deduped.sort(compareMessages));
      messagesByUser.value = new Map(messagesByUser.value);
      hasMoreByUser.value.set(partnerId, data.length === HISTORY_PAGE_SIZE);
    } catch {
      // Soft-fail — the UI keeps the existing list and the user can retry.
    } finally {
      olderLoadingByUser.value.set(partnerId, false);
    }
  }

  const hasMoreFor = (partnerId: string) =>
    computed<boolean>(() => hasMoreByUser.value.get(partnerId) !== false);

  const isOlderLoadingFor = (partnerId: string) =>
    computed<boolean>(() => olderLoadingByUser.value.get(partnerId) === true);

  async function fetchConversations(): Promise<void> {
    conversationsLoading.value = true;
    conversationsError.value = null;
    try {
      const { data } = await api.get<Conversation[]>("/conversations");
      conversations.value = data;
    } catch (err) {
      conversationsError.value =
        err instanceof Error ? err.message : "Failed to load conversations";
    } finally {
      conversationsLoading.value = false;
    }
  }

  /**
   * Mark all messages from `partnerId` as read. Optimistically zeros the
   * unread badge locally; the server call is best-effort.
   */
  async function markRead(partnerId: string): Promise<void> {
    const idx = conversations.value.findIndex(
      (c) => c.partner.id === partnerId
    );
    if (idx >= 0) {
      const existing = conversations.value[idx];
      if (existing && existing.unreadCount > 0) {
        conversations.value = conversations.value.map((c, i) =>
          i === idx ? { ...c, unreadCount: 0 } : c
        );
      }
    }
    try {
      await api.post(`/messages/${partnerId}/read`);
    } catch {
      // best-effort
    }
  }

  function sendMessage(
    partnerId: string,
    body: string,
    options: SendOptions
  ): void {
    const selfId = authStore.user?.id;
    if (!selfId) {
      throw new Error("Cannot send: not authenticated");
    }
    const trimmed = body.trim();
    if (trimmed === "") {
      return;
    }
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: clientId,
      senderId: selfId,
      recipientId: partnerId,
      body: trimmed,
      createdAt: Date.now(),
      readAt: null,
    };
    addMessage(optimistic, { activeThreadId: partnerId });
    options.emit("message:send", {
      recipientId: partnerId,
      body: trimmed,
      clientId,
    });
  }

  /**
   * Replace the embedded `partner` in any matching conversation row with
   * a fresh PublicUser. Fired by the `user:updated` socket dispatch so a
   * partner's display name / avatar / Pro badge / locale changes ripple
   * into the sidebar and chats list in real time — no refetch needed.
   */
  function updatePartner(user: PublicUser): void {
    let changed = false;
    const next = conversations.value.map((c) => {
      if (c.partner.id !== user.id) {
        return c;
      }
      changed = true;
      return { ...c, partner: user };
    });
    if (changed) {
      conversations.value = next;
    }
  }

  function clear(): void {
    messagesByUser.value = new Map();
    loadingByUser.value = new Map();
    errorByUser.value = new Map();
    hasMoreByUser.value = new Map();
    olderLoadingByUser.value = new Map();
    conversations.value = [];
    conversationsLoading.value = false;
    conversationsError.value = null;
    typingByUser.value = new Map();
    for (const timer of typingTimers.values()) {
      clearTimeout(timer);
    }
    typingTimers.clear();
    activeThreadId.value = null;
  }

  return {
    // state
    messagesByUser,
    loadingByUser,
    errorByUser,
    conversations,
    conversationsLoading,
    conversationsError,
    typingByUser,
    activeThreadId,
    // getters
    totalUnread,
    messagesFor,
    isLoadingFor,
    errorFor,
    conversationFor,
    isTypingFor,
    hasMoreFor,
    isOlderLoadingFor,
    // actions
    setMessages,
    addMessage,
    reconcileDelivered,
    applyReadReceipt,
    fetchHistory,
    fetchOlder,
    fetchConversations,
    markRead,
    sendMessage,
    setTyping,
    updatePartner,
    clear,
  };
});
