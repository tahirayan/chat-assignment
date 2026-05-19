<script setup lang="ts">
  import type { PublicUser } from "@chat/shared-types";
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { RouterLink } from "vue-router";
  import { formatRelativeTime } from "../../composables/useRelativeTime";
  import ProBadge from "./ProBadge.vue";
  import UserAvatar from "./UserAvatar.vue";

  const props = withDefaults(
    defineProps<{
      user: PublicUser;
      /** Override the route — defaults to /chat/:userId. */
      to?: string;
    }>(),
    { to: undefined }
  );

  const { t, locale } = useI18n();

  const target = computed(() => props.to ?? `/chat/${props.user.id}`);

  // Subtitle line: bio (truncated by CSS) → fall back to last-seen for offline
  // → "offline" if we never saw them connect. Online users without a bio show
  // a literal "online" microcopy.
  const subtitle = computed(() => {
    if (props.user.bio && props.user.bio.trim() !== "") {
      return props.user.bio;
    }
    if (props.user.isOnline) {
      return t("community.sections.online").toLowerCase();
    }
    if (props.user.lastSeenAt) {
      return t("community.lastSeen", {
        time: formatRelativeTime(
          props.user.lastSeenAt,
          locale.value as Parameters<typeof formatRelativeTime>[1]
        ),
      });
    }
    return t("community.lastSeenUnknown");
  });
</script>

<template>
  <RouterLink
    :to="target"
    class="group flex items-center gap-3 px-3 py-2.5 transition-[background-color] hover:bg-surface-subtle/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text"
  >
    <div class="relative shrink-0">
      <UserAvatar :user="user" :size="44" />
      <span
        :class="[
          'absolute -right-0.5 -bottom-0.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-surface',
          user.isOnline ? 'bg-brand-500' : 'bg-border',
        ]"
        :aria-label="user.isOnline ? 'online' : 'offline'"
      />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-1.5">
        <p
          class="truncate font-display text-sm font-medium leading-tight text-text"
          style="font-variation-settings: 'opsz' 28, 'SOFT' 50"
        >
          {{ user.displayName }}
        </p>
        <ProBadge v-if="user.isPro" />
      </div>
      <p class="truncate font-sans text-xs italic text-text-muted">
        {{ subtitle }}
      </p>
    </div>
  </RouterLink>
</template>
