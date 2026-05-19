<script setup lang="ts">
  /**
   * Avatar dropdown in the TopBar. Replaces the old NavRail's
   * Profile/Upgrade/Logout links — those views are still routed, just
   * reached from here now that the side rail is gone.
   */
  import {
    Crown02Icon,
    Logout01Icon,
    UserCircleIcon,
  } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed, onBeforeUnmount, onMounted, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRouter } from "vue-router";
  import { useAuthStore } from "../../stores/auth";
  import UserAvatar from "../ui/UserAvatar.vue";

  const { t } = useI18n();
  const router = useRouter();
  const authStore = useAuthStore();

  const isOpen = ref(false);
  const buttonEl = ref<HTMLButtonElement | null>(null);
  const menuEl = ref<HTMLElement | null>(null);

  const displayName = computed(() => authStore.user?.displayName ?? "");
  const isPro = computed(() => authStore.user?.isPro ?? false);

  function toggle(): void {
    isOpen.value = !isOpen.value;
  }

  function close(): void {
    isOpen.value = false;
  }

  function go(path: string): void {
    close();
    router.push(path);
  }

  async function onLogout(): Promise<void> {
    close();
    // biome-ignore lint/suspicious/noAlert: PRD §11.6 — native confirm is intentional for a single log-out gate
    if (!window.confirm(t("profile.logoutConfirm"))) {
      return;
    }
    await authStore.logout();
    await router.push("/auth");
  }

  function onDocClick(ev: MouseEvent): void {
    if (!isOpen.value) {
      return;
    }
    const target = ev.target as Node | null;
    if (!target) {
      return;
    }
    if (menuEl.value?.contains(target) || buttonEl.value?.contains(target)) {
      return;
    }
    close();
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape" && isOpen.value) {
      close();
    }
  }

  onMounted(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeydown);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKeydown);
  });
</script>

<template>
  <div v-if="authStore.user" class="relative shrink-0">
    <button
      ref="buttonEl"
      type="button"
      class="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      :aria-label="displayName"
      :aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <UserAvatar :user="authStore.user" :size="32" />
    </button>

    <Transition name="menu">
      <div
        v-if="isOpen"
        ref="menuEl"
        role="menu"
        class="absolute right-0 top-full z-40 mt-1 w-60 overflow-hidden rounded-none bg-surface-subtle shadow-[var(--shadow-card)]"
      >
        <div class="flex flex-col gap-0.5 px-4 py-3">
          <p
            class="truncate font-display text-sm font-medium leading-tight text-text"
            style="font-variation-settings: 'opsz' 28, 'SOFT' 50"
          >
            {{ displayName }}
          </p>
          <p class="truncate font-mono text-2xs text-text-muted">
            {{ authStore.user?.email }}
          </p>
        </div>

        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none"
          @click="go('/profile')"
        >
          <HugeiconsIcon
            :icon="UserCircleIcon"
            :size="18"
            :stroke-width="1.5"
            color="currentColor"
            class="shrink-0 text-text-muted"
            aria-hidden="true"
          />
          {{ t("profile.title") }}
        </button>

        <button
          v-if="!isPro"
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-brand-500 transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none"
          @click="go('/upgrade')"
        >
          <HugeiconsIcon
            :icon="Crown02Icon"
            :size="18"
            :stroke-width="1.5"
            color="currentColor"
            class="shrink-0"
            aria-hidden="true"
          />
          {{ t("profile.upgradeCta") }}
        </button>

        <button
          type="button"
          role="menuitem"
          class="mt-1 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-danger transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none"
          @click="onLogout"
        >
          <HugeiconsIcon
            :icon="Logout01Icon"
            :size="18"
            :stroke-width="1.5"
            color="currentColor"
            class="shrink-0"
            aria-hidden="true"
          />
          {{ t("profile.logout") }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
  .menu-enter-active,
  .menu-leave-active {
    transition:
      transform 140ms ease,
      opacity 140ms ease;
  }
  .menu-enter-from,
  .menu-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
</style>
