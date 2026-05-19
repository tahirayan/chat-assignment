<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, watch } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRoute } from "vue-router";
  import CallModal from "./components/call/CallModal.vue";
  import InstallPromptBanner from "./components/InstallPromptBanner.vue";
  import NotificationConsentBanner from "./components/notifications/NotificationConsentBanner.vue";
  import Toaster from "./components/ui/Toaster.vue";
  import { useSocket } from "./composables/useSocket";
  import { setLocale } from "./i18n";
  import AppLayout from "./layouts/AppLayout.vue";
  import AuthLayout from "./layouts/AuthLayout.vue";
  import { useAuthStore } from "./stores/auth";
  import { useChatStore } from "./stores/chat";
  import { useNotificationsStore } from "./stores/notifications";
  import { useUsersStore } from "./stores/users";

  const route = useRoute();
  const { locale: i18nLocale } = useI18n();
  const authStore = useAuthStore();
  const usersStore = useUsersStore();
  const chatStore = useChatStore();
  const notificationsStore = useNotificationsStore();

  const layout = computed(() => route.meta.layout ?? "app");

  // Install the socket watcher once. It follows authStore.accessToken —
  // connects when set, disconnects on null.
  useSocket();

  // PRD §14.2: when a user lands (login / bootstrap / refresh), the
  // server-stored locale wins over the locally detected one. This watcher
  // mirrors `user.locale` → i18n + localStorage so a user logging in on a
  // device with the wrong default language gets their saved preference.
  watch(
    () => authStore.user?.locale,
    (serverLocale) => {
      if (serverLocale && serverLocale !== i18nLocale.value) {
        setLocale(serverLocale);
      }
    },
    { immediate: true }
  );

  // Mirror auth state: fetch users + conversations on login; clear on logout.
  // Also (re)bind the notifications feed to the active user — it's
  // persisted per-user in localStorage so the store needs the id.
  watch(
    () => authStore.user?.id ?? null,
    (userId) => {
      if (userId) {
        usersStore.fetchAll().catch(() => undefined);
        chatStore.fetchConversations().catch(() => undefined);
        notificationsStore.initForUser(userId);
      } else {
        usersStore.clear();
        chatStore.clear();
        notificationsStore.initForUser(null);
      }
    },
    { immediate: true }
  );

  onMounted(() => {
    // Fire-and-forget: bootstrap failure just leaves the user unauthenticated,
    // and the route guard sends them to /auth.
    authStore.bootstrap().catch(() => undefined);
  });

  // ─── Tab-visibility refetch ───────────────────────────────────────────
  // Mobile browsers (especially iOS Safari) suspend the WebSocket when a
  // tab is backgrounded; on resume the socket reconnects and `useSocket`
  // already calls `resyncFromServer()`. On desktop a tab can be
  // backgrounded for minutes without the socket closing — refetch on
  // focus is the cheap safety net. Throttled to once per 10s so rapid
  // alt-tabbing doesn't hammer the API.
  const VISIBILITY_REFETCH_INTERVAL_MS = 10_000;
  let lastVisibilityRefetchAt = 0;
  function onVisibilityChange(): void {
    if (
      typeof document === "undefined" ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    if (!authStore.isAuthenticated) {
      return;
    }
    const now = Date.now();
    if (now - lastVisibilityRefetchAt < VISIBILITY_REFETCH_INTERVAL_MS) {
      return;
    }
    lastVisibilityRefetchAt = now;
    Promise.allSettled([
      usersStore.fetchAll(),
      chatStore.fetchConversations(),
    ]).catch(() => undefined);
  }

  onMounted(() => {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
  });
  onBeforeUnmount(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  });
</script>

<template>
  <AuthLayout v-if="layout === 'auth'">
    <RouterView />
  </AuthLayout>
  <AppLayout v-else />
  <Toaster />
  <InstallPromptBanner />
  <!-- Only ask authed users — never on the AuthView, never on logout. -->
  <NotificationConsentBanner v-if="authStore.isAuthenticated" />
  <CallModal />
</template>
