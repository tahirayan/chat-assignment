<script setup lang="ts">
  import type { CallType } from "@chat/shared-types";
  import {
    CallEnd01Icon,
    CameraOff01Icon,
    Mic01Icon,
    MicOff01Icon,
    Video01Icon,
  } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import { useWebRTC } from "../../composables/useWebRTC";
  import { useCallStore } from "../../stores/call";

  const props = defineProps<{
    callType: CallType;
  }>();

  const { t } = useI18n();
  const callStore = useCallStore();
  const { toggleMute, toggleCamera, endCall } = useWebRTC();

  const muteLabel = computed(() =>
    callStore.isMuted ? t("call.unmute") : t("call.mute")
  );

  const cameraLabel = computed(() =>
    callStore.isCameraOff ? t("call.cameraOn") : t("call.cameraOff")
  );

  const isVideo = computed(() => props.callType === "video");

  // Guard so a fast double-tap on the camera button doesn't race two
  // getUserMedia calls into a half-attached state.
  const cameraToggling = ref(false);
  async function onToggleCamera(): Promise<void> {
    if (cameraToggling.value) {
      return;
    }
    cameraToggling.value = true;
    try {
      await toggleCamera();
    } finally {
      cameraToggling.value = false;
    }
  }

  function onEnd(): void {
    endCall();
  }
</script>

<template>
  <div class="flex items-center justify-center gap-4">
    <button
      type="button"
      :aria-label="muteLabel"
      :aria-pressed="callStore.isMuted"
      :class="[
        'flex h-14 w-14 items-center justify-center rounded-full text-xl transition',
        callStore.isMuted
          ? 'bg-warning text-white'
          : 'bg-white/15 text-white hover:bg-white/25',
      ]"
      @click="toggleMute"
    >
      <HugeiconsIcon
        :icon="callStore.isMuted ? MicOff01Icon : Mic01Icon"
        :size="24"
        :stroke-width="1.5"
        color="currentColor"
        aria-hidden="true"
      />
    </button>

    <button
      v-if="isVideo"
      type="button"
      :aria-label="cameraLabel"
      :aria-pressed="callStore.isCameraOff"
      :disabled="cameraToggling"
      :class="[
        'flex h-14 w-14 items-center justify-center rounded-full text-xl transition disabled:opacity-60',
        callStore.isCameraOff
          ? 'bg-warning text-white'
          : 'bg-white/15 text-white hover:bg-white/25',
      ]"
      @click="onToggleCamera"
    >
      <HugeiconsIcon
        :icon="callStore.isCameraOff ? CameraOff01Icon : Video01Icon"
        :size="24"
        :stroke-width="1.5"
        color="currentColor"
        aria-hidden="true"
      />
    </button>

    <button
      type="button"
      :aria-label="t('call.end')"
      class="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition hover:bg-danger/90"
      @click="onEnd"
    >
      <HugeiconsIcon
        :icon="CallEnd01Icon"
        :size="28"
        :stroke-width="1.5"
        color="currentColor"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
