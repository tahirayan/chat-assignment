<script setup lang="ts">
  /**
   * Textarea — shadcn-style. Same surface as BaseInput so they sit
   * together in forms; classes baked inline.
   */
  import { ref, useAttrs } from "vue";
  import { cn } from "../../lib/cn";
  import { INPUT_BASE, INPUT_INVALID } from "../../lib/input-styles";

  defineOptions({ inheritAttrs: false });

  withDefaults(
    defineProps<{
      modelValue: string;
      placeholder?: string;
      name?: string;
      id?: string;
      invalid?: boolean;
      disabled?: boolean;
      rows?: number;
    }>(),
    { invalid: false, disabled: false }
  );

  const emit = defineEmits<(e: "update:modelValue", value: string) => void>();

  const attrs = useAttrs();
  const el = ref<HTMLTextAreaElement | null>(null);
  defineExpose({ el });

  function onInput(e: Event): void {
    const target = e.target as HTMLTextAreaElement;
    emit("update:modelValue", target.value);
  }
</script>

<template>
  <textarea
    :id="id"
    ref="el"
    v-bind="$attrs"
    :name="name"
    :rows="rows"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="cn(INPUT_BASE, 'leading-snug', invalid ? INPUT_INVALID : '', attrs.class as string)"
    @input="onInput"
  />
</template>
