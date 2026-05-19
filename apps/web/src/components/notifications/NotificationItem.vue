<script setup lang="ts">
  import {
    CallIncoming01Icon,
    CallMissed01Icon,
  } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { formatRelativeTime } from "../../composables/useRelativeTime";
  import type { NotificationEntry } from "../../stores/notifications";
  import { useUsersStore } from "../../stores/users";
  import UserAvatar from "../ui/UserAvatar.vue";

  const props = defineProps<{
    entry: NotificationEntry;
  }>();

  defineEmits<{
    select: [entry: NotificationEntry];
  }>();

  const { t, locale } = useI18n();
  const usersStore = useUsersStore();

  // Best-effort avatar lookup. The notification was pushed with a frozen
  // displayName so the row label survives the sender being deleted/etc.,
  // but the avatar can update live when the users store has fresher data.
  const senderForAvatar = computed(() => {
    const live = usersStore.byId.get(props.entry.senderId);
    if (live) {
      return live;
    }
    return {
      id: props.entry.senderId,
      displayName: props.entry.senderName,
      avatarUrl: null,
    };
  });

  const headline = computed(() => {
    const params = { name: props.entry.senderName };
    switch (props.entry.kind) {
      case "message":
        return t("notifications.newMessage", params);
      case "incomingCall":
        return t("notifications.incomingCall", params);
      case "missedCall":
        return t("notifications.missedCall", params);
      default:
        return props.entry.senderName;
    }
  });

  const relativeTime = computed(() =>
    formatRelativeTime(
      props.entry.createdAt,
      locale.value as Parameters<typeof formatRelativeTime>[1]
    )
  );

  const callIcon = computed(() => {
    switch (props.entry.kind) {
      case "incomingCall":
        return CallIncoming01Icon;
      case "missedCall":
        return CallMissed01Icon;
      default:
        return null;
    }
  });
</script>

<template>
  <button
    type="button"
    :class="[
      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
      entry.readAt === null
        ? 'bg-brand-50 hover:bg-brand-100'
        : 'hover:bg-surface-subtle',
    ]"
    @click="$emit('select', entry)"
  >
    <div class="relative shrink-0">
      <UserAvatar :user="senderForAvatar" :size="36" />
      <span
        v-if="callIcon"
        :class="[
          'absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface text-text shadow-sm',
          entry.kind === 'missedCall' ? 'text-danger' : 'text-success',
        ]"
        aria-hidden="true"
      >
        <HugeiconsIcon
          :icon="callIcon"
          :size="12"
          :stroke-width="2"
          color="currentColor"
        />
      </span>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-sm font-medium text-text">{{ headline }}</p>
        <span class="shrink-0 text-2xs text-text-muted"
          >{{ relativeTime }}</span
        >
      </div>
      <p
        v-if="entry.body"
        class="truncate text-xs text-text-muted"
        :title="entry.body"
      >
        {{ entry.body }}
      </p>
    </div>
    <span
      v-if="entry.readAt === null"
      class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-brand-500"
      aria-hidden="true"
    />
  </button>
</template>
