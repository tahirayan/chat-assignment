<script setup lang="ts">
  import { useI18n } from "vue-i18n";

  withDefaults(
    defineProps<{
      /** Hide visually but keep a screen-reader label. */
      srOnly?: boolean;
      /** Size hint — "xs" matches inline-with-username spots; "sm" is profile-header. */
      size?: "xs" | "sm";
    }>(),
    { srOnly: false, size: "xs" }
  );

  const { t } = useI18n();
</script>

<template>
  <span
    :class="[
      'inline-flex shrink-0 items-center rounded-none bg-brand-500 font-mono font-medium uppercase tracking-[0.08em] text-text',
      size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-1 py-px text-2xs',
      srOnly ? 'sr-only' : '',
    ]"
    :aria-label="t('profile.proBadge')"
  >
    {{ t("profile.proBadge") }}
  </span>
</template>
