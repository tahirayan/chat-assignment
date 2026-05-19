/**
 * WebRTC orchestration (PRD §13).
 *
 * SHAPE
 * -----
 *   - Module-scoped singleton. There is exactly one in-flight call at a
 *     time; multiple components share the same `useWebRTC()` instance.
 *   - Owns the `RTCPeerConnection`, the local `getUserMedia` stream, and
 *     all the socket signaling listeners.
 *   - Public API mirrors PRD §13.2: initiate / accept / reject / end +
 *     toggleMute / toggleCamera.
 *
 * EXIT-PATH INVARIANT (PRD §13.6 — "demo killer")
 * ------------------------------------------------
 *   Every terminal state — local hangup, remote `call:ended`, ICE failure,
 *   reject — funnels through `endCall(reason, { notifyPeer })`. That one
 *   function is responsible for:
 *     1. Stopping every track on `localStream` (releases mic / camera).
 *     2. Closing the `RTCPeerConnection`.
 *     3. Notifying the peer with `call:end` (skipped when the peer is the
 *        one that ended it — avoids a ping-pong).
 *     4. Marking the call ended in the store, scheduling a short "ended"
 *        toast window, then resetting state to idle.
 *
 * PERFECT NEGOTIATION (PRD §13.5)
 * --------------------------------
 *   Caller is "impolite", callee is "polite". Per W3C, on offer/answer
 *   glare the impolite peer wins and the polite peer rolls back.
 *
 * TURN / forceRelay
 * -----------------
 *   `?forceRelay=1` flips `iceTransportPolicy: "relay"` so the call must
 *   traverse TURN — used for verifying the relay path works without
 *   needing symmetric NAT on a real network. Dev-only knob.
 */

import type {
  CallEndedPayload,
  CallEndReason,
  CallIncomingPayload,
  CallSignalServerPayload,
  CallType,
  PublicUser,
} from "@chat/shared-types";
import { i18n } from "../i18n";
import { useCallStore } from "../stores/call";
import { useUiStore } from "../stores/ui";
import { useSocket } from "./useSocket";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const ENDED_TOAST_MS = 1500;

let pc: RTCPeerConnection | null = null;
// Caller is impolite; callee is polite (W3C perfect-negotiation pattern).
let polite = false;
let makingOffer = false;
let ignoreOffer = false;

let pendingRemoteCandidates: RTCIceCandidateInit[] = [];

let installed = false;
let endingInProgress = false;

function forceRelay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return new URL(window.location.href).searchParams.get("forceRelay") === "1";
  } catch {
    return false;
  }
}

function rtcConfig(): RTCConfiguration {
  const cfg: RTCConfiguration = { iceServers: ICE_SERVERS };
  if (forceRelay()) {
    cfg.iceTransportPolicy = "relay";
  }
  return cfg;
}

async function getLocalMedia(callType: CallType): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: true,
    video: callType === "video",
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

function newPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(rtcConfig());
}

function attachPcListeners(connection: RTCPeerConnection): void {
  const callStore = useCallStore();
  const { emit } = useSocket();

  connection.addEventListener("icecandidate", (ev) => {
    if (!ev.candidate) {
      return;
    }
    const peerId = callStore.remoteUserId;
    if (!peerId) {
      return;
    }
    emit("call:ice", {
      toUserId: peerId,
      candidate: ev.candidate.toJSON(),
    });
  });

  connection.addEventListener("track", (ev) => {
    // The first remote stream Chrome hands us is the one to bind. Later
    // tracks (renegotiation) are added to the same stream by the peer.
    const [stream] = ev.streams;
    if (stream) {
      callStore.setRemoteStream(stream);
    }
  });

  connection.addEventListener("iceconnectionstatechange", () => {
    const s = connection.iceConnectionState;
    if (s === "connected" || s === "completed") {
      if (callStore.state !== "connected") {
        callStore.setState("connected");
      }
    } else if (s === "failed") {
      endCall("failed", { notifyPeer: true });
    } else if (s === "disconnected") {
      // Transient — the spec says wait. If it doesn't recover the state
      // moves to `failed` and the handler above will fire.
    }
  });

  connection.addEventListener("negotiationneeded", async () => {
    if (!pc || pc !== connection) {
      return;
    }
    const peerId = callStore.remoteUserId;
    if (!peerId) {
      return;
    }
    try {
      makingOffer = true;
      await connection.setLocalDescription();
      if (!connection.localDescription) {
        return;
      }
      emit("call:offer", {
        toUserId: peerId,
        sdp: connection.localDescription.toJSON(),
      });
    } catch (err) {
      // Negotiation failure isn't fatal on its own — the next ICE event
      // will surface the real failure. Log via console.warn so the user
      // sees something in dev.
      window.console.warn("[webrtc] negotiationneeded failed", err);
    } finally {
      makingOffer = false;
    }
  });
}

function addLocalTracks(
  connection: RTCPeerConnection,
  stream: MediaStream
): void {
  for (const track of stream.getTracks()) {
    connection.addTrack(track, stream);
  }
}

async function flushPendingCandidates(): Promise<void> {
  if (!pc) {
    return;
  }
  const queue = pendingRemoteCandidates;
  pendingRemoteCandidates = [];
  for (const c of queue) {
    try {
      await pc.addIceCandidate(c);
    } catch (err) {
      if (!ignoreOffer) {
        window.console.warn("[webrtc] addIceCandidate failed", err);
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────
export async function initiateCall(
  toUser: PublicUser,
  callType: CallType
): Promise<void> {
  const callStore = useCallStore();
  const uiStore = useUiStore();
  const { emit } = useSocket();

  if (callStore.isActive) {
    return;
  }

  callStore.startOutgoing(toUser, callType);
  polite = false; // caller is impolite

  let stream: MediaStream;
  try {
    stream = await getLocalMedia(callType);
  } catch {
    uiStore.pushToast("error", i18n.global.t("call.permissionDenied"));
    callStore.reset();
    return;
  }
  callStore.setLocalStream(stream);

  pc = newPeerConnection();
  attachPcListeners(pc);
  addLocalTracks(pc, stream);

  emit("call:initiate", { toUserId: toUser.id, callType });
}

export async function acceptCall(): Promise<void> {
  const callStore = useCallStore();
  const uiStore = useUiStore();
  const { emit } = useSocket();

  if (callStore.state !== "ringing") {
    return;
  }
  const peer = callStore.remoteUser;
  const type = callStore.callType;
  if (!(peer && type)) {
    return;
  }

  callStore.setState("connecting");
  polite = true; // callee is polite

  let stream: MediaStream;
  try {
    stream = await getLocalMedia(type);
  } catch {
    uiStore.pushToast("error", i18n.global.t("call.permissionDenied"));
    // Treat permission denial as a reject from the callee's perspective
    // so the caller gets a clean rejected signal.
    emit("call:reject", { fromUserId: peer.id, reason: "permission" });
    callStore.reset();
    return;
  }
  callStore.setLocalStream(stream);

  pc = newPeerConnection();
  attachPcListeners(pc);
  addLocalTracks(pc, stream);

  emit("call:accept", { fromUserId: peer.id });
}

export function rejectCall(): void {
  const callStore = useCallStore();
  const { emit } = useSocket();
  const peer = callStore.remoteUser;
  if (peer && callStore.state === "ringing") {
    emit("call:reject", { fromUserId: peer.id });
  }
  callStore.reset();
}

export function toggleMute(): void {
  const callStore = useCallStore();
  const stream = callStore.localStream;
  if (!stream) {
    return;
  }
  const next = !callStore.isMuted;
  for (const track of stream.getAudioTracks()) {
    track.enabled = !next;
  }
  callStore.setMuted(next);
}

/**
 * Camera toggle that ACTUALLY releases the camera light when off (just
 * setting `track.enabled = false` keeps the OS indicator lit). Done via
 * `replaceTrack` on the existing RTCRtpSender so we don't have to
 * renegotiate the SDP — the peer's `mute`/`unmute` events on the receiver
 * track flip the avatar fallback in <VideoTile>.
 *
 * Audio-only calls are a no-op.
 */
export async function toggleCamera(): Promise<void> {
  const callStore = useCallStore();
  if (callStore.callType !== "video") {
    return;
  }
  const stream = callStore.localStream;
  if (!(pc && stream)) {
    return;
  }
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) {
    return;
  }

  const turningOff = !callStore.isCameraOff;

  if (turningOff) {
    // 1. Drop our send track so the peer immediately sees `mute`.
    // 2. Stop the underlying source — THIS is what turns off the camera
    //    indicator. Without the .stop() the light stays on indefinitely.
    await sender.replaceTrack(null);
    for (const t of stream.getVideoTracks()) {
      t.stop();
      stream.removeTrack(t);
    }
    // Re-wrap the stream so the shallowRef in the store sees a new
    // reference and dependent <VideoTile>s rebind their srcObject +
    // resubscribe to track events.
    callStore.setLocalStream(new MediaStream(stream.getTracks()));
    callStore.setCameraOff(true);
    return;
  }

  // Turning back on: PRD §13.7 — stop any leftover tracks before the
  // second getUserMedia call (iOS sometimes refuses to re-issue a track
  // otherwise). The block above already cleared them, so this is defense.
  for (const t of stream.getVideoTracks()) {
    t.stop();
    stream.removeTrack(t);
  }

  let videoOnly: MediaStream;
  try {
    videoOnly = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  } catch {
    // Permission revoked between calls — leave the toggle off and surface.
    const uiStore = useUiStore();
    uiStore.pushToast("error", i18n.global.t("call.permissionDeniedVideo"));
    return;
  }
  const newTrack = videoOnly.getVideoTracks()[0];
  if (!newTrack) {
    return;
  }
  await sender.replaceTrack(newTrack);
  stream.addTrack(newTrack);
  callStore.setLocalStream(new MediaStream(stream.getTracks()));
  callStore.setCameraOff(false);
}

/**
 * THE single exit path. Every terminal state — local hangup, remote
 * call:ended, ICE failure, permission denial post-acceptance — goes
 * through here. Re-entrancy guarded so multiple "end" sources during
 * teardown don't double-emit.
 */
export function endCall(
  reason: CallEndReason,
  opts: { notifyPeer: boolean }
): void {
  if (endingInProgress) {
    return;
  }
  endingInProgress = true;
  try {
    const callStore = useCallStore();
    const { emit } = useSocket();

    const peerId = callStore.remoteUserId;
    if (opts.notifyPeer && peerId) {
      try {
        emit("call:end", { toUserId: peerId });
      } catch {
        // Socket may be gone — best-effort.
      }
    }

    // CRITICAL: stop tracks BEFORE pc.close() — the mic indicator stays
    // on otherwise. See PRD §13.6 ("This must be bulletproof").
    const local = callStore.localStream;
    if (local) {
      for (const t of local.getTracks()) {
        t.stop();
      }
    }
    const remote = callStore.remoteStream;
    if (remote) {
      for (const t of remote.getTracks()) {
        t.stop();
      }
    }

    if (pc) {
      for (const s of pc.getSenders()) {
        try {
          s.track?.stop();
        } catch {
          // ignore — track may already be stopped
        }
      }
      try {
        pc.close();
      } catch {
        // ignore — connection may already be closed
      }
      pc = null;
    }

    pendingRemoteCandidates = [];
    makingOffer = false;
    ignoreOffer = false;

    callStore.markEnded(reason);

    // Show the "ended" branch briefly so the user sees what happened
    // (rejected / failed / hangup) before the modal closes.
    setTimeout(() => {
      // If a new call started in the meantime, don't blow it away.
      if (callStore.state === "ended") {
        callStore.reset();
      }
    }, ENDED_TOAST_MS);
  } finally {
    endingInProgress = false;
  }
}

// ─── Socket dispatch ────────────────────────────────────────────────────────
// Called by useSocket when the corresponding server event arrives. Kept as
// free functions so useSocket can wire them without circular dependency
// gymnastics.

export function handleIncoming(payload: CallIncomingPayload): void {
  const callStore = useCallStore();
  // If we're already in a call, auto-reject the new one to keep the
  // single-call invariant. Server-side busy handling is Phase 13+.
  if (callStore.isActive) {
    const { emit } = useSocket();
    emit("call:reject", { fromUserId: payload.fromUser.id, reason: "busy" });
    return;
  }
  callStore.startIncoming(payload.fromUser, payload.callType);
}

export async function handleAccepted(): Promise<void> {
  // The caller now negotiates: create offer. `negotiationneeded` fires
  // automatically when tracks were added before the peer connection had
  // a remote peer, but to be safe we trigger an explicit offer here so
  // the timing is deterministic (avoids races with addTrack ordering).
  const callStore = useCallStore();
  if (!pc) {
    return;
  }
  callStore.setState("connecting");
  try {
    makingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!pc.localDescription) {
      return;
    }
    const peerId = callStore.remoteUserId;
    if (!peerId) {
      return;
    }
    const { emit } = useSocket();
    emit("call:offer", {
      toUserId: peerId,
      sdp: pc.localDescription.toJSON(),
    });
  } catch (err) {
    window.console.warn("[webrtc] failed to create offer", err);
    endCall("failed", { notifyPeer: true });
  } finally {
    makingOffer = false;
  }
}

export function handleRejected(): void {
  endCall("rejected", { notifyPeer: false });
}

export function handleEnded(_payload: CallEndedPayload): void {
  endCall("hangup", { notifyPeer: false });
}

export async function handleOffer(
  payload: CallSignalServerPayload
): Promise<void> {
  if (!(pc && payload.sdp)) {
    return;
  }
  const offer = payload.sdp;
  const offerCollision = makingOffer || pc.signalingState !== "stable";
  ignoreOffer = !polite && offerCollision;
  if (ignoreOffer) {
    return;
  }
  try {
    await pc.setRemoteDescription(offer);
    await flushPendingCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (!pc.localDescription) {
      return;
    }
    const { emit } = useSocket();
    emit("call:answer", {
      toUserId: payload.fromUserId,
      sdp: pc.localDescription.toJSON(),
    });
  } catch (err) {
    window.console.warn("[webrtc] handleOffer failed", err);
    endCall("failed", { notifyPeer: true });
  }
}

export async function handleAnswer(
  payload: CallSignalServerPayload
): Promise<void> {
  if (!(pc && payload.sdp)) {
    return;
  }
  try {
    await pc.setRemoteDescription(payload.sdp);
    await flushPendingCandidates();
  } catch (err) {
    window.console.warn("[webrtc] handleAnswer failed", err);
    endCall("failed", { notifyPeer: true });
  }
}

export async function handleIce(
  payload: CallSignalServerPayload
): Promise<void> {
  if (!payload.candidate) {
    return;
  }
  if (!pc?.remoteDescription) {
    // Candidates can arrive before the SDP exchange completes — queue.
    pendingRemoteCandidates.push(payload.candidate);
    return;
  }
  try {
    await pc.addIceCandidate(payload.candidate);
  } catch (err) {
    if (!ignoreOffer) {
      window.console.warn("[webrtc] addIceCandidate failed", err);
    }
  }
}

/** Public-facing composable surface — convenience wrapper. */
export function useWebRTC(): {
  initiateCall: typeof initiateCall;
  acceptCall: typeof acceptCall;
  rejectCall: typeof rejectCall;
  endCall: (reason?: CallEndReason) => void;
  toggleMute: typeof toggleMute;
  toggleCamera: () => Promise<void>;
} {
  installed = true;
  return {
    initiateCall,
    acceptCall,
    rejectCall,
    endCall: (reason = "hangup") => endCall(reason, { notifyPeer: true }),
    toggleMute,
    toggleCamera,
  };
}

// Diagnostic only — used by tests / dev panel to confirm install side-effect.
export function _installedFlag(): boolean {
  return installed;
}
