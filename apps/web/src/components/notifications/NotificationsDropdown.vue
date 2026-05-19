<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRouter } from "vue-router";
  import {
    type NotificationEntry,
    useNotificationsStore,
  } from "../../stores/notifications";
  import NotificationItem from "./NotificationItem.vue";

  const props = defineProps<{
    open: boolean;
    /** Used to anchor click-outside dismissal — we ignore clicks on this. */
    anchorEl: HTMLElement | null;
  }>();

  const emit = defineEmits<{
    close: [];
  }>();

  const { t } = useI18n();
  const router = useRouter();
  const store = useNotificationsStore();
  const panelEl = ref<HTMLElement | null>(null);

  function onClickOutside(ev: MouseEvent): void {
    if (!props.open) {
      return;
    }
    const target = ev.target as Node | null;
    if (!target) {
      return;
    }
    if (panelEl.value?.contains(target)) {
      return;
    }
    if (props.anchorEl?.contains(target)) {
      // Clicking the bell while open should toggle, handled by the bell.
      return;
    }
    emit("close");
  }

  function onEscape(ev: KeyboardEvent): void {
    if (ev.key === "Escape" && props.open) {
      emit("close");
    }
  }

  onMounted(() => {
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("mousedown", onClickOutside);
    document.removeEventListener("keydown", onEscape);
  });

  function onSelect(entry: NotificationEntry): void {
    store.markRead(entry.id);
    // Routing: every kind we ship right now corresponds to a 1:1 thread.
    router.push(`/chat/${entry.senderId}`);
    emit("close");
  }

  function onMarkAll(): void {
    store.markAllRead();
  }
</script>

<template>
  <Transition name="dropdown">
    <div
      v-if="open"
      ref="panelEl"
      role="dialog"
      :aria-label="t('notifications.title')"
      class="fixed right-2 top-16 z-40 flex max-h-[80dvh] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-none bg-surface-subtle shadow-[var(--shadow-card)]"
    >
      <header class="flex items-baseline justify-between px-4 py-3">
        <h2 class="eyebrow">
          {{ t("notifications.title") }}
        </h2>
        <button
          v-if="store.unreadCount > 0"
          type="button"
          class="font-mono text-2xs uppercase tracking-wider text-text underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          @click="onMarkAll"
        >
          {{ t("notifications.markAllRead") }}
        </button>
      </header>

      <div
        v-if="store.entries.length === 0"
        class="flex flex-1 items-center justify-center px-4 py-12 text-center font-sans text-sm italic text-text-muted"
      >
        {{ t("notifications.empty") }}
      </div>

      <ul v-else class="flex-1 divide-y divide-border overflow-y-auto">
        <li v-for="entry in store.entries" :key="entry.id">
          <NotificationItem :entry="entry" @select="onSelect" />
        </li>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
  .dropdown-enter-active,
  .dropdown-leave-active {
    transition:
      transform 160ms ease,
      opacity 160ms ease;
  }
  .dropdown-enter-from,
  .dropdown-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
</style>
