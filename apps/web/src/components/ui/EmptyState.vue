<script setup lang="ts">
  import { useSlots } from "vue";

  defineProps<{
    title: string;
    description?: string;
  }>();

  const slots = useSlots();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center"
  >
    <h2 class="text-base font-medium text-text">{{ title }}</h2>
    <p v-if="description" class="text-sm text-text-muted max-w-sm">
      {{ description }}
    </p>
    <div v-if="slots.default" class="mt-2">
      <slot />
    </div>
  </div>
</template>
