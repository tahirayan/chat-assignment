<script setup lang="ts">
  /**
   * Input — shadcn-style. Classes baked inline; no `.input` utility class
   * in theme.css. Parent `class="..."` merges via cn().
   */
  import { ref, useAttrs } from "vue";
  import { cn } from "../../lib/cn";
  import { INPUT_BASE, INPUT_INVALID } from "../../lib/input-styles";

  defineOptions({ inheritAttrs: false });

  withDefaults(
    defineProps<{
      modelValue: string;
      type?: string;
      placeholder?: string;
      autocomplete?: string;
      name?: string;
      id?: string;
      invalid?: boolean;
      disabled?: boolean;
    }>(),
    { type: "text", invalid: false, disabled: false }
  );

  const emit = defineEmits<(e: "update:modelValue", value: string) => void>();

  const attrs = useAttrs();
  const el = ref<HTMLInputElement | null>(null);
  defineExpose({ el });

  function onInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    emit("update:modelValue", target.value);
  }
</script>

<template>
  <input
    :id="id"
    ref="el"
    v-bind="$attrs"
    :name="name"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="cn(INPUT_BASE, invalid ? INPUT_INVALID : '', attrs.class as string)"
    @input="onInput"
  >
</template>
