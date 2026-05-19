# Real-Time Chat Application — Product Requirements Document

**Document version:** 1.2
**Target implementer:** Claude Code CLI
**Project type:** Technical hiring assignment
**Estimated effort:** 6 working days

**v1.2 changes:**
- Removed "Open Questions" section — all decisions baked in (defaults: app name "Chat", brand color oklch(0.58 0.20 250), data URL avatar storage)
- Added section 11.9: full Avatar Upload Implementation spec (composable, pipeline, constraints, default avatar)
- Added `UserAvatar` component to inventory
- Tightened `updateProfileInput.avatarUrl` Zod schema with 150,000 char ceiling for server-side defense

**v1.1 changes:**
- Added Chats (recents) view as the root authenticated screen
- Added desktop split-pane layout pattern at `md:` breakpoint
- Added "Online now" avatar strip at top of Chats view
- New `GET /api/conversations` endpoint for recents data
- Renumbered section 11 (screens) to accommodate the new view + layout architecture subsection

---

## 1. Project Overview

### 1.1 Goal

Build a mobile-first, real-time chat web application where authenticated users can message each other 1:1, see who is online, edit their profile, and start audio/video calls. The app must be deployable as a public live demo and a public GitHub repo.

### 1.2 Required features (graded)

1. Responsive mobile-first web app (Vue 3) that scales gracefully to desktop with a split-pane layout
2. Five screens: Auth (login + register), Chats (recents list — the root authenticated screen), Community (user discovery), Chat (active conversation), Profile
3. RESTful API for user information and conversation metadata
4. Real-time messaging via Socket.io
5. Short written report covering decisions

> **Note on screen count:** The brief specifies four screens. We add a fifth (Chats / recents) because a chat app without a recents view is functionally incomplete — the brief's intent is clearly satisfied by exceeding the minimum here. Community remains, repurposed as a discovery view for finding users you haven't yet chatted with.

### 1.3 Bonus features (all in scope)

1. Strong design / UX / architecture quality (graded)
2. WebRTC audio + video calls with STUN/TURN
3. PWA (installable, with mobile install prompt)
4. i18n: English, Turkish, Estonian
5. Pinia state management depth
6. Stripe sandbox with 3DS flow

### 1.4 Non-goals (out of scope)

- Group chats (1:1 only)
- Message editing / deletion
- File / image sharing in messages
- Push notifications
- End-to-end encryption (messages stored plaintext in DB)
- Email verification flow (registration creates verified user immediately)
- Password reset flow
- Admin / moderation tooling
- The "downloaded app" actually doing anything beyond the install prompt itself

---

## 2. Tech Stack (locked)

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| Monorepo | Nx | 22.x | First-class Vue support, module boundary enforcement, dep graph |
| Package manager | pnpm | 9.x | Workspace support, fast, deterministic |
| Frontend framework | Vue | 3.5.x | Required by brief |
| Frontend language | TypeScript | 5.6+ | Required by brief |
| Frontend build | Vite | 7.x | Default with @nx/vue |
| State management | Pinia | 3.x | Required by brief; setup-store style |
| Router | vue-router | 4.x | Standard |
| Styling | Tailwind CSS | 4.x | User preference; layered with custom component classes |
| i18n | vue-i18n | 11.x | Composition API mode |
| Form validation | VeeValidate + @vee-validate/zod | latest | Shared Zod schemas with backend |
| HTTP client | axios | 1.x | Interceptors for token refresh |
| WebSocket client | socket.io-client | 4.8.x | Required by brief |
| Payments | @stripe/stripe-js + Stripe Elements | latest | 3DS via Payment Element |
| PWA | vite-plugin-pwa | latest | Workbox under the hood |
| Backend runtime | Node.js | 22 LTS | |
| Backend framework | Fastify | 5.x | User preference; faster than Express, native TS support |
| WebSocket server | socket.io | 4.8.x | Pairs with client |
| ORM | Drizzle ORM | latest | User preference; type-safe |
| Database | SQLite (better-sqlite3) | latest | User preference; Railway volume for persistence |
| Auth | JWT (jose) + bcrypt | latest | Access in memory, refresh in HttpOnly cookie |
| Validation | Zod | 3.x | Shared between client/server |
| Deployment (web) | Netlify | — | Free tier, Edge functions if needed |
| Deployment (api) | Railway | — | Free tier, WebSocket support, persistent volumes |

---

## 3. Monorepo Structure

```
chat-app/
├── apps/
│   ├── web/                          # Vue 3 frontend
│   │   ├── src/
│   │   │   ├── api/                  # axios client + interceptors
│   │   │   ├── assets/               # static
│   │   │   ├── components/           # presentational
│   │   │   │   ├── ui/               # base components (Button, Input, Avatar)
│   │   │   │   ├── chat/             # MessageBubble, MessageList, ComposeBar, ConversationRow, OnlineNowStrip
│   │   │   │   ├── call/             # CallModal, VideoTile, CallControls
│   │   │   │   └── layout/           # AppShell, BottomTabBar, TopBar, Sidebar
│   │   │   ├── composables/          # useAuth, useSocket, useWebRTC, useInstallPrompt, useBreakpoint
│   │   │   ├── i18n/                 # vue-i18n config + locale loader
│   │   │   ├── layouts/              # AuthLayout, AppLayout (responsive: tabs on mobile, sidebar on desktop)
│   │   │   ├── locales/              # en.json, tr.json, et.json
│   │   │   ├── pages/                # AuthView, ChatsView, CommunityView, ChatView, ProfileView, UpgradeView
│   │   │   ├── router/               # routes + guards
│   │   │   ├── stores/               # auth, users, chat, call, ui
│   │   │   ├── styles/               # theme.css (Tailwind 4 @theme), components.css
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── public/                   # PWA icons, manifest assets
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js        # if needed (Tailwind 4 prefers CSS-first)
│   │   └── project.json
│   │
│   └── api/                          # Fastify backend
│       ├── src/
│       │   ├── app/
│       │   │   ├── server.ts         # Fastify bootstrap + plugin registration
│       │   │   ├── plugins/          # auth, cors, drizzle, socket
│       │   │   ├── routes/           # /auth, /users, /messages, /payments, /stripe-webhook
│       │   │   └── sockets/          # connection handler, message handlers, signaling handlers
│       │   ├── db/
│       │   │   ├── schema.ts         # Drizzle schema
│       │   │   ├── client.ts         # better-sqlite3 + drizzle instance
│       │   │   ├── migrate.ts        # migration runner (run on boot)
│       │   │   └── migrations/       # drizzle-kit output
│       │   ├── services/             # business logic (auth, users, messages)
│       │   ├── lib/                  # jwt, password, errors
│       │   └── main.ts               # entrypoint
│       ├── drizzle.config.ts
│       └── project.json
│
├── libs/
│   ├── shared-types/                 # Zero runtime deps
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── user.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── call.ts
│   │   │   │   └── socket-events.ts  # event name constants + payload types
│   │   │   └── index.ts
│   │   └── project.json
│   │
│   └── shared-contracts/             # Zod schemas (depends on zod + shared-types)
│       ├── src/
│       │   ├── lib/
│       │   │   ├── auth.ts
│       │   │   ├── user.ts
│       │   │   ├── message.ts
│       │   │   └── payment.ts
│       │   └── index.ts
│       └── project.json
│
├── nx.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.mjs                 # with @nx/enforce-module-boundaries
├── netlify.toml                      # at repo root
├── railway.json                      # optional, configure via dashboard
├── .nvmrc                            # 22
├── .env.example
├── .gitignore
└── README.md
```

### 3.1 Path aliases (in `tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "paths": {
      "@chat/shared-types": ["libs/shared-types/src/index.ts"],
      "@chat/shared-contracts": ["libs/shared-contracts/src/index.ts"]
    }
  }
}
```

### 3.2 Nx tags + module boundary rules

```jsonc
// per project.json
// apps/web → "tags": ["scope:web", "type:app"]
// apps/api → "tags": ["scope:api", "type:app"]
// libs/shared-types → "tags": ["scope:shared", "type:types"]
// libs/shared-contracts → "tags": ["scope:shared", "type:contracts"]
```

ESLint rule (in `eslint.config.mjs`):

```js
'@nx/enforce-module-boundaries': ['error', {
  depConstraints: [
    { sourceTag: 'scope:web',    onlyDependOnLibsWithTags: ['scope:shared'] },
    { sourceTag: 'scope:api',    onlyDependOnLibsWithTags: ['scope:shared'] },
    { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
    { sourceTag: 'type:types',     onlyDependOnLibsWithTags: ['type:types'] },
    { sourceTag: 'type:contracts', onlyDependOnLibsWithTags: ['type:types', 'type:contracts'] },
  ],
}]
```

---

## 4. Data Model (Drizzle Schema)

**File:** `apps/api/src/db/schema.ts`

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id:             text('id').primaryKey(),                  // UUIDv7
  email:          text('email').notNull().unique(),
  passwordHash:   text('password_hash').notNull(),
  displayName:    text('display_name').notNull(),
  bio:            text('bio').default(''),
  avatarUrl:      text('avatar_url'),                       // data URL acceptable for demo
  locale:         text('locale').notNull().default('en'),   // 'en' | 'tr' | 'et'
  isPro:          integer('is_pro', { mode: 'boolean' }).notNull().default(false),
  lastSeenAt:     integer('last_seen_at', { mode: 'timestamp_ms' }),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' })
                    .notNull()
                    .default(sql`(unixepoch() * 1000)`),
})

export const messages = sqliteTable('messages', {
  id:             text('id').primaryKey(),
  senderId:       text('sender_id').notNull().references(() => users.id),
  recipientId:    text('recipient_id').notNull().references(() => users.id),
  body:           text('body').notNull(),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' })
                    .notNull()
                    .default(sql`(unixepoch() * 1000)`),
  readAt:         integer('read_at', { mode: 'timestamp_ms' }),
}, (t) => ({
  conversationIdx: index('messages_conversation_idx').on(t.senderId, t.recipientId, t.createdAt),
}))

export const refreshTokens = sqliteTable('refresh_tokens', {
  id:             text('id').primaryKey(),                  // jti
  userId:         text('user_id').notNull().references(() => users.id),
  tokenHash:      text('token_hash').notNull(),             // SHA-256 of the token
  expiresAt:      integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt:      integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' })
                    .notNull()
                    .default(sql`(unixepoch() * 1000)`),
})

export const payments = sqliteTable('payments', {
  id:                 text('id').primaryKey(),
  userId:             text('user_id').notNull().references(() => users.id),
  stripePaymentIntent: text('stripe_payment_intent').notNull().unique(),
  amount:             integer('amount').notNull(),          // cents
  currency:           text('currency').notNull().default('eur'),
  status:             text('status').notNull(),             // 'pending' | 'succeeded' | 'failed'
  createdAt:          integer('created_at', { mode: 'timestamp_ms' })
                        .notNull()
                        .default(sql`(unixepoch() * 1000)`),
})
```

**Online status** is NOT stored in DB. It is maintained in memory on the API server (`Map<userId, Set<socketId>>`) and broadcast via Socket.io events. `lastSeenAt` is only persisted on disconnect.

---

## 5. Shared Types (libs/shared-types)

**File:** `libs/shared-types/src/lib/user.ts`

```ts
export interface User {
  id: string
  email: string
  displayName: string
  bio: string
  avatarUrl: string | null
  locale: Locale
  isPro: boolean
  lastSeenAt: number | null
  createdAt: number
}

export type PublicUser = Omit<User, 'email'> & { isOnline: boolean }

export type Locale = 'en' | 'tr' | 'et'
```

**File:** `libs/shared-types/src/lib/message.ts`

```ts
export interface Message {
  id: string
  senderId: string
  recipientId: string
  body: string
  createdAt: number
  readAt: number | null
}
```

**File:** `libs/shared-types/src/lib/conversation.ts`

```ts
import type { PublicUser } from './user'
import type { Message } from './message'

/**
 * A conversation is derived from messages — it's not its own table.
 * One per unique (currentUser, partner) pair where at least one message exists.
 */
export interface Conversation {
  partner: PublicUser
  lastMessage: Message
  unreadCount: number
}
```

**File:** `libs/shared-types/src/lib/call.ts`

```ts
export type CallType = 'audio' | 'video'
export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended'
export type CallEndReason = 'hangup' | 'rejected' | 'timeout' | 'failed' | 'busy'
```

**File:** `libs/shared-types/src/lib/socket-events.ts`

```ts
// Client → Server
export const CLIENT_EVENTS = {
  MESSAGE_SEND:   'message:send',
  MESSAGE_READ:   'message:read',
  TYPING_START:   'typing:start',
  TYPING_STOP:    'typing:stop',
  CALL_INITIATE:  'call:initiate',
  CALL_ACCEPT:    'call:accept',
  CALL_REJECT:    'call:reject',
  CALL_OFFER:     'call:offer',
  CALL_ANSWER:    'call:answer',
  CALL_ICE:       'call:ice',
  CALL_END:       'call:end',
} as const

// Server → Client
export const SERVER_EVENTS = {
  MESSAGE_NEW:        'message:new',
  MESSAGE_DELIVERED:  'message:delivered',
  MESSAGE_READ:       'message:read',
  USER_ONLINE:        'user:online',
  USER_OFFLINE:       'user:offline',
  TYPING_START:       'typing:start',
  TYPING_STOP:        'typing:stop',
  CALL_INCOMING:      'call:incoming',
  CALL_ACCEPTED:      'call:accepted',
  CALL_REJECTED:      'call:rejected',
  CALL_OFFER:         'call:offer',
  CALL_ANSWER:        'call:answer',
  CALL_ICE:           'call:ice',
  CALL_ENDED:         'call:ended',
  ERROR:              'error',
} as const

export interface MessageSendPayload {
  recipientId: string
  body: string
  clientId: string         // for optimistic UI reconciliation
}

export interface CallInitiatePayload {
  toUserId: string
  callType: 'audio' | 'video'
}

export interface CallSignalPayload {
  toUserId: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}
```

---

## 6. Shared Contracts (libs/shared-contracts)

**File:** `libs/shared-contracts/src/lib/auth.ts`

```ts
import { z } from 'zod'

export const loginInput = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
})
export type LoginInput = z.infer<typeof loginInput>

export const registerInput = loginInput.extend({
  displayName: z.string().min(2).max(50).trim(),
})
export type RegisterInput = z.infer<typeof registerInput>
```

**File:** `libs/shared-contracts/src/lib/user.ts`

```ts
import { z } from 'zod'

export const updateProfileInput = z.object({
  displayName: z.string().min(2).max(50).trim().optional(),
  bio: z.string().max(280).optional(),
  avatarUrl: z.union([
    z.string().url(),
    z.string().startsWith('data:image/jpeg;base64,').max(150_000),  // ~100KB data URL + headroom
    z.null(),
  ]).optional(),
  locale: z.enum(['en', 'tr', 'et']).optional(),
})
export type UpdateProfileInput = z.infer<typeof updateProfileInput>
```

**File:** `libs/shared-contracts/src/lib/message.ts`

```ts
import { z } from 'zod'

export const sendMessageInput = z.object({
  recipientId: z.string().uuid(),
  body: z.string().min(1).max(2000).trim(),
  clientId: z.string(),
})
export type SendMessageInput = z.infer<typeof sendMessageInput>
```

**File:** `libs/shared-contracts/src/lib/payment.ts`

```ts
import { z } from 'zod'

export const createPaymentIntentInput = z.object({
  product: z.enum(['pro_monthly']),
})
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentInput>
```

---

## 7. REST API Contract

Base URL: `/api` (Netlify rewrites to Railway).

All authenticated endpoints require `Authorization: Bearer <accessToken>` header.

### 7.1 Auth

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/api/auth/register` | `RegisterInput` | `{ user, accessToken }` + sets refresh cookie | 201 on success |
| POST | `/api/auth/login` | `LoginInput` | `{ user, accessToken }` + sets refresh cookie | 401 on bad credentials |
| POST | `/api/auth/refresh` | — | `{ accessToken }` + rotated refresh cookie | Reads refresh cookie |
| POST | `/api/auth/logout` | — | 204 | Revokes refresh, clears cookie |
| GET  | `/api/auth/me` | — | `User` | Requires auth |

### 7.2 Users

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| GET  | `/api/users` | — | `PublicUser[]` | All users except self, with online status |
| GET  | `/api/users/:id` | — | `PublicUser` | |
| PATCH | `/api/users/me` | `UpdateProfileInput` | `User` | |

### 7.3 Conversations

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| GET  | `/api/conversations` | — | `Conversation[]` | Recents list: one entry per partner the user has exchanged messages with, ordered by `lastMessage.createdAt` DESC |

**Implementation note:** Conversations are derived, not stored. Single query joins distinct message partners with their latest message and unread count. Drizzle pseudo-shape:

```ts
// For currentUserId:
// 1. SELECT DISTINCT partner_id from messages WHERE sender_id=? OR recipient_id=?
// 2. For each partner: latest message + unread count (where recipient=current AND readAt IS NULL)
// 3. Join with users table for partner display info
// 4. Sort by latest message createdAt DESC
```

Can be done as one query with CTEs/window functions in SQLite, or two queries (partners, then a single batched message fetch). Either is acceptable.

### 7.4 Messages

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| GET  | `/api/messages/:otherUserId` | — | `Message[]` | Paginated via `?before=<timestamp>&limit=50`, default 50, ordered DESC |
| POST | `/api/messages/:otherUserId/read` | — | 204 | Marks all unread from otherUser as read |

> **Note:** Sending messages happens via Socket.io only (`message:send`), not REST. The server persists, then broadcasts. This avoids dual-write races.

### 7.5 Payments

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/api/payments/create-intent` | `CreatePaymentIntentInput` | `{ clientSecret, paymentIntentId }` | |
| POST | `/api/stripe-webhook` | (Stripe raw body) | 200 | Raw body parser required; verify signature |

### 7.6 Error response shape

All errors return:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password incorrect",
    "details": null
  }
}
```

Status codes: 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 409 (conflict, e.g. email taken), 500 (server).

---

## 8. Socket.io Event Contract

### 8.1 Connection

- Client connects with `auth: { token: <accessToken> }`
- Server middleware verifies JWT, attaches `socket.data.userId`
- Reject with `Error('unauthorized')` on invalid token
- On connect: server joins socket to room `user:<userId>`, adds to online map, broadcasts `user:online` to all
- On disconnect: if last socket for user, broadcast `user:offline`, update `lastSeenAt` in DB

### 8.2 Messaging events

| Event | Direction | Payload | Behavior |
|-------|-----------|---------|----------|
| `message:send` | C→S | `MessageSendPayload` | Validate, persist, emit `message:new` to recipient room + sender for echo; emit `message:delivered` to sender with server `id` + `createdAt` |
| `message:new` | S→C | `Message` | Recipient receives new message |
| `message:delivered` | S→C | `{ clientId, id, createdAt }` | Sender reconciles optimistic UI |
| `message:read` | C→S | `{ otherUserId }` | Marks all from otherUser as read; broadcasts to original sender |
| `message:read` | S→C | `{ readerId, readAt }` | Original sender updates read receipts |
| `typing:start` / `typing:stop` | C↔S | `{ otherUserId }` (C→S) / `{ fromUserId }` (S→C) | Forwarded only |

### 8.3 Call signaling events

| Event | Direction | Payload | Behavior |
|-------|-----------|---------|----------|
| `call:initiate` | C→S | `{ toUserId, callType }` | If callee online, emit `call:incoming` to callee; else `error` `CALLEE_OFFLINE` |
| `call:incoming` | S→C | `{ fromUser, callType }` | Callee gets ringing modal |
| `call:accept` | C→S | `{ fromUserId }` | Emit `call:accepted` to caller |
| `call:reject` | C→S | `{ fromUserId, reason? }` | Emit `call:rejected` to caller |
| `call:offer` / `call:answer` / `call:ice` | C→S | `CallSignalPayload` | Relay verbatim to target user room |
| `call:end` | C→S | `{ toUserId }` | Emit `call:ended` to other party |

**Note:** Server validates only that both parties are authenticated and online. SDP and ICE payloads are passed through unmodified.

---

## 9. Authentication Flow (Detailed)

### 9.1 Token strategy

- **Access token (JWT, HS256):** 15-minute TTL, stored in Pinia memory only. Sent as `Authorization: Bearer ...`. Lost on page refresh, restored via refresh flow.
- **Refresh token (opaque, 64-byte random base64url):** 7-day TTL, stored as HttpOnly Secure SameSite=None cookie. SHA-256 hash stored in DB (`refresh_tokens` table). Rotated on every use.

### 9.2 Cookie config

```ts
reply.setCookie('refresh_token', token, {
  httpOnly: true,
  secure: true,                // production
  sameSite: 'none',            // cross-site Netlify ↔ Railway
  path: '/api/auth',           // only sent to auth routes
  maxAge: 60 * 60 * 24 * 7,    // 7 days
})
```

Use Netlify rewrites so the cookie domain is same-origin from the browser's perspective — this sidesteps `SameSite=None` requirements entirely:

```toml
[[redirects]]
  from = "/api/*"
  to   = "https://<your-api>.up.railway.app/:splat"
  status = 200
  force  = true
```

With rewrites, cookies become first-party. Set `SameSite=Lax` instead of `None`. Cleaner.

### 9.3 Frontend refresh flow

1. App boots → `useAuthStore.bootstrap()` calls `POST /api/auth/refresh`
2. On 200: store accessToken + user; connect socket
3. On 401: clear state, route to `/auth`
4. axios response interceptor catches 401 on any other request → calls `/api/auth/refresh` → retries original request once
5. If refresh fails: logout, route to `/auth`

### 9.4 Socket token refresh

When access token expires while socket connected:
1. Disconnect socket on 401 from refresh
2. After successful refresh, reconnect with new token
3. Composable `useSocket` watches `authStore.accessToken` and reconnects on change

### 9.5 Password hashing

bcrypt with cost factor 12. Async hashing on register, async compare on login.

### 9.6 JWT payload

```ts
{
  sub: string         // user id
  email: string
  iat: number
  exp: number
}
```

JWT secret in env var `JWT_SECRET` (min 32 chars).

---

## 10. Frontend Architecture

### 10.1 Routes

```ts
// apps/web/src/router/index.ts
const routes = [
  { path: '/auth',          name: 'auth',      component: () => import('@/pages/AuthView.vue'),       meta: { layout: 'auth', requiresGuest: true } },
  { path: '/',              name: 'chats',     component: () => import('@/pages/ChatsView.vue'),      meta: { layout: 'app', requiresAuth: true } },
  { path: '/community',     name: 'community', component: () => import('@/pages/CommunityView.vue'),  meta: { layout: 'app', requiresAuth: true } },
  { path: '/chat/:userId',  name: 'chat',      component: () => import('@/pages/ChatView.vue'),       meta: { layout: 'app', requiresAuth: true } },
  { path: '/profile',       name: 'profile',   component: () => import('@/pages/ProfileView.vue'),    meta: { layout: 'app', requiresAuth: true } },
  { path: '/upgrade',       name: 'upgrade',   component: () => import('@/pages/UpgradeView.vue'),    meta: { layout: 'app', requiresAuth: true } },
  { path: '/:catchAll(.*)', redirect: '/' },
]
```

Global guard: `beforeEach` checks `meta.requiresAuth` against `authStore.isAuthenticated`. If `bootstrap()` hasn't completed, await it first.

> **Desktop note:** on `md+` viewports, when `/chat/:userId` is active, the persistent sidebar shows the Chats list and the route content fills the right pane. The user can navigate between conversations without leaving the chat surface. See section 11.1 (Layout Architecture).

### 10.2 Pinia stores (setup-store style)

**`stores/auth.ts`**
```ts
state: user, accessToken, isBootstrapping
getters: isAuthenticated
actions: bootstrap(), login(), register(), logout(), refresh(), updateProfile()
```

**`stores/users.ts`**
```ts
state: users: PublicUser[], byId: Map<string, PublicUser>
getters: onlineUsers, offlineUsers
actions: fetchAll(), setOnline(userId), setOffline(userId), updateLastSeen(userId, ts)
```

**`stores/chat.ts`**
```ts
state: messagesByUser: Map<userId, Message[]>, typingByUser: Map<userId, boolean>,
       conversations: Conversation[]
actions: fetchHistory(otherUserId), fetchConversations(),
         addMessage(msg) — also updates conversations,
         markRead(otherUserId) — also updates conversations,
         setTyping(userId, bool)
getters: getConversation(userId), unreadCount(userId), totalUnread, sortedConversations
getters: getConversation(userId), unreadCount(userId), totalUnread
```

**`stores/call.ts`**
```ts
state: state: CallState, remoteUserId, callType, isOutgoing, isMuted, isCameraOff, localStream, remoteStream
actions: initiate(userId, type), accept(), reject(), end(), toggleMute(), toggleCamera()
```

**`stores/ui.ts`**
```ts
state: locale, installPromptVisible, toasts
actions: setLocale(), showInstallPrompt(), pushToast()
```

### 10.3 Key composables

**`composables/useSocket.ts`** — singleton socket instance, connects on `accessToken` change, exposes `emit` and reactive event subscriptions. Cleans up on logout.

**`composables/useWebRTC.ts`** — manages `RTCPeerConnection` lifecycle, getUserMedia, ICE candidate handling, integrates with `call` store.

**`composables/useInstallPrompt.ts`** — captures `beforeinstallprompt`, detects iOS for custom banner, exposes `canInstall` + `promptInstall()`.

**`composables/useI18n.ts`** — wrapper over vue-i18n's `useI18n` with our locale type narrowed.

### 10.4 Axios setup

**`apps/web/src/api/client.ts`**

```ts
const api = axios.create({ baseURL: '/api', withCredentials: true })

api.interceptors.request.use(cfg => {
  const token = useAuthStore().accessToken
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Single-flight refresh on 401
let refreshPromise: Promise<string> | null = null
api.interceptors.response.use(undefined, async err => {
  const status = err.response?.status
  const original = err.config
  if (status === 401 && !original._retry && !original.url.includes('/auth/')) {
    original._retry = true
    refreshPromise ??= useAuthStore().refresh().finally(() => { refreshPromise = null })
    try {
      await refreshPromise
      return api.request(original)
    } catch {
      useAuthStore().logout()
      throw err
    }
  }
  throw err
})
```

---

## 11. Screen Specifications

### 11.1 Layout Architecture

The app uses **two layouts** that switch based on auth state, and **one responsive shell** that adapts to viewport width.

#### AuthLayout (used only for `/auth`)

Centered card on a neutral background, full viewport height. No navigation chrome. Used for login/register only.

#### AppLayout (used for all authenticated routes)

Adapts to viewport width via the `useBreakpoint()` composable.

**Mobile (`< md` / < 768px) — single-pane stack:**

```
┌──────────────────────────┐
│  TopBar                  │  ← context-aware: shows back arrow on /chat/:userId
├──────────────────────────┤
│                          │
│  <router-view />         │  ← active route fills the body
│                          │
│                          │
├──────────────────────────┤
│  BottomTabBar            │  ← Chats · Community · Profile (hidden on /chat/:userId)
└──────────────────────────┘
```

The bottom tab bar is **hidden** when on `/chat/:userId` to maximize message real estate. Back arrow in top bar returns to the previously active tab.

**Desktop (`md+` / ≥ 768px) — split-pane:**

```
┌────────────────────────────────────────────────┐
│  TopBar (full width)                           │
├──────────────┬─────────────────────────────────┤
│              │                                 │
│  Sidebar     │                                 │
│  ─────────   │      <router-view />            │
│  Chats list  │                                 │
│  (always     │      (Chats / Community /       │
│   visible)   │       Chat / Profile / Upgrade) │
│              │                                 │
│              │                                 │
├──────────────┤                                 │
│  NavRail     │                                 │
│  (Chats /    │                                 │
│   Community /│                                 │
│   Profile)   │                                 │
└──────────────┴─────────────────────────────────┘
```

The sidebar is **always visible** at `md+` and shows the Chats list (recents). The right pane shows whatever route is active. When on `/` (Chats route) at desktop width, the right pane shows an empty state ("Pick a conversation") since the sidebar already shows the list.

#### Layout decision matrix

| Route | Mobile (<md) | Desktop (md+) right pane |
|-------|--------------|--------------------------|
| `/` (Chats) | Full-pane list | Empty state ("Select a conversation") — list is in sidebar |
| `/community` | Full-pane user grid | User grid |
| `/chat/:userId` | Full-pane chat (tab bar hidden) | Chat view |
| `/profile` | Full-pane form | Form (max-width centered) |
| `/upgrade` | Full-pane | Form (max-width centered) |

#### `useBreakpoint` composable

```ts
// composables/useBreakpoint.ts
export function useBreakpoint() {
  const isMd = useMediaQuery('(min-width: 768px)')
  const isLg = useMediaQuery('(min-width: 1024px)')
  return { isMd, isLg, isMobile: computed(() => !isMd.value) }
}
```

Use `@vueuse/core`'s `useMediaQuery` (small, well-maintained, SSR-safe).

#### Why not three panes (Discord-style)

Reviewed and rejected. Discord's three-pane layout requires server/channel concepts not in scope. A third "members" pane would duplicate information already conveyed by online dots on each conversation row + the Community tab. Two panes (list + active) matches WhatsApp Web / Telegram Desktop and is the strongest pattern for 1:1 chat at desktop sizes.

---

### 11.2 AuthView (`/auth`)

**Layout:** AuthLayout — centered card, full-height, app logo at top.

**Behavior:**
- Toggle between Login and Register modes (local state)
- Login fields: email, password
- Register fields: displayName, email, password
- Submit button shows spinner during request
- Errors shown inline under fields (Zod validation client-side) + above form (server errors)
- On success: route to `/`
- "Continue as guest" link NOT included (would clash with persistent users)

**Components used:** `BaseInput`, `BaseButton`, `FormField`, `Alert`

---

### 11.3 ChatsView (`/`) — Recents

**Purpose:** The user's recent conversations, sorted by latest message. This is the default landing screen after auth — the "home" of the app.

**Layout (mobile):**
```
┌──────────────────────────┐
│ TopBar: "Chats"          │
├──────────────────────────┤
│ [search input]           │
├──────────────────────────┤
│ ── Online now ────────── │
│ ◯ ◯ ◯ ◯ ◯ ◯ →           │  ← horizontal scroll avatars
├──────────────────────────┤
│ 🟢 Alice    ✓✓ Last msg…│
│             2m  ·  (3)   │
│──────────────────────────│
│ ⚪ Bob      You: msg…    │
│             1h           │
│──────────────────────────│
│ ⚪ Carol    Last msg…    │
│             yesterday    │
└──────────────────────────┘
```

**Behavior:**
- On mount: call `chatStore.fetchConversations()`
- "Online now" strip: horizontal-scroll list of online users (max 10). Tap → open `/chat/:userId`. Hidden if no online users.
- Conversation rows show: avatar (with online dot overlay), displayName, last message preview (prefix "You: " if sent by current user, truncate to 1 line), relative timestamp, unread count badge
- Read state: own messages show ✓ (sent) or ✓✓ (read) in preview
- Search filters by partner displayName (client-side)
- Tap row → navigate to `/chat/:userId`
- Pull-to-refresh (mobile) re-fetches conversations
- Real-time updates: when a `message:new` arrives, the matching conversation moves to top and updates last message + unread count

**Empty state:**
- "No conversations yet"
- CTA button: "Find someone to chat with" → routes to `/community`

**Desktop variant:**
- The same list renders in the persistent sidebar
- ChatsView at `/` route → empty state in right pane: "Select a conversation to start messaging" with a subtle illustration

**Components used:** `ConversationRow`, `OnlineNowStrip`, `BaseInput`, `EmptyState`

---

### 11.4 CommunityView (`/community`)

**Purpose:** Discovery — find users you haven't yet chatted with, or start a new conversation with any registered user.

**Layout:**
- Top bar: "Community"
- Search input
- Section: "Online now" (online users not in your recents)
- Section: "All users" (everyone except self)

**Behavior:**
- List shows all users except self
- Each row: avatar, displayName, bio truncated, online dot (green if online, grey + "last seen X ago" if offline)
- Tap row → navigate to `/chat/:userId`
- Search filters by displayName (client-side)
- Sort: online first, then by `lastSeenAt` desc

**Empty state:** "You're the only one here. Invite someone!"

---

### 11.5 ChatView (`/chat/:userId`)

**Layout (mobile):**
- Top bar: back arrow, recipient avatar + name + online status, call buttons (audio, video)
- Message list (scrollable, scroll-to-bottom on new message if near bottom)
- Typing indicator above compose bar
- Compose bar: text input + send button (or Enter to send)
- Bottom tab bar is **hidden** in this view

**Layout (desktop):**
- Sidebar (Chats list) on left — selected conversation is highlighted
- Right pane: top bar (no back arrow on desktop), message list, compose bar
- Switching conversation is a sidebar click; no back navigation needed

**Behavior:**
- Fetch last 50 messages on mount
- Infinite scroll up to load older (200-message buffer ceiling, then "load more" button)
- Date separators between days
- Read receipts: ✓ (sent), ✓✓ (read) on own messages
- Typing indicator with 3-second debounce after last keystroke
- Optimistic send: message appears immediately with `clientId`, reconciled when server confirms with `id`
- Call buttons trigger `callStore.initiate(userId, 'audio'|'video')`
- Mark conversation as read on mount + on new message arrival while viewing

**Message bubble:**
- Own messages: right-aligned, brand color background
- Their messages: left-aligned, neutral background
- Timestamp on hover/long-press

---

### 11.6 ProfileView (`/profile`)

**Layout:** form, top to bottom: avatar (with upload), displayName, bio (textarea), locale switcher, "Upgrade to Pro" CTA (if not pro), logout button.

On desktop: form is centered in the right pane, max-width 28rem.

**Behavior:**
- Avatar upload: see section 11.9 for full implementation spec
- All fields editable, save button at bottom
- Locale change applies immediately + persists to DB
- "Upgrade to Pro" routes to `/upgrade`
- Logout: confirms via dialog, then `authStore.logout()` → `/auth`

---

### 11.7 UpgradeView (`/upgrade`)

**Layout:** product card, Stripe Payment Element, pay button. Centered, max-width 28rem on all viewports.

**Behavior:**
- On mount: POST `/api/payments/create-intent` → get clientSecret
- Mount Payment Element with clientSecret
- On submit: `stripe.confirmPayment({ elements, confirmParams: { return_url: ${origin}/profile } })`
- Webhook confirms server-side, sets `user.isPro = true`
- Display "Pro ✓" badge on profile if already pro

---

### 11.8 Modals / Overlays

**CallModal** — full-screen overlay when `callStore.state !== 'idle'`. States:
- `calling` (outgoing): "Calling <name>…" + cancel button
- `ringing` (incoming): caller info + accept/reject buttons
- `connecting`: spinner + "Connecting…"
- `connected`: video tiles (or audio avatar) + mute, camera-toggle, end-call buttons
- `ended`: brief "Call ended" toast then dismiss

**InstallPromptBanner** — slide-down banner if `canInstall` true and user is on mobile. "Install Chat for the full experience" + Install + Dismiss. Dismissal persists in localStorage.

---

### 11.9 Avatar Upload Implementation

Storage approach: **data URLs in the database, no bucket, no server-side image processing.** This keeps the demo's infrastructure footprint minimal and works within Railway's volume-backed SQLite. In production, this would be swapped for S3/R2 with signed URLs — flagged in REPORT.md as "obvious next step."

#### Constraints

| Constraint | Value | Enforced where |
|------------|-------|----------------|
| Accepted MIME types | `image/jpeg`, `image/png`, `image/webp` | Client (file input `accept` + post-decode check) |
| Output format | `image/jpeg` (re-encoded from any input) | Client (canvas) |
| Output dimensions | 256×256 px square, center-cropped | Client (canvas) |
| Output JPEG quality | 0.85 | Client (canvas) |
| Max input file size (pre-resize) | 10 MB | Client (file input check) — anything larger is rejected before decode to avoid OOM on mobile |
| Max output data URL length | 100 KB (~75 KB binary) | Client (post-encode check) |
| Server-side max length | 150,000 chars (~110 KB) — headroom for tolerance | Zod schema `updateProfileInput.avatarUrl` |

#### Composable: `useAvatarUpload`

**File:** `apps/web/src/composables/useAvatarUpload.ts`

Public API:
- `pickAndProcess(file: File): Promise<{ dataUrl: string } | { error: string }>` — returns either a JPEG data URL ready to PATCH, or a translatable error key
- `MAX_FILE_BYTES = 10 * 1024 * 1024`
- `MAX_DATA_URL_LENGTH = 100_000`

#### Pipeline

```ts
// Pseudocode for useAvatarUpload.pickAndProcess
async function pickAndProcess(file: File) {
  // 1. Pre-decode size guard (prevents loading a 50MB raw camera image)
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'avatar.errors.fileTooLarge' }   // i18n key
  }

  // 2. MIME validation (defense — file extension can lie)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { error: 'avatar.errors.unsupportedFormat' }
  }

  // 3. Decode via Image + object URL (works on all mobile browsers)
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode failed'))
      img.src = objectUrl
    })
  } catch {
    URL.revokeObjectURL(objectUrl)
    return { error: 'avatar.errors.decodeFailed' }
  }

  // 4. Center-crop to square, resize to 256×256 via canvas
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const sourceSize = Math.min(img.width, img.height)
  const sx = (img.width - sourceSize) / 2
  const sy = (img.height - sourceSize) / 2

  ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size)
  URL.revokeObjectURL(objectUrl)

  // 5. Encode as JPEG at 0.85
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

  // 6. Post-encode size guard
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return { error: 'avatar.errors.resultTooLarge' }
  }

  return { dataUrl }
}
```

#### Component wiring

ProfileView uses a hidden `<input type="file" accept="image/jpeg,image/png,image/webp" />` triggered by clicking the avatar. On change:

```ts
async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isProcessing.value = true
  const result = await pickAndProcess(file)
  isProcessing.value = false
  if ('error' in result) {
    toast.error(t(result.error))
    return
  }
  // Optimistic preview; PATCH happens on Save button submit (not auto-save)
  draft.value.avatarUrl = result.dataUrl
}
```

The avatar is staged in the form's local `draft` state — it only persists when the user clicks Save (which submits the whole profile form). This avoids surprising auto-saves and matches the rest of the profile form's behavior.

#### Default avatar

When `user.avatarUrl` is null, render a generated placeholder: a colored circle with the user's initials (first letter of displayName, uppercase). Background color derived deterministically from the user ID (hash → hue → `oklch(0.7 0.1 ${hue})`). This avoids broken-image icons and gives every user a recognizable default.

Shared `<UserAvatar>` component handles both states: shows the data URL if present, otherwise the initials circle.

#### i18n keys to add

```json
{
  "avatar": {
    "uploadLabel": "Change photo",
    "errors": {
      "fileTooLarge": "Image is too large (max 10MB)",
      "unsupportedFormat": "Please use JPEG, PNG, or WebP",
      "decodeFailed": "Couldn't read that image. Try another?",
      "resultTooLarge": "Image is too complex to compress. Try a simpler photo."
    }
  }
}
```

Translate to TR and ET accordingly.

#### Server-side validation

The Zod schema (`updateProfileInput.avatarUrl`) already enforces:
- Either an `https://` URL (for future bucket migration without API changes), or
- A `data:image/jpeg;base64,` data URL up to 150,000 chars, or
- `null` (to clear avatar)

No image decoding on the server. If the client sends a malformed data URL, Drizzle stores the string as-is and the next `<img>` render shows a broken image — acceptable failure mode for a demo.

#### Why not allow PNG output

JPEG at 256×256 quality 0.85 lands in the 8-25KB range for typical photos. PNG at the same dimensions can hit 200KB+ for photographic content. Avatars are inherently photographic, so JPEG is the right call. WebP would be smaller still but Safari support history is rocky enough that JPEG is the safer demo choice — and at 25KB worst case, the size difference doesn't matter.

---

### 11.10 Component inventory

New components introduced by the responsive layout:

| Component | Purpose | Location |
|-----------|---------|----------|
| `AppLayout.vue` | Responsive shell — switches between mobile stack and desktop split-pane | `layouts/` |
| `Sidebar.vue` | Persistent left sidebar on `md+` — wraps `ConversationList` | `components/layout/` |
| `NavRail.vue` | Sidebar bottom rail at `md+` — Chats / Community / Profile icons | `components/layout/` |
| `BottomTabBar.vue` | Mobile-only bottom nav | `components/layout/` |
| `TopBar.vue` | Context-aware top bar (back button on chat, plain title elsewhere) | `components/layout/` |
| `ConversationRow.vue` | Single recents row (used both in `ChatsView` body on mobile and `Sidebar` on desktop) | `components/chat/` |
| `OnlineNowStrip.vue` | Horizontal avatar strip of online users | `components/chat/` |
| `EmptyState.vue` | "Select a conversation" placeholder for desktop right pane | `components/ui/` |
| `UserAvatar.vue` | Renders avatar from data URL when present, falls back to initials circle with deterministic background color | `components/ui/` |

---

## 12. Design System

### 12.1 Tailwind 4 theme

**File:** `apps/web/src/styles/theme.css`

```css
@import "tailwindcss";

@theme {
  /* Colors (OKLCH for perceptual uniformity) */
  --color-brand-50:  oklch(0.97 0.02 250);
  --color-brand-100: oklch(0.93 0.05 250);
  --color-brand-200: oklch(0.86 0.10 250);
  --color-brand-300: oklch(0.76 0.15 250);
  --color-brand-400: oklch(0.66 0.18 250);
  --color-brand-500: oklch(0.58 0.20 250);   /* primary */
  --color-brand-600: oklch(0.50 0.20 250);
  --color-brand-700: oklch(0.42 0.18 250);
  --color-brand-800: oklch(0.34 0.15 250);
  --color-brand-900: oklch(0.26 0.10 250);

  --color-surface:        oklch(0.99 0.005 250);
  --color-surface-subtle: oklch(0.97 0.01 250);
  --color-surface-muted:  oklch(0.93 0.01 250);
  --color-border:         oklch(0.88 0.01 250);
  --color-text:           oklch(0.20 0.02 250);
  --color-text-muted:     oklch(0.45 0.02 250);

  --color-success: oklch(0.65 0.18 145);
  --color-warning: oklch(0.72 0.18 75);
  --color-danger:  oklch(0.58 0.22 25);

  /* Typography */
  --font-sans: "Inter Variable", system-ui, -apple-system, sans-serif;
  --font-display: "Inter Variable", system-ui;

  /* Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.06), 0 4px 16px oklch(0 0 0 / 0.04);
  --shadow-modal: 0 16px 48px oklch(0 0 0 / 0.18);
}

@layer base {
  body {
    font-family: var(--font-sans);
    background: var(--color-surface);
    color: var(--color-text);
    -webkit-font-smoothing: antialiased;
  }
}

@layer components {
  .btn { @apply inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg font-medium transition; }
  .btn-primary { @apply btn bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700; }
  .btn-ghost   { @apply btn text-text hover:bg-surface-muted; }
  .input { @apply w-full h-11 px-3 rounded-lg border border-border bg-surface-subtle outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20; }
  .card  { @apply bg-surface rounded-xl shadow-[var(--shadow-card)] p-4; }
}
```

### 12.2 Mobile-first viewport

- Use `dvh` not `vh` for full-height layouts (handles mobile keyboard correctly)
- Container max-width: `max-w-md` (28rem / 448px) on mobile-first; expand to `max-w-2xl` on desktop with centered alignment to suggest a phone preview
- Safe area insets: `padding-bottom: env(safe-area-inset-bottom)` on bottom tab bar
- Tap targets: minimum 44×44 px

### 12.3 Loading + empty + error states

Every async surface must have all three. Use shared components: `LoadingState`, `EmptyState`, `ErrorState`. No raw "Loading…" text.

---

## 13. WebRTC Implementation

### 13.1 ICE servers config

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

Add a dev-only `?forceRelay=1` query param that sets `iceTransportPolicy: 'relay'` so TURN can be tested without symmetric NAT.

### 13.2 Composable structure

**`composables/useWebRTC.ts`**

Public API:
- `state`: `Ref<CallState>`
- `localStream`, `remoteStream`: `Ref<MediaStream | null>`
- `isMuted`, `isCameraOff`: `Ref<boolean>`
- `initiateCall(toUserId, callType)`
- `acceptCall()`
- `rejectCall()`
- `endCall()`
- `toggleMute()`
- `toggleCamera()`

### 13.3 Call flow (caller side)

1. User taps call button → `initiateCall(toUserId, 'video')`
2. `getUserMedia({ audio: true, video: callType === 'video' })` → store as `localStream`
3. Set call state to `calling`
4. Create `RTCPeerConnection` with ICE_SERVERS
5. Add local tracks: `localStream.getTracks().forEach(t => pc.addTrack(t, localStream))`
6. Wire event handlers: `ontrack` → set remoteStream; `onicecandidate` → emit `call:ice`; `oniceconnectionstatechange` → handle disconnect
7. Emit `call:initiate` over socket
8. Wait for `call:accepted` from callee
9. On accepted: create offer, set as local description, emit `call:offer`
10. Receive `call:answer`, set as remote description
11. ICE candidates flow back and forth via `call:ice` events
12. When `iceConnectionState === 'connected'`, set call state to `connected`

### 13.4 Call flow (callee side)

1. Receive `call:incoming` → set state to `ringing`, show modal
2. On accept: get user media, create PC, emit `call:accept`
3. Receive `call:offer`, set remote description, create answer, set as local description, emit `call:answer`
4. ICE candidates flow

### 13.5 Perfect negotiation

Both sides set a `polite` flag (e.g. callee is polite, caller is impolite). On `negotiationneeded`, impolite peer ignores rollback. Implement per the W3C example: https://w3c.github.io/webrtc-pc/#perfect-negotiation-example

### 13.6 Cleanup

On `endCall()` or any terminal state:
1. `localStream.getTracks().forEach(t => t.stop())` — releases camera/mic
2. `pc.close()`
3. Emit `call:end` to peer
4. Reset all reactive state

This must be bulletproof. Camera light staying on after a call is a demo-killer.

### 13.7 Mobile gotchas

- `<video>` elements need `playsinline` attribute (iOS Safari)
- `autoplay muted` for remote video (audio resumes on user gesture if needed)
- `getUserMedia` requires HTTPS (Netlify provides this)
- On iOS, calling `getUserMedia` again while a stream is active can fail — always stop tracks first

### 13.8 Renegotiation (optional)

If switching from audio-only to video mid-call, add a track and renegotiate. Implement only if time permits; otherwise lock call type at initiation.

---

## 14. Internationalization

### 14.1 Setup

**File:** `apps/web/src/i18n/index.ts`

```ts
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import tr from '@/locales/tr.json'
import et from '@/locales/et.json'
import type { Locale } from '@chat/shared-types'

const SUPPORTED: Locale[] = ['en', 'tr', 'et']

function detectInitial(): Locale {
  const stored = localStorage.getItem('locale') as Locale | null
  if (stored && SUPPORTED.includes(stored)) return stored
  const browser = navigator.language.split('-')[0] as Locale
  return SUPPORTED.includes(browser) ? browser : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectInitial(),
  fallbackLocale: 'en',
  messages: { en, tr, et },
  datetimeFormats: {
    en: { short: { day: 'numeric', month: 'short' }, long: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } },
    tr: { short: { day: 'numeric', month: 'short' }, long: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } },
    et: { short: { day: 'numeric', month: 'short' }, long: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } },
  },
})
```

### 14.2 Locale change flow

1. User changes locale in profile
2. `i18n.global.locale.value = newLocale`
3. `localStorage.setItem('locale', newLocale)`
4. PATCH `/api/users/me` with `{ locale: newLocale }` (server persists)

On next session, server-stored locale wins over localStorage (loaded after auth bootstrap).

### 14.3 Translation key conventions

Namespace by feature:
- `auth.title`, `auth.login.email`, `auth.errors.invalidCredentials`
- `chat.compose.placeholder`, `chat.typing`
- `call.incoming`, `call.connecting`, `call.controls.mute`
- `common.save`, `common.cancel`, `common.loading`

### 14.4 Initial translations

Provide hand-written translations for English, Turkish (Tahir is bilingual), and Estonian. Translate Estonian using DeepL drafts as a starting point. Note in README that Estonian translation is best-effort.

### 14.5 Date formatting

Use `Intl.DateTimeFormat(locale, opts)` for dates. Use `Intl.RelativeTimeFormat` for "last seen X ago".

---

## 15. Stripe Integration

### 15.1 Product

Single product: "Chat Pro" — €4.99/month one-time charge for demo (no subscription complexity). Grants `isPro: true` for the user.

### 15.2 Server

**Plugin:** `apps/api/src/app/plugins/stripe.ts` — initializes Stripe client.

**Routes:**
- `POST /api/payments/create-intent` — creates PaymentIntent with `automatic_payment_methods: { enabled: true }`, amount=499, currency='eur', metadata: `{ userId, product }`
- `POST /api/stripe-webhook` — raw body, verifies signature, handles `payment_intent.succeeded` → upsert into `payments` table, set `user.isPro = true`

### 15.3 Webhook setup

Local dev: `stripe listen --forward-to localhost:3000/api/stripe-webhook` — gives a webhook secret.
Production: register endpoint in Stripe dashboard, use the production webhook secret.

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, frontend uses `VITE_STRIPE_PUBLISHABLE_KEY`.

### 15.4 Client

`apps/web/src/pages/UpgradeView.vue`:
1. On mount: fetch clientSecret from server
2. `const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
3. `const elements = stripe.elements({ clientSecret })`
4. Mount Payment Element into a div
5. On submit: `stripe.confirmPayment({ elements, confirmParams: { return_url: ${origin}/profile } })`
6. On return URL: query payment status, show success/failure toast, refresh user

### 15.5 3DS testing

Use card `4000 0027 6000 3184` (always triggers 3DS challenge). Other test cards: https://docs.stripe.com/testing

### 15.6 Idempotency

Webhook may fire multiple times. Use `stripePaymentIntent` as unique key in `payments` table — `INSERT ... ON CONFLICT DO NOTHING`.

---

## 16. PWA Configuration

### 16.1 vite-plugin-pwa setup

**File:** `apps/web/vite.config.ts`

```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chat',
        short_name: 'Chat',
        description: 'Real-time chat with audio and video calls',
        theme_color: '#5b6bf0',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'images', expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^\/api\/users/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-users', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
})
```

### 16.2 Install prompt

**Composable:** `composables/useInstallPrompt.ts`

```ts
const deferredPrompt = ref<any>(null)
const canInstall = ref(false)
const isIOS = computed(() => /iphone|ipad|ipod/i.test(navigator.userAgent))
const isStandalone = computed(() =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true
)
const isMobile = computed(() => /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent))

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt.value = e
  canInstall.value = true
})

async function promptInstall() {
  if (!deferredPrompt.value) return
  await deferredPrompt.value.prompt()
  deferredPrompt.value = null
  canInstall.value = false
  localStorage.setItem('install-dismissed', '1')
}

function dismissInstall() {
  canInstall.value = false
  localStorage.setItem('install-dismissed', '1')
}

// iOS path: show custom banner with "Tap share → Add to Home Screen" instructions
```

### 16.3 Banner logic

Show `InstallPromptBanner` when:
- `isMobile.value === true`
- `isStandalone.value === false`
- `localStorage.getItem('install-dismissed') !== '1'`
- AND either `canInstall.value === true` (Android/Chrome) OR `isIOS.value === true` (iOS Safari custom instructions)

### 16.4 Icons

Generate from a single SVG source via `pwa-asset-generator` or manually. Sizes needed: 192, 512, 512-maskable, apple-touch-icon (180).

---

## 17. Deployment

### 17.1 Netlify (web)

**File:** `netlify.toml` (repo root)

```toml
[build]
  base = "."
  command = "pnpm install --frozen-lockfile && pnpm exec nx build web --skip-nx-cache"
  publish = "dist/apps/web"

[build.environment]
  NODE_VERSION = "22"
  PNPM_VERSION = "9"

# API proxy (so cookies are first-party)
[[redirects]]
  from = "/api/*"
  to   = "https://<your-railway-domain>.up.railway.app/api/:splat"
  status = 200
  force  = true

# Socket.io proxy
[[redirects]]
  from = "/socket.io/*"
  to   = "https://<your-railway-domain>.up.railway.app/socket.io/:splat"
  status = 200
  force  = true

# SPA fallback (must be LAST)
[[redirects]]
  from = "/*"
  to   = "/index.html"
  status = 200
```

**Env vars (Netlify dashboard):**
- `VITE_STRIPE_PUBLISHABLE_KEY` (test mode)

### 17.2 Railway (api)

**Service config:**
- Build command: `pnpm install --frozen-lockfile && pnpm exec nx build api`
- Start command: `node dist/apps/api/main.js`
- Watch paths: `apps/api/**`, `libs/**`, `package.json`, `pnpm-lock.yaml`

**Volume:** Mount at `/data`, set `DATABASE_URL=file:/data/chat.db` in env

**Env vars:**
- `NODE_ENV=production`
- `DATABASE_URL=file:/data/chat.db`
- `JWT_SECRET=<32+ char random>`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `CORS_ORIGIN=https://<your-netlify-domain>.netlify.app`
- `PORT=3000` (Railway provides; Fastify should listen on `process.env.PORT`)

**Migrations:** Run on boot in `apps/api/src/main.ts`:
```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
migrate(db, { migrationsFolder: './migrations' })
```

### 17.3 CORS config

Fastify needs `@fastify/cors` configured to allow the Netlify origin AND credentials:

```ts
await app.register(cors, {
  origin: process.env.CORS_ORIGIN,
  credentials: true,
})
```

Socket.io needs its own CORS in server init:
```ts
new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN, credentials: true },
})
```

### 17.4 Stripe webhook in production

Add Railway URL to Stripe dashboard webhooks: `https://<your-railway>.up.railway.app/api/stripe-webhook`. Select event `payment_intent.succeeded`. Copy webhook secret to Railway env.

---

## 18. Build Sequence (6-day plan)

### Day 1 — Foundation
- [ ] Create Nx workspace, install plugins
- [ ] Scaffold `apps/web`, `apps/api`, `libs/shared-types`, `libs/shared-contracts`
- [ ] Configure module boundaries in eslint
- [ ] Set up Fastify with @fastify/cors, @fastify/cookie, @fastify/jwt
- [ ] Drizzle schema + migration runner + SQLite client
- [ ] Auth endpoints (register, login, refresh, logout, me)
- [ ] Vue + Tailwind 4 theme + base layout shell

### Day 2 — Auth + chat backbone
- [ ] Auth store + axios client + refresh interceptor
- [ ] AuthView (login + register forms)
- [ ] Route guards + bootstrap on app start
- [ ] Socket.io server with JWT handshake middleware
- [ ] Online tracking + user:online / user:offline broadcasts
- [ ] `useBreakpoint` composable + AppLayout responsive shell (mobile tabs + desktop sidebar)
- [ ] `GET /api/conversations` endpoint + chat store conversation actions
- [ ] ChatsView with `ConversationRow` + `OnlineNowStrip`
- [ ] CommunityView (user list + online dots) at `/community`
- [ ] Basic ChatView (history + send via socket) — both mobile and desktop split-pane

### Day 3 — Chat polish + Profile + PWA + i18n
- [ ] Optimistic message UI + read receipts
- [ ] Conversation row real-time updates (move to top on new message, unread badge)
- [ ] Typing indicators with debounce
- [ ] ProfileView (edit + avatar upload + locale switch)
- [ ] vite-plugin-pwa configured
- [ ] vue-i18n with EN/TR/ET
- [ ] Install prompt banner (Android + iOS paths)

### Day 4 — WebRTC foundation
- [ ] useWebRTC composable
- [ ] Signaling event handlers (server pass-through)
- [ ] CallModal component (all states)
- [ ] Audio call working end-to-end
- [ ] Test TURN fallback with forceRelay=1

### Day 5 — WebRTC video + Stripe
- [ ] Video call working with proper cleanup
- [ ] Mute / camera toggle controls
- [ ] iOS Safari compatibility check (playsinline, autoplay)
- [ ] Stripe Payment Element integration
- [ ] Webhook handler + isPro flag
- [ ] UpgradeView + Pro badge on profile

### Day 6 — Deploy + report + polish
- [ ] Deploy api to Railway with volume
- [ ] Deploy web to Netlify with rewrites
- [ ] End-to-end test on staging URLs
- [ ] Write report (1-2 pages)
- [ ] README with screenshots, setup, architecture
- [ ] Final design polish on all empty/loading/error states

### Hard-cut order if behind schedule
1. Drop Stripe entirely (least relevant to chat narrative)
2. Drop Estonian translation (keep EN + TR)
3. Drop video call, keep audio only
4. Drop typing indicators
5. Drop read receipts

PWA stays — it's cheap and high-signal.

---

## 19. Acceptance Criteria

### 19.1 Core (must pass)

- [ ] User can register with email + password + display name → logged in immediately
- [ ] User can log in with email + password → redirected to Chats (`/`)
- [ ] User can log out → cookie cleared, redirected to /auth
- [ ] Chats view shows all conversations sorted by latest message
- [ ] Chats view shows "Online now" strip when at least one user is online
- [ ] Conversation row moves to top + unread badge updates when new message arrives
- [ ] Community view shows all other users with correct online status
- [ ] Online status updates in real-time when other users log in / out
- [ ] User can start a chat with any other user (from Chats row or Community row)
- [ ] Message sent appears immediately on sender side (optimistic)
- [ ] Message arrives in real-time on recipient side
- [ ] Message history persists across reloads
- [ ] User can edit profile (name, bio, avatar, locale) → changes persist
- [ ] App is responsive from 360px → 1440px viewport widths
- [ ] Mobile (< 768px): bottom tab bar visible on Chats / Community / Profile, hidden on `/chat/:userId`
- [ ] Desktop (≥ 768px): persistent sidebar with conversation list visible on all authenticated routes
- [ ] Desktop: selected conversation is highlighted in sidebar when on `/chat/:userId`
- [ ] Desktop: visiting `/` shows empty state in right pane ("Select a conversation")
- [ ] All forms validate client-side with helpful errors
- [ ] No console errors in production build
- [ ] Live demo URL works
- [ ] GitHub repo is public with README

### 19.2 Bonuses

- [ ] Audio call works between two browsers
- [ ] Video call works between two browsers
- [ ] Call works through TURN when forced relay
- [ ] Camera/mic released after call ends
- [ ] App is installable on Android Chrome (beforeinstallprompt)
- [ ] App is installable on iOS Safari (instructional banner)
- [ ] App works offline as shell after first load
- [ ] UI fully translates between EN / TR / ET
- [ ] Locale persists across sessions
- [ ] Stripe test payment succeeds with normal card
- [ ] Stripe test payment triggers 3DS challenge with 3DS-required card
- [ ] Webhook updates user.isPro on success

### 19.3 Quality bars

- [ ] No bare `any` types in shipped code
- [ ] No unhandled promise rejections
- [ ] All async operations have loading / error states in UI
- [ ] `nx graph` shows clean dependency layering
- [ ] `nx lint` passes with no warnings
- [ ] Bundle size < 400KB gzipped (main chunk)
- [ ] Lighthouse PWA score > 90
- [ ] Lighthouse Accessibility score > 90

---

## 20. Written Report Outline

Length: 1-2 pages. Save as `REPORT.md` at repo root.

Suggested sections:

1. **Summary** (1 paragraph) — what was built, deployed where
2. **Architecture overview** (1-2 paragraphs + diagram) — monorepo layout, contract sharing, deployment topology
3. **Key decisions** (bullet list with rationale)
   - Why Fastify over Express
   - Why SQLite over Postgres (for this scope)
   - Why Pinia setup stores over options stores
   - Why JWT in memory + refresh cookie (security trade-offs discussed)
   - Why Open Relay TURN (vs self-hosted coturn)
   - Why Netlify rewrites for cookie scope
4. **What I'd do with another week**
   - End-to-end tests with Playwright
   - Postgres + connection pooling
   - Push notifications (web push API)
   - File / image attachments
   - Message search (FTS5)
   - Self-hosted coturn for production-grade TURN
   - Real avatar storage (S3 or R2)
5. **Known limitations**
   - Single-instance assumption for online tracking (would need Redis pub/sub for multi-instance)
   - SQLite write contention under concurrent load
   - Estonian translation is machine-assisted

---

## 21. README Requirements

Save as `README.md` at repo root.

Sections:
1. Title + 1-line description
2. Live demo + repo URLs
3. Screenshots (auth, community, chat, call, profile) — 5 images, can be Loom-style mock
4. Features (required + bonuses)
5. Tech stack table
6. Architecture (1 diagram, nx graph screenshot)
7. Local development (pnpm install, env setup, dev commands)
8. Deployment (1 paragraph each for Netlify + Railway)
9. Project structure (truncated tree)
10. Decisions reference → link to REPORT.md

---

## 22. Environment Variables

### 22.1 `apps/web` (build-time, prefixed with VITE_)

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

### 22.2 `apps/api` (runtime)

```
NODE_ENV=development|production
PORT=3000
DATABASE_URL=file:./chat.db                  # dev: relative; prod: /data/chat.db
JWT_SECRET=<min 32 chars>
CORS_ORIGIN=http://localhost:4200            # dev
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Commit `.env.example` with placeholder values; never commit real `.env`.

---

## 23. Testing Strategy (Light)

Time budget for testing is minimal. Priorities:

1. **Critical-path manual test script** (in REPORT.md): step-by-step "register → login → send message → receive on second tab → start call → end call" — must pass before submission
2. **Vitest unit tests** for:
   - Zod schemas (`shared-contracts`)
   - Auth service password hashing + verification
   - JWT signing + verification
3. **Playwright** (optional, only if time): one happy-path E2E covering register + send message between two contexts

Skip extensive unit testing of UI components. Focus on contracts and auth, where mistakes silently cause runtime bugs.

---

## 24. Implementation Notes for Claude Code

When implementing this PRD section by section:

1. **Start with shared libs.** `shared-types` and `shared-contracts` are referenced everywhere. Implement them before either app.
2. **Backend before frontend per feature.** Get the API endpoint + Socket event working with curl/wscat before wiring UI.
3. **Drizzle migrations:** generate via `pnpm --filter=api drizzle-kit generate`, commit them, run on boot.
4. **Always use the path aliases** (`@chat/shared-types`, `@chat/shared-contracts`) — never relative `../../../libs/...` imports across project boundaries.
5. **Setup-store style for Pinia.** Always `defineStore('name', () => { ... })` with `ref`/`computed`, never `state/getters/actions` options object.
6. **`<script setup lang="ts">` for every Vue component.** Never Options API.
7. **`storeToRefs` when destructuring** state from a Pinia store, otherwise reactivity breaks.
8. **No `any` in shipped code.** If a type is unknown, use `unknown` and narrow.
9. **Tailwind for layout, component classes for repeated patterns.** Don't write a 40-class string when `btn-primary` exists.
10. **Mobile first.** Default styles target mobile; use `md:` / `lg:` to expand. Test at 375px width regularly.
11. **No bare `try/catch` that swallows errors.** Either handle it (toast, retry) or rethrow.
12. **Optimistic UI for sends only.** Reads (history fetch) should show loading states.
13. **Reuse `ConversationRow` across viewports.** The same component renders in `ChatsView` body (mobile) and `Sidebar` (desktop). Don't fork it. Pass density as a prop if you need slightly different spacing.
14. **Build the responsive shell early (Day 2).** Once `AppLayout` correctly switches between mobile stack and desktop split-pane, every subsequent screen inherits the layout for free. Retrofitting responsive behavior at the end is painful.
15. **Test at 375px (mobile) and 1280px (desktop) regularly.** The two-pane desktop layout only becomes apparent at `md+` (768px+). Don't ship without confirming both work.
16. **Conversation real-time updates:** when `message:new` arrives, the `chat` store must (a) append to `messagesByUser[partnerId]`, (b) update or insert the matching `Conversation` entry, (c) move that conversation to position 0 in the sorted list. All three in one action to keep state consistent.

---

**End of PRD.**
