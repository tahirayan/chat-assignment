<script setup lang="ts">
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { useUiStore } from "../../stores/ui";

  const { t } = useI18n();
  const uiStore = useUiStore();

  function kindClasses(kind: "info" | "success" | "warning" | "error"): string {
    switch (kind) {
      case "success":
        return "border-success/40 bg-success/10";
      case "warning":
        return "border-warning/40 bg-warning/10";
      case "error":
        return "border-danger/40 bg-danger/10";
      default:
        return "border-brand-200 bg-brand-50";
    }
  }

  const toasts = computed(() => uiStore.toasts);
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[
          'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-[var(--shadow-card)]',
          kindClasses(toast.kind),
        ]"
        role="status"
      >
        <p class="flex-1 leading-snug text-text">{{ toast.message }}</p>
        <button
          type="button"
          class="text-text-muted transition hover:text-text"
          :aria-label="t('common.dismiss')"
          @click="uiStore.dismissToast(toast.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>
