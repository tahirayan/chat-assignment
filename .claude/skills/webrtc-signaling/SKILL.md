---
name: webrtc-signaling
description: WebRTC implementation — ICE servers (Open Relay TURN on 80 + 443/tcp), caller+callee call flow, perfect negotiation roles, single-exit cleanup contract (the "camera light off after hangup" demo killer), and iOS Safari hardening. Use when editing apps/web/src/composables/useWebRTC.ts, apps/web/src/stores/call.ts, apps/web/src/components/call/{CallModal,VideoTile,CallControls}.vue, or apps/api/src/app/sockets/calls.ts. Required when debugging call connection failures, ICE issues, calls that drop at "connected", or the camera/mic indicator staying on after hangup.
---

# WebRTC Implementation

PRD §13 in skill form. Two browsers can hold audio + video calls; cleanup is bulletproof (the "camera light off after hangup" demo-killer).

## When to Use This Skill

- Implementing or changing `apps/web/src/composables/useWebRTC.ts`
- Editing `apps/web/src/stores/call.ts`
- Modifying `apps/web/src/components/call/{CallModal.vue, VideoTile.vue, CallControls.vue}`
- Reviewing call signaling handlers on the server (passthrough only)
- Debugging call connection failures, drops, or stuck cleanup state

## Quick Reference

| Concern             | Choice                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| **STUN/TURN**       | Open Relay TURN on 80 and 443/tcp + Google STUN (PRD §13.1)              |
| **TURN test flag** | `?forceRelay=1` → `iceTransportPolicy: 'relay'`                          |
| **Roles**           | Caller = impolite; callee = polite (perfect negotiation, PRD §13.5)      |
| **Audio constraints** | `getUserMedia({ audio: true })` for audio calls                        |
| **Video constraints** | `getUserMedia({ audio: true, video: true })` for video calls           |
| **iOS Safari**      | `playsinline` on every `<video>`; stop tracks before re-`getUserMedia`   |
| **Cleanup**         | Single `endCall()` exit path; **always** stop tracks before `pc.close()` |

## ICE Servers

```ts
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]
```

Honor `?forceRelay=1` in `window.location.search` by setting `iceTransportPolicy: 'relay'` so TURN can be exercised without symmetric NAT.

## Call Flow (Caller)

1. `initiateCall(toUserId, 'video')`.
2. `getUserMedia(constraints)` → store as `localStream`.
3. Set `state = 'calling'`.
4. Create `RTCPeerConnection({ iceServers: ICE_SERVERS })`.
5. Add tracks: `localStream.getTracks().forEach(t => pc.addTrack(t, localStream))`.
6. Wire handlers:
   - `ontrack` → expose `remoteStream`
   - `onicecandidate` → emit `call:ice { toUserId, candidate }`
   - `oniceconnectionstatechange` → on `connected`, set `state = 'connected'`; on `failed`/`disconnected`, route through `endCall()`
7. Emit `call:initiate { toUserId, callType }`.
8. Await `call:accepted`. On receipt, create offer, set local description, emit `call:offer { toUserId, sdp }`.
9. Await `call:answer`, set remote description.
10. ICE candidates flow both ways via `call:ice`.

## Call Flow (Callee)

1. Receive `call:incoming { fromUser, callType }` → set `state = 'ringing'`, show CallModal.
2. User taps Accept → `getUserMedia(constraints)`, create PC + handlers, emit `call:accept`.
3. Receive `call:offer { sdp }` → set remote description, create answer, set local description, emit `call:answer`.
4. ICE flows.

## Perfect Negotiation (PRD §13.5)

Implement per the W3C example. Roles:

- **Polite** (callee): on `negotiationneeded` collision, accepts rollback.
- **Impolite** (caller): ignores remote offers during local offer creation.

The pattern matters only if you renegotiate mid-call (e.g. switching from audio to video). For v1 with locked call type at initiation, the polite/impolite distinction is mostly defensive — but still wire it correctly.

## Cleanup Contract (the demo-killer)

Camera light staying on after a call ends ruins the demo. The fix is structural, not careful coding:

```ts
function endCall() {
  // 1. Stop every media track (releases mic/camera)
  localStream.value?.getTracks().forEach(t => t.stop())
  remoteStream.value?.getTracks().forEach(t => t.stop())  // belt + braces

  // 2. Close the peer connection
  pc?.close()

  // 3. Tell the other party (idempotent — safe even if already ended)
  if (remoteUserId.value) socket.emit('call:end', { toUserId: remoteUserId.value })

  // 4. Reset reactive state
  localStream.value = null
  remoteStream.value = null
  pc = null
  state.value = 'idle'
  remoteUserId.value = null
  callType.value = null
  isMuted.value = false
  isCameraOff.value = false
}
```

**Every** terminal state — user hits End, peer hung up, ICE failed, page unloaded, accept rejected — routes through this single function. The store's `end()` action calls it; the `oniceconnectionstatechange` handler calls it; `beforeunload` calls it.

### Anti-pattern: cleanup that leaves the camera light on

```ts
// BAD — pc.close() does NOT stop local media tracks.
//        The camera/mic stay live; the indicator light stays on.
function endCall() {
  pc?.close()
  state.value = 'idle'
}
```

```ts
// BAD — stops local tracks but forgets the remote stream's tracks,
//        which also hold references; in some browsers this delays GC.
function endCall() {
  localStream.value?.getTracks().forEach(t => t.stop())
  pc?.close()
  state.value = 'idle'
}
```

```ts
// GOOD — stop both streams' tracks BEFORE closing pc; reset all state
function endCall() {
  localStream.value?.getTracks().forEach(t => t.stop())
  remoteStream.value?.getTracks().forEach(t => t.stop())
  pc?.close()
  if (remoteUserId.value) {
    socket.emit('call:end', { toUserId: remoteUserId.value })
  }
  localStream.value = null
  remoteStream.value = null
  pc = null
  state.value = 'idle'
  remoteUserId.value = null
  callType.value = null
  isMuted.value = false
  isCameraOff.value = false
}
```

The visible test is unambiguous: after hangup, the OS indicator (green dot
on iOS, camera LED on most laptops) goes dark. If it doesn't, the cleanup
isn't routing through a single function, or tracks are being stopped after
`pc.close()`.

## Anti-pattern: scattered exit paths

```ts
// BAD — three different cleanup paths, three different bug surfaces
function onUserTapsEnd() {
  pc?.close()
  state.value = 'idle'
}
function onIceFailed() {
  localStream.value?.getTracks().forEach(t => t.stop())
  state.value = 'idle'
}
function onPeerHungUp() {
  state.value = 'idle'   // forgot tracks AND pc.close
}
```

```ts
// GOOD — every path delegates to the single endCall()
function onUserTapsEnd()  { endCall() }
function onIceFailed()    { endCall() }
function onPeerHungUp()   { endCall() }
window.addEventListener('beforeunload', endCall)
```

## iOS Safari Hardening (PRD §13.7)

- `<video>` always has `playsinline` and `autoplay`. Remote video starts `muted` so autoplay works; if audio is needed and Safari blocked it, unmute on the first user gesture.
- Calling `getUserMedia` again while a stream is active fails on iOS — always `stop()` existing tracks first.
- HTTPS required for `getUserMedia` — Netlify provides this in production.

## Server (passthrough only)

The server validates only that both parties are authenticated and (for `call:initiate`) that the callee is online. SDP and ICE payloads are relayed unmodified to the target `user:<id>` room. The server **does not** persist anything about calls.

## Checklist

- [ ] One `endCall()` is the single exit path; called from store, ICE failure handler, `beforeunload`
- [ ] Tracks stopped before `pc.close()`
- [ ] `<video playsinline autoplay>` on every remote and local tile
- [ ] Polite/impolite flag set per caller vs callee
- [ ] `?forceRelay=1` honored
- [ ] Tested two profiles → call works
- [ ] Tested `?forceRelay=1` → call still completes (TURN reachable)
- [ ] Camera + mic indicator off on both peers after hangup

## See also

- `socket-events` — for the underlying signaling event contract
- `security` — for the SDP/ICE trust boundary (opaque to server)
- `vue-frontend` — for the `call` store conventions
- `responsive-layout` — for CallModal sizing on mobile vs desktop

## References

- PRD §13 WebRTC Implementation
- W3C "Perfect Negotiation Example": https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
- `apps/web/src/composables/useWebRTC.ts`
- `apps/web/src/stores/call.ts`
- `apps/api/src/app/sockets/calls.ts` (passthrough only)
