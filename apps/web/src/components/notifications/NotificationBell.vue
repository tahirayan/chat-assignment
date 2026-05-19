<script setup lang="ts">
  import { Notification03Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed, ref, useTemplateRef } from "vue";
  import { useI18n } from "vue-i18n";
  import { useNotificationsStore } from "../../stores/notifications";
  import BaseButton from "../ui/BaseButton.vue";
  import NotificationsDropdown from "./NotificationsDropdown.vue";

  const { t } = useI18n();
  const store = useNotificationsStore();

  const isOpen = ref(false);
  const buttonRef = useTemplateRef<{ el: HTMLButtonElement | null }>("button");
  const buttonEl = computed(() => buttonRef.value?.el ?? null);

  const badge = computed(() => {
    const n = store.unreadCount;
    if (n <= 0) {
      return null;
    }
    return n > 99 ? "99+" : String(n);
  });

  function toggle(): void {
    isOpen.value = !isOpen.value;
  }
</script>

<template>
  <div class="relative shrink-0">
    <BaseButton
      ref="button"
      variant="ghost"
      size="icon"
      class="relative"
      :aria-label="t('notifications.open')"
      :aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <HugeiconsIcon
        :icon="Notification03Icon"
        :size="20"
        :stroke-width="1.5"
        color="currentColor"
        aria-hidden="true"
      />
      <span
        v-if="badge"
        class="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-none bg-brand-500 px-1 font-mono text-2xs font-medium text-text"
      >
        {{ badge }}
      </span>
    </BaseButton>

    <NotificationsDropdown
      :open="isOpen"
      :anchor-el="buttonEl"
      @close="isOpen = false"
    />
  </div>
</template>
