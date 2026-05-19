<script setup lang="ts">
  /**
   * Empty-state center column. Rebuilt around the Facehash component —
   * the user's own deterministic face is the hero, framed like a
   * Polaroid; below it, a "today's correspondents" strip of community
   * facehashes, each rotated a tiny stable amount so the row reads
   * like polaroids pinned to a corkboard.
   */
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { RouterLink } from "vue-router";
  import UserAvatar from "../components/ui/UserAvatar.vue";
  import { useAuthStore } from "../stores/auth";
  import { useChatStore } from "../stores/chat";
  import { useUsersStore } from "../stores/users";

  const { t } = useI18n();
  const chatStore = useChatStore();
  const authStore = useAuthStore();
  const usersStore = useUsersStore();

  const hasConversations = computed(() => chatStore.conversations.length > 0);

  // Time-of-day greeting — drives a small Fraunces salutation that
  // changes through the day. Falls back to "Welcome" before login.
  const greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 5) {
      return "Good evening";
    }
    if (h < 12) {
      return "Good morning";
    }
    if (h < 18) {
      return "Good afternoon";
    }
    return "Good evening";
  });

  // Up to 8 community members for the "correspondents" strip. Prefer
  // people currently online so the strip feels alive; back-fill with
  // offline if needed.
  const correspondents = computed(() => {
    const online = usersStore.onlineUsers.filter(
      (u) => u.id !== authStore.user?.id
    );
    const offline = usersStore.offlineUsers.filter(
      (u) => u.id !== authStore.user?.id
    );
    return [...online, ...offline].slice(0, 8);
  });

  // Tiny per-id stable tilt so each polaroid lands at a different angle.
  function tilt(id: string): string {
    let acc = 0;
    for (let i = 0; i < id.length; i++) {
      acc = (acc + id.charCodeAt(i)) % 9;
    }
    // Map 0..8 to -8°..+8° in 2° steps.
    return `${(acc - 4) * 2}deg`;
  }
</script>

<template>
  <article class="relative mx-auto flex h-full max-w-2xl flex-col px-10 py-12">
    <!-- Editorial folio at top -->
    <div class="mb-8 flex items-baseline justify-between">
      <span class="eyebrow">Correspondence</span>
      <span class="font-mono text-2xs text-text-muted">
        {{ chatStore.conversations.length }}
        {{ chatStore.conversations.length === 1 ? "thread" : "threads" }}
      </span>
    </div>

    <!-- HERO: user's own facehash + Fraunces salutation -->
    <header v-if="authStore.user" class="mb-10 flex items-center gap-6 pb-6">
      <UserAvatar :user="authStore.user" :size="96" stamp />
      <div class="min-w-0">
        <p
          class="font-mono text-2xs uppercase tracking-[0.16em] text-text-muted"
        >
          {{ greeting }},
        </p>
        <h1
          class="mt-1 font-display text-5xl leading-[0.95] text-text"
          style="font-variation-settings: 'opsz' 144, 'SOFT' 30, 'wght' 500"
        >
          {{ authStore.user.displayName }}
        </h1>
      </div>
    </header>

    <!-- Polaroid strip: today's correspondents -->
    <section v-if="correspondents.length > 0" class="mb-10">
      <div class="mb-3 flex items-baseline justify-between">
        <span class="eyebrow">Today’s correspondents</span>
        <span class="font-mono text-2xs text-text-muted">
          {{ correspondents.length }}
        </span>
      </div>
      <ul class="flex flex-wrap items-end gap-3 py-2">
        <li
          v-for="u in correspondents"
          :key="u.id"
          :style="{ transform: `rotate(${tilt(u.id)})` }"
          class="transition-transform duration-200 ease-out hover:!rotate-0 hover:translate-y-[-2px]"
        >
          <RouterLink
            :to="`/chat/${u.id}`"
            class="flex flex-col items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-text"
            :title="u.displayName"
          >
            <UserAvatar :user="u" :size="56" stamp />
            <span
              class="max-w-[70px] truncate font-mono text-2xs uppercase tracking-wider text-text-muted"
            >
              {{ u.displayName }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <p
      class="mt-8 font-mono text-2xs uppercase tracking-[0.16em] text-text-muted"
    >
      {{ hasConversations
          ? t("chats.rightPane.empty")
          : t("chats.empty.title") }}
    </p>
  </article>
</template>
