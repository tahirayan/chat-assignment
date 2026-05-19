<script setup lang="ts">
  import { Sent02Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { onBeforeUnmount, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import BaseButton from "../ui/BaseButton.vue";
  import BaseTextarea from "../ui/BaseTextarea.vue";

  const props = withDefaults(
    defineProps<{
      disabled?: boolean;
    }>(),
    { disabled: false }
  );

  const emit = defineEmits<{
    send: [body: string];
    "typing-start": [];
    "typing-stop": [];
  }>();

  const { t } = useI18n();
  const draft = ref("");

  // PRD §11.5: typing-stop debounced 3s after last keystroke; typing-start
  // throttled so we don't spam the wire on every keypress.
  const TYPING_STOP_DELAY_MS = 3000;
  const TYPING_START_THROTTLE_MS = 2000;
  let lastStartAt = 0;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  function fireStop(): void {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    if (lastStartAt > 0) {
      emit("typing-stop");
      lastStartAt = 0;
    }
  }

  function onInput(): void {
    if (props.disabled || draft.value.trim() === "") {
      fireStop();
      return;
    }
    const now = Date.now();
    if (now - lastStartAt > TYPING_START_THROTTLE_MS) {
      emit("typing-start");
      lastStartAt = now;
    }
    if (stopTimer) {
      clearTimeout(stopTimer);
    }
    stopTimer = setTimeout(fireStop, TYPING_STOP_DELAY_MS);
  }

  function submit(): void {
    const value = draft.value.trim();
    if (value === "" || props.disabled) {
      return;
    }
    fireStop();
    emit("send", value);
    draft.value = "";
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  onBeforeUnmount(fireStop);
</script>

<template>
  <form
    class="flex items-end gap-2 border-t border-border bg-surface p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
    @submit.prevent="submit"
  >
    <BaseTextarea
      v-model="draft"
      :placeholder="t('chat.compose.placeholder')"
      :disabled="disabled"
      :rows="1"
      class="min-h-11 max-h-32 resize-none py-2.5 leading-snug"
      :aria-label="t('chat.compose.placeholder')"
      @input="onInput"
      @keydown="onKeydown"
    />
    <BaseButton
      class="h-11"
      type="submit"
      variant="default"
      :disabled="disabled || draft.trim() === ''"
    >
      <HugeiconsIcon
        :icon="Sent02Icon"
        :size="20"
        :stroke-width="1.5"
        color="currentColor"
        aria-hidden="true"
      />
      <span class="sr-only">{{ t("chat.compose.send") }}</span>
    </BaseButton>
  </form>
</template>
