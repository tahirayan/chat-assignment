<script setup lang="ts">
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import { useInstallPrompt } from "../composables/useInstallPrompt";
  import BaseButton from "./ui/BaseButton.vue";

  const { t } = useI18n();
  const { shouldShowBanner, isIOS, canInstall, promptInstall, dismiss } =
    useInstallPrompt();

  const subtitle = computed(() =>
    isIOS.value ? t("install.subtitleIos") : t("install.subtitleAndroid")
  );
</script>

<template>
  <Teleport to="body">
    <Transition name="install-banner">
      <div
        v-if="shouldShowBanner"
        role="dialog"
        :aria-label="t('install.title')"
        class="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0.75rem)] px-4 pt-3 bg-surface shadow-[var(--shadow-card)]"
      >
        <div class="mx-auto flex max-w-md items-start gap-3">
          <img
            src="/icons/icon-192.png"
            :alt="t('install.title')"
            class="h-10 w-10 shrink-0 rounded-lg"
            width="40"
            height="40"
          >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-text truncate">
              {{ t("install.title") }}
            </p>
            <p class="text-xs text-text-muted leading-snug">{{ subtitle }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <BaseButton
                v-if="canInstall"
                variant="default"
                type="button"
                @click="promptInstall"
              >
                {{ t("install.install") }}
              </BaseButton>
              <BaseButton variant="ghost" type="button" @click="dismiss">
                {{ t("install.notNow") }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .install-banner-enter-active,
  .install-banner-leave-active {
    transition:
      transform 200ms ease,
      opacity 200ms ease;
  }
  .install-banner-enter-from,
  .install-banner-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }
</style>
