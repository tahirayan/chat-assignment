<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import Card from "../components/ui/Card.vue";

  const { t } = useI18n();
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center bg-surface-subtle p-4">
    <Card class="w-full max-w-md">
      <header class="mb-6 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ t("app.name") }}
        </h1>
        <p class="mt-1 text-sm text-text-muted">{{ t("app.tagline") }}</p>
      </header>
      <slot />
    </Card>
  </div>
</template>
