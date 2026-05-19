<script setup lang="ts">
  import { computed, useId } from "vue";

  const props = defineProps<{
    label: string;
    errorMessage?: string | null;
    hint?: string;
    for?: string;
  }>();

  const generated = useId();
  const fieldId = computed(() => props.for ?? generated);
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="fieldId" class="text-sm font-medium text-text">
      {{ label }}
    </label>
    <slot :id="fieldId" :invalid="!!errorMessage" />
    <p v-if="errorMessage" :id="`${fieldId}-error`" class="text-xs text-danger">
      {{ errorMessage }}
    </p>
    <p v-else-if="hint" :id="`${fieldId}-hint`" class="text-xs text-text-muted">
      {{ hint }}
    </p>
  </div>
</template>
