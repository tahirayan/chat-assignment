import type { Locale } from "@chat/shared-types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { setLocale as applyLocale, i18n } from "../i18n";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  timeoutMs: number;
}

const TOAST_DEFAULT_MS = 4000;

export const useUiStore = defineStore("ui", () => {
  const locale = computed<Locale>(() => i18n.global.locale.value as Locale);
  const installPromptVisible = ref(false);
  const toasts = ref<Toast[]>([]);

  let nextToastId = 1;

  function setLocale(next: Locale): void {
    applyLocale(next);
  }

  function pushToast(
    kind: ToastKind,
    message: string,
    timeoutMs = TOAST_DEFAULT_MS
  ): number {
    const id = nextToastId++;
    toasts.value.push({ id, kind, message, timeoutMs });
    if (timeoutMs > 0) {
      setTimeout(() => dismissToast(id), timeoutMs);
    }
    return id;
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function showInstallPrompt(): void {
    installPromptVisible.value = true;
  }

  function hideInstallPrompt(): void {
    installPromptVisible.value = false;
  }

  return {
    locale,
    installPromptVisible,
    toasts,
    setLocale,
    pushToast,
    dismissToast,
    showInstallPrompt,
    hideInstallPrompt,
  };
});
