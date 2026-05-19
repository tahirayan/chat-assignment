---
name: socket-events
description: Socket.io event contract — messaging (message:send, message:new, message:delivered, message:read), presence (user:online, user:offline), typing (typing:start, typing:stop), and WebRTC signaling (call:initiate, call:offer, call:answer, call:ice, call:end). Use when editing apps/api/src/app/sockets/{connection,messages,calls}.ts, apps/api/src/app/plugins/socket.ts, apps/web/src/composables/useSocket.ts, apps/web/src/stores/{chat,users,call}.ts, or libs/shared-types/src/lib/socket-events.ts. Required when debugging duplicate messages, missing presence updates, stuck typing indicators, or chat-store invariant violations.
---

# Socket.io Event Contract

The full event protocol per PRD §8. Event names and payload types live in `libs/shared-types/src/lib/socket-events.ts` and **must** be imported on both client and server. The strings below are constants — never hardcode them.

## When to Use This Skill

- Adding or changing any socket handler on server (`apps/api/src/app/sockets/`)
- Wiring client subscriptions in `useSocket`, `useWebRTC`, or any Pinia store
- Reviewing real-time bugs (duplicate messages, missing presence updates, stuck typing indicators)
- Cross-checking that client emit and server handler agree on payload shape

## Quick Reference

| Direction | Event                | Payload                                              |
| --------- | -------------------- | ---------------------------------------------------- |
| C→S       | `message:send`       | `MessageSendPayload` = `{ recipientId, body, clientId }` |
| S→C       | `message:new`        | `Message`                                            |
| S→C       | `message:delivered`  | `{ clientId, id, createdAt }`                        |
| C→S       | `message:read`       | `{ otherUserId }`                                    |
| S→C       | `message:read`       | `{ readerId, readAt }`                               |
| C→S       | `typing:start` / `typing:stop` | `{ otherUserId }`                          |
| S→C       | `typing:start` / `typing:stop` | `{ fromUserId }`                           |
| S→C       | `user:online`        | `{ userId }`                                         |
| S→C       | `user:offline`       | `{ userId, lastSeenAt }`                             |
| C→S       | `call:initiate`      | `{ toUserId, callType: 'audio'\|'video' }`            |
| S→C       | `call:incoming`      | `{ fromUser, callType }`                             |
| C→S       | `call:accept`        | `{ fromUserId }`                                     |
| C→S       | `call:reject`        | `{ fromUserId, reason? }`                            |
| S→C       | `call:accepted` / `call:rejected` | mirror payloads                          |
| C↔S       | `call:offer` / `call:answer` / `call:ice` | `CallSignalPayload`                |
| C→S       | `call:end`           | `{ toUserId }`                                       |
| S→C       | `call:ended`         | `{ fromUserId }`                                     |
| S→C       | `error`              | `{ code, message }` — e.g. `CALLEE_OFFLINE`           |

## Connection Handshake (PRD §8.1)

1. Client connects with `auth: { token: <accessToken> }`.
2. Server middleware verifies JWT, attaches `socket.data.userId`. Reject with `Error('unauthorized')` on bad/missing token.
3. On connect: join room `user:<userId>`. Update in-memory presence map `Map<userId, Set<socketId>>`. If first socket for that user, broadcast `user:online`.
4. On disconnect: remove socket. If last socket for that user, broadcast `user:offline` and persist `users.lastSeenAt`.

## Messaging Flow

### Send

1. Client emits `message:send` with a `clientId` (UUID) it generated.
2. Server validates payload with `sendMessageInput` Zod schema (from `@chat/shared-contracts`).
3. Server inserts the message with a fresh server `id` and `createdAt`.
4. Server emits **`message:new`** to:
   - recipient room `user:<recipientId>`
   - sender room `user:<senderId>` (echo so other tabs of the sender see the message)
5. Server emits **`message:delivered`** to sender's room with `{ clientId, id, createdAt }` so the optimistic UI can swap the temporary id.

### Read

1. Client on ChatView mount + on inbound `message:new` while viewing → emits `message:read { otherUserId }`.
2. Server `UPDATE messages SET read_at = now() WHERE recipient_id = self AND sender_id = otherUserId AND read_at IS NULL`.
3. Server emits `message:read { readerId, readAt }` to the original sender's room so the ✓ → ✓✓ flip lands in real time.

### Typing

`typing:start` / `typing:stop` are pure passthrough — no persistence. Client debounces 3 s of keystroke inactivity to send `typing:stop`. UI on the receiving side should also time out the indicator defensively in case `typing:stop` is lost.

## Call Signaling (PRD §8.3)

Server only validates that both parties are authenticated and that the callee is online for `call:initiate`. SDP and ICE payloads are passed through **unmodified** — the server never inspects them.

```
caller                server                callee
  | call:initiate ----->|                       |
  |                     |--- call:incoming -----> (ringing modal)
  |                     |<--- call:accept ------ |
  |<-- call:accepted ---|                       |
  |--- call:offer ----->|--- call:offer ------->|
  |<-- call:answer -----|<--- call:answer ----- |
  |<-- call:ice <-> ----|---- call:ice <-> ---->|
  |                     |                       |
  |--- call:end ------->|--- call:ended ------->|
```

If callee is offline at `call:initiate`, server emits `error { code: 'CALLEE_OFFLINE' }` back to caller.

## Chat Store Invariant (PRD §24 note 16)

When a `message:new` arrives, the `chat` store **must** in one action:

1. Append the message to `messagesByUser[partnerId]`
2. Update or insert the matching `Conversation` (latest message + unread count)
3. Move that conversation to position 0 in the sorted list

Doing these as separate actions causes the recents list to flicker or drift out of sync with the message thread.

### Anti-pattern: split-mutation `addMessage`

```ts
// BAD — three separate actions; the UI flickers and ordering drifts
function addMessage(msg: Message) {
  appendToThread(msg)                // mutation 1: re-renders ChatView
}
// elsewhere, in a socket listener:
chatStore.addMessage(msg)
chatStore.touchConversation(msg)     // mutation 2: re-renders ChatsView row
chatStore.reorderConversations()     // mutation 3: re-renders the entire list
// Three reactive ticks. If a second `message:new` arrives between ticks,
// the list ends up in an inconsistent order.
```

```ts
// GOOD — one atomic action; one tick; one consistent render
function addMessage(msg: Message) {
  const partnerId = msg.senderId === currentUserId ? msg.recipientId : msg.senderId

  const list = messagesByUser.value.get(partnerId) ?? []
  messagesByUser.value.set(partnerId, [...list, msg])

  const existing = conversations.value.find(c => c.partner.id === partnerId)
  if (existing) {
    existing.lastMessage = msg
    if (msg.recipientId === currentUserId && msg.senderId !== currentUserId) {
      existing.unreadCount++
    }
  } else {
    conversations.value.push({
      partner: getUserById(partnerId),
      lastMessage: msg,
      unreadCount: msg.recipientId === currentUserId ? 1 : 0,
    })
  }

  conversations.value.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt)
}
```

## Anti-pattern: trusting client-supplied `senderId`

```ts
// BAD — client could spoof senderId
socket.on('message:send', async (payload) => {
  await insertMessage({ senderId: payload.senderId, ...payload })
})
```

```ts
// GOOD — senderId comes from socket.data, set in the handshake
socket.on('message:send', async (rawPayload) => {
  const payload = sendMessageInput.parse(rawPayload)
  await insertMessage({ senderId: socket.data.userId, ...payload })
})
```

The client never gets to say who they are at message-send time. Authority
lives in `socket.data.userId` from the handshake.

## Cross-Cutting Rules

- **All payload types** come from `libs/shared-types/src/lib/socket-events.ts`. Never inline-type a payload.
- **All event names** come from the `CLIENT_EVENTS` / `SERVER_EVENTS` const objects in the same file.
- **Server logs** never include message bodies or JWTs.
- **Server validates** every C→S payload with a Zod schema where one exists. The only event without a schema today is the pure-passthrough call signaling, which is opaque on purpose.
- **Single-instance assumption** for presence: a Redis pub/sub would be needed to scale beyond one Railway instance. Flag this in REPORT.md.

## Checklist for a New Event

- [ ] Constant added to `CLIENT_EVENTS` or `SERVER_EVENTS` in `socket-events.ts`
- [ ] Payload type exported from `socket-events.ts`
- [ ] Zod schema added to `shared-contracts` if it's a C→S event with user-supplied content
- [ ] Server handler validates with the schema and uses `socket.data.userId` for authorization
- [ ] Client emitter and subscriber both reference the constant + type
- [ ] No console.log of the payload
- [ ] Manual test: two browser profiles, observe the event lands within one tick

## See also

- `webrtc-signaling` — for the `call:*` events specifically
- `auth-jwt-cookies` — for the handshake JWT verification
- `vue-frontend` — for how Pinia store mutations implement the invariant
- `monorepo-contracts` — for the shared-types ripple discipline when events change

## References

- PRD §8 Socket.io Event Contract
- PRD §24 note 16 (chat store invariant on `message:new`)
- `libs/shared-types/src/lib/socket-events.ts`
- `apps/api/src/app/sockets/`
- `apps/web/src/composables/useSocket.ts`
