<script setup lang="ts">
  /**
   * Card — shadcn-style surface. Bordered, rounded, soft shadow. Classes
   * baked inline; no `.card` utility class in theme.css.
   */
  import { useAttrs } from "vue";
  import { cn } from "../../lib/cn";

  defineOptions({ inheritAttrs: false });

  const attrs = useAttrs();

  /*
   * Editorial folio: ivory plate, hairline ink border, single page-lift
   * shadow that mimics the corner-shadow of a printed page resting on
   * the desk. No rounded corners — corners are sharp like a folded
   * letterhead.
   */
  /*
   * Editorial folio: ivory plate, single page-lift shadow. No border —
   * the shadow on its own gives enough separation from the paper bg,
   * and stacking a hairline on every Card was contributing to the
   * "everything has a border" feeling.
   */
  const BASE = "rounded-none bg-surface-subtle p-6 shadow-[var(--shadow-card)]";
</script>

<template>
  <div v-bind="$attrs" :class="cn(BASE, attrs.class as string)">
    <slot />
  </div>
</template>
