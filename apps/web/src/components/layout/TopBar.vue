<script setup lang="ts">
  /**
   * Editorial TopBar — masthead, not a header.
   *
   * The brand name is set in Fraunces Display with a heavy SOFT axis,
   * paired with a tiny mono "EDITION" eyebrow on the left as if the
   * page were issue №42 of a newspaper. Right side: mobile community
   * toggle (md:hidden) + NotificationBell + UserMenu. Hairline rule
   * underneath.
   */
  import { UserMultiple02Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { useI18n } from "vue-i18n";
  import { useCommunityDrawer } from "../../composables/useCommunityDrawer";
  import NotificationBell from "../notifications/NotificationBell.vue";
  import BaseButton from "../ui/BaseButton.vue";
  import UserMenu from "./UserMenu.vue";

  const { t } = useI18n();
  const communityDrawer = useCommunityDrawer();

  // Stable per-day "issue number" — purely decorative editorial flourish.
  const issueNo = String(Math.floor(Date.now() / 86_400_000) % 9999).padStart(
    4,
    "0"
  );
</script>

<template>
  <header
    class="relative flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-5"
  >
    <!-- Eyebrow: edition number, like a newspaper folio -->
    <div class="hidden flex-col items-start leading-none md:flex">
      <span class="eyebrow">Vol. I</span>
      <span class="mt-0.5 font-mono text-2xs text-text-muted">
        Nº {{ issueNo }}
      </span>
    </div>

    <!-- Wordmark — set in Fraunces with dramatic optical sizing -->
    <RouterLink
      to="/"
      class="group flex items-baseline gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
      :aria-label="t('app.name')"
    >
      <span
        class="font-display text-3xl leading-none tracking-tight text-text transition-[font-variation-settings] duration-300 group-hover:[font-variation-settings:'opsz'_144,'SOFT'_100,'wght'_500]"
        style="font-variation-settings: 'opsz' 96, 'SOFT' 0, 'wght' 500"
      >
        {{ t("app.name") }}
      </span>
    </RouterLink>

    <div class="ml-auto flex items-center gap-1">
      <BaseButton
        variant="ghost"
        size="icon"
        class="md:hidden"
        :aria-label="t('community.title')"
        :title="t('community.title')"
        @click="communityDrawer.open"
      >
        <HugeiconsIcon
          :icon="UserMultiple02Icon"
          :size="20"
          :stroke-width="1.5"
          color="currentColor"
          aria-hidden="true"
        />
      </BaseButton>
      <NotificationBell />
      <UserMenu />
    </div>
  </header>
</template>
