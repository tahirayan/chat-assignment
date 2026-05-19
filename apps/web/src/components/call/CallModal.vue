<script setup lang="ts">
  import { Call02Icon, CallEnd01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed, ref, watch } from "vue";
  import { useI18n } from "vue-i18n";
  import { useWebRTC } from "../../composables/useWebRTC";
  import { useCallStore } from "../../stores/call";
  import ProBadge from "../ui/ProBadge.vue";
  import UserAvatar from "../ui/UserAvatar.vue";
  import CallControls from "./CallControls.vue";
  import VideoTile from "./VideoTile.vue";

  const { t } = useI18n();
  const callStore = useCallStore();
  const { acceptCall, rejectCall } = useWebRTC();

  const isVideo = computed(() => callStore.callType === "video");

  // For audio calls the remote audio is plumbed through a hidden <audio>.
  // For video calls the <video> in <VideoTile> plays both video + audio,
  // so we keep the audio element only on the audio-call branch.
  const remoteAudioEl = ref<HTMLAudioElement | null>(null);

  watch(
    [() => callStore.remoteStream, () => isVideo.value, remoteAudioEl],
    ([stream, video, el]) => {
      if (!el) {
        return;
      }
      if (video) {
        // Detach to avoid playing audio twice through both the <audio>
        // and the <video> element.
        if (el.srcObject) {
          el.srcObject = null;
        }
        return;
      }
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {
          // Autoplay may be blocked; clicking mute/end (gesture) unblocks.
        });
      } else if (!stream && el.srcObject) {
        el.srcObject = null;
      }
    },
    { immediate: true }
  );

  const isVisible = computed(() => callStore.state !== "idle");

  const headline = computed(() => {
    switch (callStore.state) {
      case "calling":
        return t("call.calling");
      case "ringing":
        return t("call.ringing");
      case "connecting":
        return t("call.connecting");
      case "connected":
        return t("call.connected");
      case "ended": {
        const reason = callStore.endReason;
        return reason ? t(`call.endedReason.${reason}`) : t("call.ended");
      }
      default:
        return "";
    }
  });

  const isControlsVisible = computed(
    () =>
      callStore.state === "calling" ||
      callStore.state === "connecting" ||
      callStore.state === "connected"
  );
</script>

<template>
  <Teleport to="body">
    <Transition name="call-modal">
      <div
        v-if="isVisible"
        role="dialog"
        aria-modal="true"
        :aria-label="headline"
        class="fixed inset-0 z-50 flex flex-col bg-text/95 text-white"
      >
        <!-- ─── VIDEO LAYOUT (remote fullscreen, local PiP) ─── -->
        <template v-if="isVideo">
          <div class="relative flex-1 overflow-hidden">
            <VideoTile
              :stream="callStore.remoteStream"
              :user="callStore.remoteUser"
            />
            <!-- Local preview tile — small, draggable would be nice, but a
                 fixed corner is plenty for an audio/video MVP. -->
            <div
              class="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] h-32 w-24 overflow-hidden rounded-xl border border-white/30 shadow-lg md:h-44 md:w-32"
            >
              <!-- Local preview: no avatar fallback by design — when the
                   user's own camera is off, a black tile is clearer than
                   showing the peer's avatar in the self-view slot. -->
              <VideoTile :stream="callStore.localStream" mirror muted />
            </div>
            <!-- State headline overlay -->
            <div
              class="pointer-events-none absolute inset-x-0 top-[max(env(safe-area-inset-top),1rem)] flex justify-center"
            >
              <p
                class="rounded-full bg-black/40 px-4 py-1 text-sm uppercase tracking-widest text-white/90"
              >
                {{ headline }}
              </p>
            </div>
            <!-- Peer name overlay (lower-left) -->
            <div
              class="pointer-events-none absolute left-4 bottom-32 flex items-center gap-2 text-xl font-medium drop-shadow"
            >
              <span>{{ callStore.remoteUser?.displayName ?? "" }}</span>
              <ProBadge v-if="callStore.remoteUser?.isPro" />
            </div>
          </div>

          <div
            class="flex w-full justify-center bg-black/50 px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
          >
            <div
              v-if="callStore.state === 'ringing'"
              class="flex w-full max-w-sm items-center justify-around"
            >
              <button
                type="button"
                :aria-label="t('call.decline')"
                class="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition hover:bg-danger/90"
                @click="rejectCall"
              >
                <HugeiconsIcon
                  :icon="CallEnd01Icon"
                  :size="28"
                  :stroke-width="1.5"
                  color="currentColor"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                :aria-label="t('call.answer')"
                class="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg transition hover:bg-success/90"
                @click="acceptCall"
              >
                <HugeiconsIcon
                  :icon="Call02Icon"
                  :size="28"
                  :stroke-width="1.5"
                  color="currentColor"
                  aria-hidden="true"
                />
              </button>
            </div>
            <CallControls
              v-else-if="isControlsVisible && callStore.callType"
              :call-type="callStore.callType"
            />
            <div v-else class="h-16" />
          </div>
        </template>

        <!-- ─── AUDIO LAYOUT (avatars + state) ─── -->
        <template v-else>
          <div
            class="flex flex-1 flex-col items-center justify-between px-6 pt-[max(env(safe-area-inset-top),3rem)] pb-[max(env(safe-area-inset-bottom),2rem)]"
          >
            <div
              class="text-center text-sm uppercase tracking-widest text-white/70"
            >
              {{ headline }}
            </div>

            <div class="flex flex-col items-center gap-4">
              <UserAvatar
                v-if="callStore.remoteUser"
                :user="callStore.remoteUser"
                :size="160"
              />
              <div class="flex items-center gap-2">
                <p class="text-2xl font-medium">
                  {{ callStore.remoteUser?.displayName ?? "—" }}
                </p>
                <ProBadge v-if="callStore.remoteUser?.isPro" size="sm" />
              </div>
              <div
                v-if="callStore.state === 'connected'"
                class="flex gap-1"
                aria-hidden="true"
              >
                <span
                  class="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:-0.3s]"
                />
                <span
                  class="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:-0.15s]"
                />
                <span class="h-2 w-2 animate-bounce rounded-full bg-white/80" />
              </div>
            </div>

            <div class="flex w-full max-w-sm flex-col items-center gap-4">
              <div
                v-if="callStore.state === 'ringing'"
                class="flex w-full items-center justify-around"
              >
                <button
                  type="button"
                  :aria-label="t('call.decline')"
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition hover:bg-danger/90"
                  @click="rejectCall"
                >
                  <HugeiconsIcon
                    :icon="CallEnd01Icon"
                    :size="28"
                    :stroke-width="1.5"
                    color="currentColor"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  :aria-label="t('call.answer')"
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg transition hover:bg-success/90"
                  @click="acceptCall"
                >
                  <HugeiconsIcon
                    :icon="Call02Icon"
                    :size="28"
                    :stroke-width="1.5"
                    color="currentColor"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <CallControls
                v-else-if="isControlsVisible && callStore.callType"
                :call-type="callStore.callType"
              />
              <div v-else class="h-16" />
            </div>
          </div>

          <!-- Hidden audio sink for audio-only calls. Bound imperatively. -->
          <audio ref="remoteAudioEl" autoplay playsinline class="hidden" />
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .call-modal-enter-active,
  .call-modal-leave-active {
    transition: opacity 180ms ease;
  }
  .call-modal-enter-from,
  .call-modal-leave-to {
    opacity: 0;
  }
</style>
