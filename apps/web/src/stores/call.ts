import type {
  CallEndReason,
  CallState,
  CallType,
  PublicUser,
} from "@chat/shared-types";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

/**
 * Reactive state for the (singular) active call. Only one call may be in
 * flight at a time — initiating or accepting while a call exists is a
 * caller-side bug and useWebRTC short-circuits.
 *
 * MediaStream objects are stored in `shallowRef` because Vue's deep-
 * reactivity would otherwise wrap each MediaStreamTrack proxy and trip
 * the WebRTC track listeners (`pc.addTrack` etc.) — they compare with
 * `===` against the real underlying object.
 */
export const useCallStore = defineStore("call", () => {
  const state = ref<CallState>("idle");
  const callType = ref<CallType | null>(null);
  const isOutgoing = ref(false);
  const isMuted = ref(false);
  const isCameraOff = ref(false);
  const endReason = ref<CallEndReason | null>(null);

  const remoteUser = ref<PublicUser | null>(null);
  // Use shallowRef for streams — see file header note.
  const localStream = shallowRef<MediaStream | null>(null);
  const remoteStream = shallowRef<MediaStream | null>(null);

  const remoteUserId = computed(() => remoteUser.value?.id ?? null);
  const isActive = computed(
    () => state.value !== "idle" && state.value !== "ended"
  );

  function startOutgoing(user: PublicUser, type: CallType): void {
    state.value = "calling";
    callType.value = type;
    isOutgoing.value = true;
    isMuted.value = false;
    isCameraOff.value = type === "audio";
    endReason.value = null;
    remoteUser.value = user;
  }

  function startIncoming(user: PublicUser, type: CallType): void {
    state.value = "ringing";
    callType.value = type;
    isOutgoing.value = false;
    isMuted.value = false;
    isCameraOff.value = type === "audio";
    endReason.value = null;
    remoteUser.value = user;
  }

  function setState(next: CallState): void {
    state.value = next;
  }

  function setLocalStream(stream: MediaStream | null): void {
    localStream.value = stream;
  }

  function setRemoteStream(stream: MediaStream | null): void {
    remoteStream.value = stream;
  }

  function setMuted(value: boolean): void {
    isMuted.value = value;
  }

  function setCameraOff(value: boolean): void {
    isCameraOff.value = value;
  }

  function markEnded(reason: CallEndReason): void {
    state.value = "ended";
    endReason.value = reason;
  }

  function reset(): void {
    state.value = "idle";
    callType.value = null;
    isOutgoing.value = false;
    isMuted.value = false;
    isCameraOff.value = false;
    endReason.value = null;
    remoteUser.value = null;
    localStream.value = null;
    remoteStream.value = null;
  }

  return {
    state,
    callType,
    isOutgoing,
    isMuted,
    isCameraOff,
    endReason,
    remoteUser,
    remoteUserId,
    localStream,
    remoteStream,
    isActive,
    startOutgoing,
    startIncoming,
    setState,
    setLocalStream,
    setRemoteStream,
    setMuted,
    setCameraOff,
    markEnded,
    reset,
  };
});
