<script setup lang="ts">
  /**
   * Lylia Chat — three-column workspace.
   *
   *   ┌────────────────────────────────────────────────────────────────┐
   *   │  TopBar (logo · spacer · bell · avatar)                        │
   *   ├──────────────┬──────────────────────────┬──────────────────────┤
   *   │ ChatsPane    │ <RouterView />           │ CommunityPane         │
   *   │ (conversa-   │ (thread / profile /      │ (online + offline     │
   *   │ tions list)  │  upgrade / empty state)  │ members, searchable)  │
   *   └──────────────┴──────────────────────────┴──────────────────────┘
   *
   * Both side panes are permanent on desktop (≥ md). On mobile the side
   * panes collapse and the center column fills the viewport; the chats
   * list is the primary mobile pane (visible at `/`), and the community
   * is reached via a slide-in drawer toggled from the TopBar.
   */
  import { computed, watch } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRoute } from "vue-router";
  import ChatsPane from "../components/layout/ChatsPane.vue";
  import CommunityPane from "../components/layout/CommunityPane.vue";
  import TopBar from "../components/layout/TopBar.vue";
  import { useBreakpoint } from "../composables/useBreakpoint";
  import { useCommunityDrawer } from "../composables/useCommunityDrawer";

  const { isMd } = useBreakpoint();
  const route = useRoute();
  const { t } = useI18n();
  const { isOpen: isCommunityDrawerOpen, close: closeCommunityDrawer } =
    useCommunityDrawer();

  // Mobile-only: when the user is reading a thread, the side panes hide
  // and the thread fills the viewport. On the home route (no thread
  // open) we show the chats list as the primary mobile pane.
  const mobileShowsChats = computed(
    () => route.name === "chats" || route.name === undefined
  );

  // Auto-close the drawer when the user crosses md (pane is permanently
  // visible there) or navigates routes.
  watch([isMd, () => route.fullPath], () => closeCommunityDrawer());
</script>

<template>
  <div class="flex h-dvh flex-col bg-surface text-text">
    <TopBar />

    <!-- Desktop: permanent 3-column workspace. -->
    <div
      v-if="isMd"
      class="grid flex-1 overflow-hidden"
      style="grid-template-columns: 20rem minmax(0, 1fr) 20rem"
    >
      <ChatsPane />
      <main class="min-w-0 overflow-hidden">
        <RouterView />
      </main>
      <CommunityPane />
    </div>

    <!-- Mobile: one pane at a time. Chats list on /, thread on /chat/:id,
         profile/upgrade as their own views. Community is reached via the
         slide-in drawer below. -->
    <template v-else>
      <ChatsPane v-if="mobileShowsChats" class="flex-1 overflow-hidden" />
      <main v-else class="flex-1 overflow-hidden">
        <RouterView />
      </main>

      <!-- Mobile community drawer — slides in from the right. Hidden in
           the inert tree until opened so screen readers don't tab into a
           closed panel. -->
      <Teleport to="body">
        <Transition name="community-drawer">
          <div
            v-if="isCommunityDrawerOpen"
            class="fixed inset-0 z-40 flex justify-end"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              class="absolute inset-0 cursor-default bg-text/40"
              :aria-label="t('common.close')"
              @click="closeCommunityDrawer"
            />
            <div
              class="relative flex h-dvh w-[min(20rem,85vw)] flex-col bg-surface-subtle shadow-2xl"
            >
              <CommunityPane class="h-full" />
            </div>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
  .community-drawer-enter-active,
  .community-drawer-leave-active {
    transition: opacity 200ms ease;
  }
  .community-drawer-enter-active > div:last-child,
  .community-drawer-leave-active > div:last-child {
    transition: transform 200ms ease;
  }
  .community-drawer-enter-from,
  .community-drawer-leave-to {
    opacity: 0;
  }
  .community-drawer-enter-from > div:last-child,
  .community-drawer-leave-to > div:last-child {
    transform: translateX(100%);
  }
</style>
