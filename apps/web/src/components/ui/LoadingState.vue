<script setup lang="ts">
  import { useI18n } from "vue-i18n";

  defineProps<{ label?: string }>();

  const { t } = useI18n();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 py-12 text-text-muted"
    role="status"
    aria-live="polite"
  >
    <span
      class="inline-block w-6 h-6 rounded-full border-2 border-current border-r-transparent animate-spin"
      aria-hidden="true"
    />
    <p class="text-sm">{{ label ?? t("states.loading") }}</p>
  </div>
</template>
