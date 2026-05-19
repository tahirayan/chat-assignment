<script setup lang="ts">
  /**
   * Right column of the three-column AppLayout — always-visible
   * community roster. Mirrors what `CommunityView` used to render as a
   * full page, but as a permanent pane the user can scan while
   * chatting in the center column.
   *
   * Search is local-only (filters the already-fetched users list).
   * Clicking a row opens `/chat/<userId>` in the center column.
   */
  import { Search01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import { useUsersStore } from "../../stores/users";
  import BaseInput from "../ui/BaseInput.vue";
  import EmptyState from "../ui/EmptyState.vue";
  import ErrorState from "../ui/ErrorState.vue";
  import LoadingState from "../ui/LoadingState.vue";
  import UserRow from "../ui/UserRow.vue";

  const { t } = useI18n();
  const usersStore = useUsersStore();
  const query = ref("");

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      return {
        online: usersStore.onlineUsers,
        offline: usersStore.offlineUsers,
      };
    }
    const match = (name: string) => name.toLowerCase().includes(q);
    return {
      online: usersStore.onlineUsers.filter((u) => match(u.displayName)),
      offline: usersStore.offlineUsers.filter((u) => match(u.displayName)),
    };
  });

  const hasAnyUsers = computed(() => usersStore.all.length > 0);
  const hasFilteredResults = computed(
    () => filtered.value.online.length + filtered.value.offline.length > 0
  );

  function onRetry(): void {
    usersStore.fetchAll().catch(() => undefined);
  }
</script>

<template>
  <aside
    class="flex flex-col border-l border-border bg-surface"
    :aria-label="t('community.title')"
  >
    <header class="flex h-12 shrink-0 items-end justify-between px-5 pb-2">
      <h2 class="eyebrow">{{ t("community.title") }}</h2>
      <span v-if="hasAnyUsers" class="font-mono text-2xs text-text-muted">
        {{ usersStore.all.length }}
      </span>
    </header>

    <div class="px-3 py-2">
      <div class="relative">
        <HugeiconsIcon
          :icon="Search01Icon"
          :size="16"
          :stroke-width="1.5"
          color="currentColor"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <BaseInput
          v-model="query"
          type="search"
          class="pl-9"
          :placeholder="t('community.searchPlaceholder')"
          :aria-label="t('community.searchPlaceholder')"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <LoadingState
        v-if="usersStore.isLoading && !hasAnyUsers"
        class="p-4"
        :label="t('common.loading')"
      />
      <ErrorState v-else-if="usersStore.error" class="p-4" @retry="onRetry" />
      <EmptyState
        v-else-if="!hasAnyUsers"
        class="p-4"
        :title="t('community.empty')"
      />
      <EmptyState
        v-else-if="!hasFilteredResults"
        class="p-4"
        :title="t('community.emptyFiltered', { query: query.trim() })"
      />
      <div v-else class="flex flex-col">
        <section v-if="filtered.online.length > 0">
          <h3 class="flex items-baseline justify-between px-5 pb-1 pt-2">
            <span class="eyebrow">{{ t("community.sections.online") }}</span>
            <span class="font-mono text-2xs text-text-muted">
              {{ filtered.online.length }}
            </span>
          </h3>
          <ul class="flex flex-col">
            <li v-for="u in filtered.online" :key="u.id">
              <UserRow :user="u" />
            </li>
          </ul>
        </section>
        <section v-if="filtered.offline.length > 0" class="mt-3">
          <h3 class="flex items-baseline justify-between px-5 pb-1 pt-2">
            <span class="eyebrow">{{ t("community.sections.offline") }}</span>
            <span class="font-mono text-2xs text-text-muted">
              {{ filtered.offline.length }}
            </span>
          </h3>
          <ul class="flex flex-col">
            <li v-for="u in filtered.offline" :key="u.id">
              <UserRow :user="u" />
            </li>
          </ul>
        </section>
      </div>
    </div>
  </aside>
</template>
