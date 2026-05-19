<script setup lang="ts">
  import type { Message } from "@chat/shared-types";
  import { computed, nextTick, ref, watch } from "vue";
  import { useI18n } from "vue-i18n";
  import EmptyState from "../ui/EmptyState.vue";
  import MessageBubble from "./MessageBubble.vue";

  interface DaySeparator {
    id: string;
    kind: "separator";
    label: string;
  }

  interface MessageItem {
    id: string;
    kind: "message";
    message: Message;
  }

  type ListItem = DaySeparator | MessageItem;

  const props = withDefaults(
    defineProps<{
      messages: Message[];
      ownId: string;
      hasMore?: boolean;
      isLoadingOlder?: boolean;
    }>(),
    { hasMore: false, isLoadingOlder: false }
  );

  const emit = defineEmits<(e: "loadOlder") => void>();

  const { d, t } = useI18n();
  const scrollRef = ref<HTMLElement | null>(null);

  const STICK_THRESHOLD_PX = 80;
  const TOP_TRIGGER_PX = 120;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // ─── Day-separator interleaving ──────────────────────────────────────────
  function dayKey(ts: number): string {
    const date = new Date(ts);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  const items = computed<ListItem[]>(() => {
    // Hoist `today`/`yesterday` keys out of the per-message loop — they
    // depend only on "now", not on the message timestamp.
    const nowMs = Date.now();
    const todayKey = dayKey(nowMs);
    const yesterdayKey = dayKey(nowMs - ONE_DAY_MS);
    const labelFor = (ts: number): string => {
      const k = dayKey(ts);
      if (k === todayKey) {
        return t("chat.today");
      }
      if (k === yesterdayKey) {
        return t("chat.yesterday");
      }
      return d(new Date(ts), "short");
    };

    const out: ListItem[] = [];
    let lastKey: string | null = null;
    for (const m of props.messages) {
      const k = dayKey(m.createdAt);
      if (k !== lastKey) {
        out.push({
          kind: "separator",
          id: `sep-${k}`,
          label: labelFor(m.createdAt),
        });
        lastKey = k;
      }
      out.push({ kind: "message", id: m.id, message: m });
    }
    return out;
  });

  // ─── Scroll behavior ─────────────────────────────────────────────────────
  function isNearBottom(): boolean {
    const el = scrollRef.value;
    if (!el) {
      return true;
    }
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
    );
  }

  function scrollToBottom(): void {
    const el = scrollRef.value;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }

  // Anchor-preserving scroll for prepended history. captureAnchor() is
  // called BEFORE the prepend; applyAnchor() restores the user's visual
  // position after layout settles (delta = new scrollHeight − old).
  let preAnchorScrollHeight: number | null = null;

  function captureAnchor(): void {
    preAnchorScrollHeight = scrollRef.value?.scrollHeight ?? null;
  }

  function applyAnchor(): void {
    const el = scrollRef.value;
    if (!el || preAnchorScrollHeight === null) {
      return;
    }
    const delta = el.scrollHeight - preAnchorScrollHeight;
    if (delta > 0) {
      el.scrollTop += delta;
    }
    preAnchorScrollHeight = null;
  }

  watch(
    () => props.messages.length,
    async (next, prev) => {
      const wasNearBottom = isNearBottom();
      const isPrepend =
        preAnchorScrollHeight !== null && (next ?? 0) > (prev ?? 0);
      await nextTick();
      if (isPrepend) {
        applyAnchor();
        return;
      }
      if (prev === 0 || wasNearBottom || (next ?? 0) > (prev ?? 0)) {
        scrollToBottom();
      }
    },
    { flush: "post" }
  );

  function onScroll(): void {
    const el = scrollRef.value;
    if (!(el && props.hasMore) || props.isLoadingOlder) {
      return;
    }
    if (el.scrollTop < TOP_TRIGGER_PX) {
      captureAnchor();
      emit("loadOlder");
    }
  }
</script>

<template>
  <div
    ref="scrollRef"
    class="flex-1 overflow-y-auto px-3 py-4"
    @scroll.passive="onScroll"
  >
    <div v-if="isLoadingOlder" class="mb-3 text-center text-xs text-text-muted">
      {{ t("common.loading") }}
    </div>

    <EmptyState
      v-if="messages.length === 0"
      :title="t('chat.emptySayHi')"
      class="h-full"
    />

    <div v-else class="flex flex-col gap-3">
      <template v-for="item in items" :key="item.id">
        <div
          v-if="item.kind === 'separator'"
          class="my-2 flex items-center gap-3 text-2xs uppercase tracking-wider text-text-muted"
        >
          <span class="h-px flex-1 bg-border" />
          <span>{{ item.label }}</span>
          <span class="h-px flex-1 bg-border" />
        </div>
        <MessageBubble v-else :message="item.message" :own-id="ownId" />
      </template>
    </div>
  </div>
</template>
