<script setup lang="ts">
  import type { PublicUser } from "@chat/shared-types";
  import { computed, ref, watch } from "vue";
  import UserAvatar from "../ui/UserAvatar.vue";

  const props = withDefaults(
    defineProps<{
      stream: MediaStream | null;
      /** Avatar fallback shown when the video track is missing or muted. */
      user?: PublicUser | null;
      /** Mirror the video horizontally (selfie-cam convention for local). */
      mirror?: boolean;
      /**
       * Muted audio is required for the local preview (you don't want to
       * hear yourself echoed) and for iOS autoplay-with-sound restrictions
       * on the remote tile until a user gesture.
       */
      muted?: boolean;
    }>(),
    { user: null, mirror: false, muted: false }
  );

  const videoEl = ref<HTMLVideoElement | null>(null);

  // Track whether the stream has an enabled, unmuted video track. We watch
  // `mute`/`unmute` on the track itself so the avatar fallback flips in
  // real time when the peer toggles their camera (replaceTrack(null) on
  // the sender side fires `mute` on our receiver track).
  const hasLiveVideo = ref(false);

  function refreshLive(): void {
    const s = props.stream;
    if (!s) {
      hasLiveVideo.value = false;
      return;
    }
    const track = s.getVideoTracks()[0];
    hasLiveVideo.value = Boolean(
      track && !track.muted && track.readyState === "live"
    );
  }

  // Bind srcObject imperatively — Vue's template can't reactively bind
  // this MediaStream property.
  watch(
    [() => props.stream, videoEl],
    ([stream, el]) => {
      if (!el) {
        return;
      }
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {
          // Autoplay may be blocked on iOS until first user gesture.
          // The mute toggle / end button click will resume it.
        });
      } else if (!stream && el.srcObject) {
        el.srcObject = null;
      }
    },
    { immediate: true }
  );

  // Subscribe to mute/unmute on the live video track. Re-run on every
  // stream change because tracks are different objects each time
  // (replaceTrack creates new senders / receivers).
  watch(
    () => props.stream,
    (stream, _prev, onCleanup) => {
      refreshLive();
      const track = stream?.getVideoTracks()[0];
      if (!track) {
        return;
      }
      track.addEventListener("mute", refreshLive);
      track.addEventListener("unmute", refreshLive);
      track.addEventListener("ended", refreshLive);
      onCleanup(() => {
        track.removeEventListener("mute", refreshLive);
        track.removeEventListener("unmute", refreshLive);
        track.removeEventListener("ended", refreshLive);
      });
    },
    { immediate: true }
  );

  const videoClass = computed(() =>
    props.mirror
      ? "h-full w-full object-cover -scale-x-100"
      : "h-full w-full object-cover"
  );
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-text">
    <video
      ref="videoEl"
      autoplay
      playsinline
      :muted="muted"
      :class="videoClass"
    />
    <div
      v-if="!hasLiveVideo"
      class="absolute inset-0 flex items-center justify-center bg-text"
    >
      <UserAvatar v-if="user" :user="user" :size="120" />
    </div>
  </div>
</template>
