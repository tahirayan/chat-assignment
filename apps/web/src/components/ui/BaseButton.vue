<script setup lang="ts">
  /**
   * Button — shadcn-style.
   *
   * Every variant's classes live inline in this file (no `.btn-*` utility
   * classes in theme.css). Pick a `variant` and a `size`; the component
   * composes the right Tailwind string. Parent `class="..."` is merged
   * automatically by Vue's attribute fallthrough.
   *
   * Variants match shadcn's roster — `default` (brand-filled), `destructive`,
   * `outline`, `secondary`, `ghost`, `link`. Sizes likewise — `default`,
   * `sm`, `lg`, `icon` (square, no horizontal padding).
   */
  import { computed, ref, useAttrs } from "vue";
  import { cn } from "../../lib/cn";

  defineOptions({ inheritAttrs: false });

  // Expose the underlying <button> element so callers can read its
  // bounding box for popover anchoring etc. Mirrors React's forwardRef.
  const el = ref<HTMLButtonElement | null>(null);
  defineExpose({ el });

  type Variant =
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  type Size = "default" | "sm" | "lg" | "icon";

  const props = withDefaults(
    defineProps<{
      variant?: Variant;
      size?: Size;
      type?: "button" | "submit" | "reset";
      loading?: boolean;
      disabled?: boolean;
    }>(),
    {
      variant: "default",
      size: "default",
      type: "button",
      loading: false,
      disabled: false,
    }
  );

  /*
   * Editorial-redesign button system.
   *
   * Slab corners (rounded-none) and a 1px ink border on most variants —
   * we're imitating ink-on-paper stamps, not the floaty pill-shaped
   * buttons of modern web. The `default` variant is the loud one: a
   * solid phosphor-mint plate with ink text. `outline` reverses it
   * (ivory plate, ink hairline). `ghost` has no border at all and just
   * underlines on hover, matching the literary `.ink-link` pattern.
   */
  const BASE =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-sans text-xs font-medium tracking-tight transition-[background-color,color,border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40";

  const VARIANTS: Record<Variant, string> = {
    // Phosphor plate — the only saturated colour in the whole app. No
    // border: the mint plate carries itself, and the design has too
    // many decorative outlines as-is.
    default: "bg-brand-500 text-text hover:bg-brand-400 active:bg-brand-600",
    // Destructive = vermilion type on ivory, no border, the colour does
    // the warning.
    destructive:
      "bg-transparent text-danger hover:bg-danger hover:text-surface-subtle active:bg-danger/90",
    // Outline KEEPS its hairline ink border — it's literally what makes
    // it the outline variant.
    outline:
      "bg-surface-subtle text-text border border-text hover:bg-text hover:text-surface-subtle active:bg-text/90",
    // Secondary = linen plate, no border, ink text. For tertiary actions.
    secondary:
      "bg-surface-muted text-text hover:bg-border/40 active:bg-border/60",
    // Ghost = invisible until hover.
    ghost:
      "bg-transparent text-text hover:bg-surface-muted active:bg-border/40",
    // Link = inline literary link with dotted-then-solid underline.
    link: "text-text underline decoration-dotted decoration-text-muted underline-offset-[5px] hover:decoration-solid hover:decoration-text px-0",
  };

  const SIZES: Record<Size, string> = {
    default: "h-9 px-4",
    sm: "h-7 px-3 text-2xs",
    lg: "h-11 px-6 text-sm",
    icon: "h-9 w-9 p-0",
  };

  const attrs = useAttrs();
  const cls = computed(() =>
    cn(BASE, VARIANTS[props.variant], SIZES[props.size], attrs.class as string)
  );
</script>

<template>
  <button
    ref="el"
    v-bind="$attrs"
    :class="cls"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span
      v-if="loading"
      class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
