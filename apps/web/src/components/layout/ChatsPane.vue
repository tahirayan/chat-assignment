<script setup lang="ts">
  /**
   * Left column of the three-column AppLayout.
   *
   * Always visible on desktop. Lists the user's conversations with the
   * active row highlighted when the matching /chat/:userId route is
   * focused. Replaces the previous Sidebar.vue which used to also host
   * the nav-rail at the bottom (removed in this redesign — profile and
   * upgrade are now reached via the TopBar UserMenu).
   */
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { useChatStore } from "../../stores/chat";
  import ConversationRow from "../chat/ConversationRow.vue";
  import EmptyState from "../ui/EmptyState.vue";
  import ErrorState from "../ui/ErrorState.vue";
  import LoadingState from "../ui/LoadingState.vue";

  const { t } = useI18n();
  const chatStore = useChatStore();

  const isInitialLoading = computed(
    () => chatStore.conversationsLoading && chatStore.conversations.length === 0
  );

  function onRetry(): void {
    chatStore.fetchConversations().catch(() => undefined);
  }
</script>

<template>
  <aside
    class="flex flex-col border-r border-border bg-surface"
    :aria-label="t('chats.title')"
  >
    <header class="flex h-12 shrink-0 items-end justify-between px-5 pb-2">
      <h2 class="eyebrow">{{ t("chats.title") }}</h2>
      <span
        v-if="chatStore.conversations.length > 0"
        class="font-mono text-2xs text-text-muted"
      >
        {{ chatStore.conversations.length }}
      </span>
    </header>

    <div class="flex-1 overflow-y-auto">
      <LoadingState v-if="isInitialLoading" class="p-4" />
      <ErrorState
        v-else-if="chatStore.conversationsError"
        class="p-4"
        @retry="onRetry"
      />
      <EmptyState
        v-else-if="chatStore.conversations.length === 0"
        class="p-4"
        :title="t('chats.empty.title')"
      />
      <ul v-else class="flex flex-col py-1">
        <li v-for="c in chatStore.conversations" :key="c.partner.id">
          <ConversationRow :conversation="c" compact />
        </li>
      </ul>
    </div>
  </aside>
</template>
