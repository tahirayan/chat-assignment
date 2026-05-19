<script setup lang="ts">
  /**
   * Select — shadcn-style. Same surface as BaseInput; classes baked
   * inline. Renders a native <select> + chevron via a wrapper so we
   * keep the platform picker UX (especially mobile bottom-sheet).
   */
  import { ref, useAttrs } from "vue";
  import { cn } from "../../lib/cn";
  import { INPUT_BASE, INPUT_INVALID } from "../../lib/input-styles";

  defineOptions({ inheritAttrs: false });

  withDefaults(
    defineProps<{
      modelValue: string;
      name?: string;
      id?: string;
      invalid?: boolean;
      disabled?: boolean;
    }>(),
    { invalid: false, disabled: false }
  );

  const emit = defineEmits<(e: "update:modelValue", value: string) => void>();

  const attrs = useAttrs();
  const el = ref<HTMLSelectElement | null>(null);
  defineExpose({ el });

  // Native `<select>` chrome stripped via `appearance-none`; `pr-8` makes
  // room for the chevron SVG that sits at right-2.5.
  const SELECT_EXTRAS = "appearance-none pr-8";

  function onChange(e: Event): void {
    const target = e.target as HTMLSelectElement;
    emit("update:modelValue", target.value);
  }
</script>

<template>
  <div class="relative">
    <select
      :id="id"
      ref="el"
      v-bind="$attrs"
      :name="name"
      :value="modelValue"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      :class="cn(INPUT_BASE, SELECT_EXTRAS, invalid ? INPUT_INVALID : '', attrs.class as string)"
      @change="onChange"
    >
      <slot />
    </select>
    <svg
      aria-hidden="true"
      class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
      fill="none"
      height="16"
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.75"
      />
    </svg>
  </div>
</template>
