<script setup lang="ts">
  import { Call02Icon, Video01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed, onMounted, onUnmounted, watch } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRoute } from "vue-router";
  import ComposeBar from "../components/chat/ComposeBar.vue";
  import MessageList from "../components/chat/MessageList.vue";
  import BaseButton from "../components/ui/BaseButton.vue";
  import ErrorState from "../components/ui/ErrorState.vue";
  import LoadingState from "../components/ui/LoadingState.vue";
  import ProBadge from "../components/ui/ProBadge.vue";
  import UserAvatar from "../components/ui/UserAvatar.vue";
  import { setActiveThread, useSocket } from "../composables/useSocket";
  import { useWebRTC } from "../composables/useWebRTC";
  import { useAuthStore } from "../stores/auth";
  import { useChatStore } from "../stores/chat";
  import { useUsersStore } from "../stores/users";

  const route = useRoute();
  const { t } = useI18n();
  const authStore = useAuthStore();
  const chatStore = useChatStore();
  const usersStore = useUsersStore();
  const { emit } = useSocket();
  const { initiateCall } = useWebRTC();

  const partnerId = computed<string>(() => String(route.params.userId ?? ""));

  const messages = computed(() => chatStore.messagesFor(partnerId.value).value);
  const isLoading = computed(
    () => chatStore.isLoadingFor(partnerId.value).value
  );
  const loadError = computed(() => chatStore.errorFor(partnerId.value).value);
  const ownId = computed(() => authStore.user?.id ?? "");
  const isPartnerTyping = computed(
    () => chatStore.isTypingFor(partnerId.value).value
  );
  const partner = computed(() => usersStore.byId.get(partnerId.value) ?? null);
  const hasMore = computed(() => chatStore.hasMoreFor(partnerId.value).value);
  const isLoadingOlder = computed(
    () => chatStore.isOlderLoadingFor(partnerId.value).value
  );

  function loadHistory(): void {
    if (!partnerId.value) {
      return;
    }
    chatStore.fetchHistory(partnerId.value).catch(() => undefined);
    chatStore.markRead(partnerId.value).catch(() => undefined);
  }

  watch(
    partnerId,
    (next) => {
      setActiveThread(next || null);
      loadHistory();
    },
    { immediate: true }
  );

  onMounted(loadHistory);
  onUnmounted(() => setActiveThread(null));

  function onSend(body: string): void {
    if (!partnerId.value) {
      return;
    }
    chatStore.sendMessage(partnerId.value, body, { emit });
  }

  function onTypingStart(): void {
    if (!partnerId.value) {
      return;
    }
    emit("typing:start", { otherUserId: partnerId.value });
  }

  function onTypingStop(): void {
    if (!partnerId.value) {
      return;
    }
    emit("typing:stop", { otherUserId: partnerId.value });
  }

  function onLoadOlder(): void {
    if (!partnerId.value) {
      return;
    }
    chatStore.fetchOlder(partnerId.value).catch(() => undefined);
  }

  const isInitialLoad = computed(
    () => isLoading.value && messages.value.length === 0
  );

  const typingLabel = computed(() => {
    const name = partner.value?.displayName;
    return name ? t("chat.typing", { name }) : t("chat.typingAnon");
  });

  function onCall(type: "audio" | "video"): void {
    const p = partner.value;
    if (!p) {
      return;
    }
    initiateCall(p, type).catch(() => undefined);
  }
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Per-thread header — moved here from the global TopBar in the
         3-column redesign. Always sits above the message list. -->
    <header
      v-if="partner"
      class="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-5"
    >
      <div class="relative shrink-0">
        <UserAvatar :user="partner" :size="48" />
        <span
          :class="[
            'absolute -right-0.5 -bottom-0.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-surface',
            partner.isOnline ? 'bg-brand-500' : 'bg-border',
          ]"
          :aria-label="
            partner.isOnline ? t('presence.online') : t('presence.offline')
          "
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <p
            class="truncate font-display text-xl font-medium leading-none text-text"
            style="font-variation-settings: 'opsz' 60, 'SOFT' 30"
          >
            {{ partner.displayName }}
          </p>
          <ProBadge v-if="partner.isPro" />
        </div>
        <p
          class="mt-1 truncate font-mono text-2xs uppercase tracking-[0.16em] text-text-muted"
        >
          {{ partner.isOnline
              ? t("presence.online")
              : t("presence.offline") }}
        </p>
      </div>
      <BaseButton
        variant="ghost"
        size="icon"
        class="h-10 w-10 rounded-full"
        :aria-label="t('call.audio')"
        :title="t('call.audio')"
        @click="onCall('audio')"
      >
        <HugeiconsIcon
          :icon="Call02Icon"
          :size="20"
          :stroke-width="1.5"
          color="currentColor"
          aria-hidden="true"
        />
      </BaseButton>
      <BaseButton
        variant="ghost"
        size="icon"
        class="h-10 w-10 rounded-full"
        :aria-label="t('call.video')"
        :title="t('call.video')"
        @click="onCall('video')"
      >
        <HugeiconsIcon
          :icon="Video01Icon"
          :size="20"
          :stroke-width="1.5"
          color="currentColor"
          aria-hidden="true"
        />
      </BaseButton>
    </header>

    <!--
      All three branches MUST claim `flex-1` so the ComposeBar stays anchored
      to the bottom regardless of which state is rendering. Without this the
      ComposeBar visibly jumps when LoadingState (a small spinner) swaps for
      MessageList (full-height scroller) — Lighthouse flagged it as CLS.
    -->
    <LoadingState v-if="isInitialLoad" class="flex-1" />
    <ErrorState v-else-if="loadError" class="flex-1" @retry="loadHistory" />
    <MessageList
      v-else
      :messages="messages"
      :own-id="ownId"
      :has-more="hasMore"
      :is-loading-older="isLoadingOlder"
      @load-older="onLoadOlder"
    />

    <!-- Typing indicator strip above ComposeBar -->
    <div
      :class="[
        'flex h-6 items-center gap-2 px-5 font-sans text-xs italic text-text-muted transition-opacity',
        isPartnerTyping ? 'opacity-100' : 'opacity-0',
      ]"
      :aria-live="isPartnerTyping ? 'polite' : 'off'"
    >
      <span class="flex gap-0.5">
        <span
          class="h-1 w-1 animate-bounce rounded-none bg-text-muted [animation-delay:-0.3s]"
        />
        <span
          class="h-1 w-1 animate-bounce rounded-none bg-text-muted [animation-delay:-0.15s]"
        />
        <span class="h-1 w-1 animate-bounce rounded-none bg-text-muted" />
      </span>
      <span>{{ typingLabel }}</span>
    </div>

    <ComposeBar
      @send="onSend"
      @typing-start="onTypingStart"
      @typing-stop="onTypingStop"
    />
  </div>
</template>
