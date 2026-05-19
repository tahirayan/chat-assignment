<script setup lang="ts">
  import type { Conversation } from "@chat/shared-types";
  import { Tick01Icon, TickDouble01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { RouterLink, useRoute } from "vue-router";
  import { formatRelativeTime } from "../../composables/useRelativeTime";
  import { useAuthStore } from "../../stores/auth";
  import ProBadge from "../ui/ProBadge.vue";
  import UserAvatar from "../ui/UserAvatar.vue";

  const props = withDefaults(
    defineProps<{
      conversation: Conversation;
      /** Compact density — used inside the desktop Sidebar where space is tight. */
      compact?: boolean;
    }>(),
    { compact: false }
  );

  const { t, locale } = useI18n();
  const route = useRoute();
  const authStore = useAuthStore();

  const isActive = computed(
    () =>
      route.name === "chat" &&
      route.params.userId === props.conversation.partner.id
  );

  const isOwn = computed(
    () => props.conversation.lastMessage.senderId === authStore.user?.id
  );

  const ownReceipt = computed<"sent" | "read" | null>(() => {
    if (!isOwn.value) {
      return null;
    }
    return props.conversation.lastMessage.readAt === null ? "sent" : "read";
  });

  const preview = computed(() => {
    const body = props.conversation.lastMessage.body;
    return isOwn.value ? `${t("chats.youPrefix")} ${body}` : body;
  });

  const relativeTime = computed(() =>
    formatRelativeTime(
      props.conversation.lastMessage.createdAt,
      locale.value as Parameters<typeof formatRelativeTime>[1]
    )
  );

  const unreadLabel = computed(() => {
    const n = props.conversation.unreadCount;
    if (n <= 0) {
      return null;
    }
    return n > 99 ? "99+" : String(n);
  });
</script>

<template>
  <RouterLink
    :to="`/chat/${conversation.partner.id}`"
    :class="[
      'group relative flex items-start gap-3 border-l-2 px-4 py-3 transition-[background-color,border-color] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text',
      isActive
        ? 'border-l-text bg-surface-subtle'
        : 'border-l-transparent hover:bg-surface-subtle/60',
      compact ? 'gap-2 py-2.5' : '',
    ]"
    :aria-current="isActive ? 'page' : undefined"
  >
    <div class="relative shrink-0">
      <UserAvatar :user="conversation.partner" :size="compact ? 44 : 52" />
      <span
        v-if="conversation.partner.isOnline"
        class="absolute -right-0.5 -bottom-0.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-500"
        aria-label="online"
      />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-2">
        <div class="flex min-w-0 items-baseline gap-1.5">
          <p
            class="truncate font-display text-base font-medium leading-tight text-text"
            style="font-variation-settings: 'opsz' 30, 'SOFT' 50"
          >
            {{ conversation.partner.displayName }}
          </p>
          <ProBadge v-if="conversation.partner.isPro" />
        </div>
        <span
          class="shrink-0 font-mono text-2xs uppercase tracking-wider text-text-muted"
        >
          {{ relativeTime }}
        </span>
      </div>
      <div class="mt-0.5 flex items-center justify-between gap-2">
        <p
          class="min-w-0 flex-1 truncate font-sans text-xs leading-snug text-text-muted"
        >
          {{ preview }}
          <HugeiconsIcon
            v-if="ownReceipt"
            :icon="ownReceipt === 'read' ? TickDouble01Icon : Tick01Icon"
            :size="13"
            :stroke-width="2"
            color="currentColor"
            class="ml-1 inline-block shrink-0 text-text"
            aria-hidden="true"
          />
        </p>
        <span
          v-if="unreadLabel"
          class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-none bg-brand-500 px-1.5 font-mono text-2xs font-medium text-text"
        >
          {{ unreadLabel }}
        </span>
      </div>
    </div>
  </RouterLink>
</template>
