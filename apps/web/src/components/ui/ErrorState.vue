<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import BaseButton from "./BaseButton.vue";

  defineProps<{
    title?: string;
    description?: string;
  }>();

  const emit = defineEmits<(e: "retry") => void>();

  const { t } = useI18n();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center"
    role="alert"
  >
    <h2 class="text-base font-medium text-text">
      {{ title ?? t("states.error") }}
    </h2>
    <p v-if="description" class="text-sm text-text-muted max-w-sm">
      {{ description }}
    </p>
    <BaseButton variant="ghost" type="button" @click="emit('retry')">
      {{ t("common.retry") }}
    </BaseButton>
  </div>
</template>
