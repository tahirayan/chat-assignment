<script setup lang="ts">
  /**
   * Phase 19 — Notification consent banner.
   *
   * Shows on first authed app open when permission is still `default`
   * and the user hasn't already dismissed. NOT a bare native prompt —
   * we show a small in-app explainer first, then call
   * `Notification.requestPermission()` from the Allow button so it's a
   * proper user gesture (Safari requires this).
   *
   * Visibility rules:
   *   • permission === "default" (never asked yet)
   *   • not dismissed in localStorage
   *   • browser supports the API
   *   • not iOS Safari outside standalone PWA mode (Apple rejects the
   *     prompt there entirely until the user installs to home screen)
   *
   * Once Allow / Not now is clicked, the banner self-dismisses for the
   * rest of the session. Users can flip the toggle back on via Profile.
   */
  import { Notification03Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import {
    isStandalonePWA,
    useBrowserNotifications,
  } from "../../composables/useBrowserNotifications";
  import { useWebPush } from "../../composables/useWebPush";
  import BaseButton from "../ui/BaseButton.vue";

  const IOS_UA = /iPad|iPhone|iPod/;

  const { t } = useI18n();
  const browserNotif = useBrowserNotifications();
  const webPush = useWebPush();

  const shouldShow = computed(() => {
    if (!browserNotif.isSupported()) {
      return false;
    }
    if (browserNotif.permission.value !== "default") {
      return false;
    }
    if (browserNotif.dismissed.value) {
      return false;
    }
    // iOS Safari refuses the prompt outside standalone PWA mode. Showing
    // a banner whose Allow button will never work is worse than nothing —
    // route iOS users through the Install banner first.
    if (!(browserNotif.canPromptWithoutGesture() || isStandalonePWA())) {
      // Other Safari (macOS) can prompt from a gesture, so we still show
      // the banner there. Only suppress on iOS-non-standalone.
      const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
      if (IOS_UA.test(ua)) {
        return false;
      }
    }
    return true;
  });

  async function onAllow(): Promise<void> {
    const result = await browserNotif.requestPermission();
    // If the user granted, immediately register the Web Push subscription
    // so closed-PWA notifications start working from the very next event,
    // not on the next app open.
    if (result === "granted") {
      await webPush.subscribe();
    }
  }

  function onDecline(): void {
    browserNotif.dismiss();
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="consent-banner">
      <div
        v-if="shouldShow"
        role="dialog"
        :aria-label="t('notifications.permissionTitle')"
        class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[var(--shadow-card)]"
      >
        <div class="mx-auto flex max-w-md items-start gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"
            aria-hidden="true"
          >
            <HugeiconsIcon
              :icon="Notification03Icon"
              :size="22"
              :stroke-width="1.5"
              color="currentColor"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-text">
              {{ t("notifications.permissionTitle") }}
            </p>
            <p class="mt-0.5 text-xs leading-snug text-text-muted">
              {{ t("notifications.permissionBody") }}
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <BaseButton variant="default" type="button" @click="onAllow">
                {{ t("notifications.permissionGrant") }}
              </BaseButton>
              <BaseButton variant="ghost" type="button" @click="onDecline">
                {{ t("notifications.permissionDeny") }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .consent-banner-enter-active,
  .consent-banner-leave-active {
    transition:
      transform 200ms ease,
      opacity 200ms ease;
  }
  .consent-banner-enter-from,
  .consent-banner-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }
</style>
