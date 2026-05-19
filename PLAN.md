# Real-Time Chat — Phased Development Plan

## Context

The repository contains a `PRD.md` (v1.2). This plan turns that PRD into an
ordered build sequence organized by **dependency**. Each
phase produces a verifiable, runnable artifact before the next begins.

Two principles shape the ordering:

1. **Critical path first.** Foundation → Backend Auth → Frontend Shell →
   Real-Time → Messaging → Conversations. Skipping any of these blocks
   everything downstream.
2. **Build the responsive shell early** (PRD §24 note 14). The mobile/desktop
   split-pane shell ships before any feature view, so every screen inherits
   responsive behavior for free.

Hard-cut priority if scope must shrink (per PRD §18): Stripe → Estonian → Video
→ Typing → Read receipts. The phase ordering supports cutting from the bottom
without unwinding prior work. PWA stays — cheap and high-signal.

Cross-cutting discipline applies in every phase: no bare `any`, no swallowed
promise rejections, every async surface has loading + empty + error states,
`<script setup lang="ts">` for every component, Pinia setup-stores only, path
aliases (`@chat/shared-types`, `@chat/shared-contracts`) — never deep relative
imports.

**Tooling note — Ultracite as the linter.** All linting and formatting goes
through [Ultracite](https://www.ultracite.ai/) (Vercel's strict, zero-config
Biome preset). One config (`biome.jsonc` extending `ultracite`) replaces the
ESLint + Prettier pair the PRD originally implied. The PRD's reference to
`@nx/enforce-module-boundaries` is an ESLint-only rule with no Biome
equivalent; we replicate its intent with Biome's `style/noRestrictedImports`
(path-pattern allowlist per project) plus an Nx CI check
(`nx affected --target=lint && nx graph --validate`) that fails on
circular or scope-crossing edges. Where this plan still says "lint", read it
as `ultracite check` (or `nx run-many --target=lint` which delegates to it).

---

## Phase 1 — Foundation

**Goal:** Empty repo → working Nx workspace with module boundaries enforced,
shared libs compiling, Ultracite lint + format green.

**Deliverables**
- `pnpm-workspace.yaml`, `nx.json`, `package.json`, `tsconfig.base.json` with
  `@chat/shared-types` and `@chat/shared-contracts` path aliases
- `apps/web` (Vue 3.5 + Vite 7) and `apps/api` (Node 22 + Fastify 5) scaffolds
  via `@nx/vue` and `@nx/node`
- `libs/shared-types` — `User`, `PublicUser`, `Locale`, `Message`,
  `Conversation`, `CallType`/`CallState`/`CallEndReason`,
  `CLIENT_EVENTS`/`SERVER_EVENTS` + payload types (PRD §5)
- `libs/shared-contracts` — Zod schemas for `loginInput`, `registerInput`,
  `updateProfileInput` (with the 150,000-char data-URL ceiling),
  `sendMessageInput`, `createPaymentIntentInput` (PRD §6)
- **Ultracite setup:** run `pnpm dlx ultracite init` at repo root → generates
  `biome.jsonc` extending `ultracite`; add `"editor.defaultFormatter":
  "biomejs.biome"` + format-on-save to `.vscode/settings.json`. Install dev
  deps `ultracite`, `@biomejs/biome`. Add root `package.json` scripts:
  `"lint": "ultracite check"`, `"format": "ultracite fix"`. Wire each
  project's `project.json` `lint` target to `nx:run-commands` invoking
  `ultracite check {projectRoot}` so `nx affected --target=lint` works.
- **Module-boundary enforcement** (replaces the ESLint-only
  `@nx/enforce-module-boundaries` from PRD §3.2):
  - Nx tags on each project: `scope:web`, `scope:api`, `scope:shared`,
    `type:types`, `type:contracts` (still useful for `nx graph` filtering)
  - Per-project `biome.jsonc` `overrides` blocks with
    `style/noRestrictedImports` rules — apps may only import from
    `@chat/shared-*`; `type:contracts` may import from `type:types`;
    `type:types` may import from itself only. Pattern-match on import
    specifier strings, not tags (Biome can't read Nx tags).
  - CI guard: `nx graph --file=graph.json` parsed by a small node script in
    `tools/check-boundaries.mjs` that asserts no `apps/web ↔ apps/api` edges
    and no shared-lib → app edges. Runs in the CI lint step.
- `.nvmrc` → `22`, `.env.example`, `.gitignore`, placeholder `README.md`

**Exit criteria**
- `pnpm install` and `pnpm exec nx graph` succeed; the graph shows
  web → shared-{types,contracts}, api → shared-{types,contracts}, no
  app↔app edges
- `pnpm exec ultracite check` and `pnpm exec ultracite check` pass
  at repo root with zero findings
- `pnpm exec nx run-many --target=lint` passes for `shared-types`,
  `shared-contracts`, `web`, `api`
- `node tools/check-boundaries.mjs` exits 0
- A deliberate boundary violation (e.g. importing `@chat/shared-contracts`
  inside `shared-types`, or relative `../../apps/api/...` inside `apps/web`)
  fails either Ultracite's `noRestrictedImports` or the boundary script
- A trivial `import { loginInput } from '@chat/shared-contracts'` compiles in
  both `apps/web` and `apps/api`

---

## Phase 2 — Backend Core (DB + Auth)

**Goal:** API server runs locally; auth endpoints are usable from curl;
refresh-token rotation works.

**Deliverables**
- `apps/api/src/app/server.ts` — Fastify bootstrap with `@fastify/cors`,
  `@fastify/cookie`, raw-body support for Stripe (registered later but
  configured now)
- `db/schema.ts` — exactly the Drizzle schema from PRD §4 (`users`,
  `messages`, `refresh_tokens`, `payments`)
- `db/client.ts` — better-sqlite3 + Drizzle instance keyed off `DATABASE_URL`
- `db/migrate.ts` — generated migrations applied on boot via
  `drizzle-orm/better-sqlite3/migrator`
- `lib/password.ts` — bcrypt cost 12 hash + compare
- `lib/jwt.ts` — `jose` HS256 sign/verify, 15-min TTL, payload
  `{ sub, email, iat, exp }`
- `lib/errors.ts` — standard error envelope from PRD §7.6
- `services/auth.ts` — register, login, refresh (rotate + revoke old), logout,
  me; refresh tokens stored as SHA-256 hashes with `jti` = primary key
- `routes/auth.ts` — `POST /register`, `POST /login`, `POST /refresh`,
  `POST /logout`, `GET /me`; cookie config from PRD §9.2 (path `/api/auth`,
  `SameSite=Lax`, secure in prod)

**Exit criteria**
- `curl POST /api/auth/register` returns `{ user, accessToken }` and sets a
  refresh cookie; row appears in `users` and `refresh_tokens`
- `curl POST /api/auth/login` with wrong password → 401 with the standard
  error shape
- `curl POST /api/auth/refresh` with the cookie returns a fresh access token
  and **rotates** the refresh cookie (old `jti` marked `revoked_at`)
- `curl POST /api/auth/logout` clears the cookie and revokes the token; a
  subsequent refresh fails

---

## Phase 3 — Frontend Shell (Responsive + Theme + Auth Plumbing)

**Goal:** Vue app boots, renders the responsive AppLayout/AuthLayout, has the
auth store + axios refresh interceptor wired, has the i18n runtime in place
(English only for now), and has the base UI primitives. No feature views yet
— just an authenticated shell.

**Deliverables**
- `styles/theme.css` — Tailwind 4 `@theme` block from PRD §12.1 (OKLCH brand
  ramp 50–900, semantic colors, typography, radii, shadows) + `@layer
  components` for `.btn-*`, `.input`, `.card`
- `vue-i18n` initialized with `legacy: false`, `locale: 'en'`, datetime
  formats; an `en.json` seeded with the keys used by the shell + AuthView (TR
  and ET come later)
- `composables/useBreakpoint.ts` — wraps `@vueuse/core`'s `useMediaQuery` for
  `md` (768px) and `lg` (1024px); returns `isMd`, `isLg`, `isMobile`
- `layouts/AuthLayout.vue` (centered card, full `dvh`) and
  `layouts/AppLayout.vue` (mobile: TopBar + router-view + BottomTabBar;
  desktop: TopBar + Sidebar/NavRail + router-view) — exactly the matrix in
  PRD §11.1
- `components/layout/`: `TopBar.vue`, `BottomTabBar.vue`, `Sidebar.vue` (empty
  shell), `NavRail.vue`
- `components/ui/`: `BaseButton.vue`, `BaseInput.vue`, `FormField.vue`,
  `Alert.vue`, `LoadingState.vue`, `EmptyState.vue`, `ErrorState.vue`,
  `UserAvatar.vue` (data-URL-or-deterministic-initials fallback per PRD §11.9;
  upload pipeline arrives in Phase 10)
- `stores/auth.ts` (setup-store) — `user`, `accessToken`, `isBootstrapping`,
  `isAuthenticated`, plus stubs for `bootstrap/login/register/logout/refresh`
- `stores/ui.ts` — `locale`, `toasts`, `installPromptVisible`
- `api/client.ts` — axios with `baseURL: '/api'`, `withCredentials: true`,
  request interceptor that attaches the bearer token, response interceptor
  with **single-flight** refresh on 401 (PRD §10.4)
- `router/index.ts` — routes from PRD §10.1 with `meta.layout` and
  `meta.requiresAuth`/`requiresGuest`; global `beforeEach` awaits
  `authStore.bootstrap()` then enforces guards; placeholder lazy components
  for the views

**Exit criteria**
- Visiting `/` while unauthenticated redirects to `/auth`
- Manually setting `authStore.user` in devtools shows AppLayout; viewport
  resize across the 768px breakpoint live-swaps between mobile stack and
  desktop split-pane without remount of the router-view content
- Axios interceptor under devtools logs a single refresh call when an
  expired-token request races (no thundering herd)
- Lighthouse run on the empty shell reports zero a11y errors and zero console
  errors

---

## Phase 4 — Auth UX (End-to-End)

**Goal:** A new visitor can register, log in, log out — full circuit.

**Deliverables**
- `pages/AuthView.vue` — local toggle between Login and Register modes; uses
  VeeValidate + `@vee-validate/zod` with `loginInput`/`registerInput` from
  `@chat/shared-contracts`; inline field errors + a top-level `Alert` for
  server errors; submit spinner
- `stores/auth.ts` actions filled in: `bootstrap` → `POST /auth/refresh` then
  `GET /auth/me` on success; `login`/`register` set state and route to `/`;
  `logout` clears state and routes to `/auth`
- Translations for auth keys in `en.json` (`auth.title`, `auth.login.email`,
  `auth.errors.invalidCredentials`, etc.)

**Exit criteria**
- Register → land on `/` → reload → still authenticated (refresh cookie
  survives)
- Wrong password → server error rendered in the Alert; client validation
  catches empty/short inputs before submit
- Logout from devtools call → cookie cleared, redirected to `/auth`,
  hard-reload stays on `/auth`

---

## Phase 5 — Real-Time Backbone (Socket.io + Online Presence)

**Goal:** Authenticated client connects to socket; presence broadcasts
correctly across multiple tabs.

**Deliverables**
- `apps/api/src/app/plugins/socket.ts` — Socket.io 4.8 attached to the
  Fastify HTTP server; CORS allowing `process.env.CORS_ORIGIN` with
  credentials
- Socket auth middleware: reads `auth.token`, verifies via `lib/jwt.ts`,
  attaches `socket.data.userId`; rejects with `Error('unauthorized')` on bad
  token (PRD §8.1)
- In-memory presence: `Map<userId, Set<socketId>>`. On connect: join room
  `user:<userId>`, add to map; if first socket for user, broadcast
  `user:online`. On disconnect: remove; if last socket, broadcast
  `user:offline` and persist `users.lastSeenAt`
- `GET /api/users` → returns `PublicUser[]` (everyone except self) with
  `isOnline` derived from the in-memory map
- `composables/useSocket.ts` — singleton `socket.io-client`; watches
  `authStore.accessToken` and reconnects on change; clean disconnect on
  logout
- `stores/users.ts` — `users[]`, `byId`, `onlineUsers`/`offlineUsers`
  getters; `setOnline`/`setOffline`/`updateLastSeen` actions wired to
  `user:online`/`user:offline` socket events

**Exit criteria**
- Two browser profiles logged in as different users → each sees the other in
  `users` store with `isOnline: true`; closing one tab flips the other to
  offline within one tick
- Opening a second tab for the same user does **not** double-broadcast
  online; closing one of two tabs does **not** flip them offline (last-socket
  semantics)
- Killing the api process and reconnecting client reconnects automatically
  once api is back

---

## Phase 6 — Discovery (CommunityView)

**Goal:** Authenticated user can browse other users and tap to start a chat.

**Deliverables**
- `pages/CommunityView.vue` — search input (client-side filter by
  displayName), "Online now" section, "All users" section, sorted online
  first then by `lastSeenAt` desc
- User row: `UserAvatar` with online dot overlay, displayName, bio
  truncation, "last seen X ago" via `Intl.RelativeTimeFormat`
- Tap row → `router.push({ name: 'chat', params: { userId } })`
- Empty state: "You're the only one here. Invite someone!"

**Exit criteria**
- `/community` renders all users except self; online dots flip in real time
  when other users log in/out (verified with two browser profiles)
- Route navigation to `/chat/:userId` occurs on row tap (ChatView is empty in
  this phase — that's fine)

---

## Phase 7 — Messaging Core

**Goal:** Two users can exchange messages in real time with optimistic UI;
history persists across reload.

**Deliverables**
- `services/messages.ts` + `routes/messages.ts`:
  - `GET /api/messages/:otherUserId?before=<ts>&limit=50` — DESC order,
    paginated; uses the `messages_conversation_idx` from schema
  - `POST /api/messages/:otherUserId/read` — sets `read_at` on all unread
    messages from `otherUserId` to self
- Socket handlers (`app/sockets/`):
  - `message:send` (C→S): validate with `sendMessageInput`, persist with a
    fresh server `id` and `createdAt`, emit `message:new` to recipient room +
    sender, emit `message:delivered` to sender with `{ clientId, id,
    createdAt }`
- `stores/chat.ts` — `messagesByUser: Map<string, Message[]>`,
  `addMessage(msg)`, optimistic-send with `clientId` reconciliation on
  `message:delivered`, `fetchHistory(otherUserId)`
- `pages/ChatView.vue` — `TopBar` (back arrow + partner avatar + name +
  online status + call buttons stubs), `MessageList`, `ComposeBar`
- `components/chat/`: `MessageBubble.vue` (own = right + brand bg, theirs =
  left + neutral bg; timestamp on hover/long-press), `MessageList.vue`
  (scroll-to-bottom on new message if near bottom), `ComposeBar.vue` (Enter
  to send, send button)
- Mobile: BottomTabBar hidden on `/chat/:userId`; back arrow returns to
  previously active tab. Desktop: chat fills right pane, sidebar selection
  highlighted.

**Exit criteria**
- User A sends → message appears immediately in A's UI (optimistic) and
  within one tick on B's UI
- A reloads → history fetch returns the messages in correct order
- Send from offline B → A receives nothing (B can't send while disconnected
  is fine for v1); when B comes online and sends, A receives
- No console errors; no duplicate messages on the sender side after
  reconciliation

---

## Phase 8 — Conversations / Recents (ChatsView)

**Goal:** `/` shows the user's recent conversations with live updates; this
is the home of the app.

**Deliverables**
- `GET /api/conversations` — derived query: distinct partners ∪ latest
  message ∪ unread count for current user, ordered by
  `lastMessage.createdAt` DESC (PRD §7.3 — either one CTE/window-function
  SQLite query or two batched queries)
- `stores/chat.ts` extension: `conversations: Conversation[]`,
  `fetchConversations()`, plus the invariant from PRD §24 note 16:
  `addMessage` also updates/inserts the matching `Conversation` and moves
  it to position 0; `markRead(otherUserId)` zeroes the matching
  `unreadCount`
- `pages/ChatsView.vue` — search input, `OnlineNowStrip` (horizontal scroll,
  online users only, max 10, hidden when none), conversation rows with
  `UserAvatar` + online dot + last-message preview (prefix "You: " when
  sender is self) + relative timestamp + unread badge; mobile pull-to-
  refresh
- `components/chat/ConversationRow.vue` — same component used in mobile
  ChatsView body **and** in desktop `Sidebar`; density prop if needed
- `components/chat/OnlineNowStrip.vue`
- Desktop: at `/`, right pane shows `EmptyState` ("Select a conversation to
  start messaging")
- BottomTabBar Chats tab unread dot driven by `totalUnread` getter

**Exit criteria**
- Two users exchange messages → conversation appears in `/` for both,
  ordered correctly, with accurate previews
- New message arrives while on `/` → that row moves to the top in one
  animation, unread badge increments
- Tap row → `/chat/:userId` opens; on return, badge has cleared
- Desktop sidebar shows the exact same rows; selected conversation is
  highlighted

---

## Phase 9 — Messaging Polish (Read Receipts + Typing + Pagination)

**Goal:** Chat feels real — typing dots, read state, scroll-back history.

**Deliverables**
- Socket events both directions: `message:read` (C→S with `otherUserId`;
  S→C with `{ readerId, readAt }` back to the original sender),
  `typing:start`/`typing:stop` with the sender debounced 3s after last
  keystroke (PRD §11.5)
- `chat` store: `typingByUser: Map<string, boolean>`, `setTyping`,
  unread-zeroing on inbound read receipt
- Read-state UI on own bubbles: ✓ (sent), ✓✓ (read); same indicators in
  ConversationRow preview for own last messages
- Typing indicator strip above ComposeBar
- ChatView infinite scroll: load 50 older messages on reaching top, hard cap
  at 200-message buffer with "Load more" button beyond that
- Date separators between days in MessageList
- Mark-read on mount and whenever a new message arrives while the user is
  on this conversation

**Exit criteria**
- A sends; B's bubble shows ✓; B opens chat → A's bubble flips to ✓✓
- Typing in A's composer surfaces "Alice is typing…" on B within 3s of
  pause it disappears
- Scrolling up past 50 messages loads the next page without losing scroll
  position

---

## Phase 10 — Profile + Avatar Upload

**Goal:** Edit-self loop is complete with full avatar pipeline.

**Deliverables**
- `PATCH /api/users/me` — validates with `updateProfileInput`; on
  `avatarUrl`, the Zod union (https URL | `data:image/jpeg;base64,…` ≤
  150,000 chars | `null`) is the only server-side check (no decoding)
- `composables/useAvatarUpload.ts` — exactly PRD §11.9 pipeline:
  pre-decode 10 MB guard, MIME allow-list, Image+ObjectURL decode,
  256×256 center-crop via canvas, JPEG q=0.85, post-encode 100 KB guard;
  returns `{ dataUrl }` or `{ error: <i18n key> }`
- `pages/ProfileView.vue` — avatar (click → hidden file input;
  optimistic preview into local `draft`, not auto-saved), displayName, bio
  textarea, locale switcher, "Upgrade to Pro" CTA (visible only when
  `!user.isPro`), logout with confirm dialog; Save button submits the whole
  draft as one PATCH
- `UserAvatar.vue` already exists from Phase 3; verify the deterministic
  hue-from-userId initials path is correct
- i18n keys for `avatar.uploadLabel` + the four `avatar.errors.*` (PRD
  §11.9)

**Exit criteria**
- Upload a 5 MB JPEG → preview shows a 256×256 crop; Save persists; reload
  shows the new avatar everywhere `UserAvatar` is used
- Upload a 12 MB file → toast "Image is too large (max 10MB)", no decode
  attempted
- Upload a `.bmp` → toast "Please use JPEG, PNG, or WebP"
- Clearing avatar (UI affordance: set null) round-trips correctly and
  initials placeholder returns
- Locale switch persists to server and survives reload

---

## Phase 11 — i18n Translation Pass (TR + ET)

**Goal:** Every visible string flips correctly across all three locales.

**Deliverables**
- `locales/tr.json` — hand-written Turkish for every key
- `locales/et.json` — DeepL-drafted Estonian, with a README note flagging
  best-effort quality
- Locale switcher in `ProfileView` flips immediately + persists to
  localStorage + PATCHes server; server-stored locale wins on next bootstrap
- Datetime formats from PRD §14.1 applied for all three locales
- Audit pass: no hardcoded English strings anywhere — use `t('…')` for
  everything user-visible

**Exit criteria**
- Switch to TR → every visible string in every screen changes; relative
  times ("2m ago", "yesterday") format correctly in TR locale
- Switch to ET → same
- Reload → locale persists; clearing localStorage but staying logged in →
  server-stored locale wins

---

## Phase 12 — PWA (Installable + Offline Shell)

**Goal:** Lighthouse PWA score > 90; Android install prompt + iOS
instructional banner.

**Deliverables**
- `vite-plugin-pwa` config from PRD §16.1 — autoUpdate, manifest (name
  "Chat", brand color `#5b6bf0`, standalone portrait), workbox runtime
  caches for images + `/api/users`
- Icons at 192, 512, 512-maskable, apple-touch-icon-180 (generate from one
  SVG)
- `composables/useInstallPrompt.ts` — captures `beforeinstallprompt`, iOS
  detection, standalone detection, mobile detection, `localStorage`
  dismissal flag
- `components/InstallPromptBanner.vue` — Android: shows when `canInstall`;
  iOS: shows on iOS Safari mobile (non-standalone) with
  "Tap share → Add to Home Screen" copy; both honor dismissal flag

**Exit criteria**
- Production build serves a valid manifest; Lighthouse PWA audit > 90
- Visiting on Android Chrome → install banner appears; install completes;
  reopening the installed app loads the shell offline
- Visiting on iOS Safari → custom banner with instructions; dismissal
  persists

---

## Phase 13 — WebRTC Audio Calls

**Goal:** Two browsers can hold an audio call end-to-end with TURN fallback.

**Deliverables**
- Server signaling (PRD §8.3): `call:initiate` →
  `call:incoming`/`CALLEE_OFFLINE` error; `call:accept` → `call:accepted`;
  `call:reject` → `call:rejected`; `call:offer`/`call:answer`/`call:ice` are
  relayed verbatim to the target `user:<id>` room; `call:end` → `call:ended`
- `composables/useWebRTC.ts` — single `RTCPeerConnection`, ICE servers from
  PRD §13.1 (Open Relay TURN on 80 + 443/tcp), `getUserMedia({ audio:
  true })`, `ontrack`/`onicecandidate`/`oniceconnectionstatechange` wired
- `stores/call.ts` — `state`, `remoteUserId`, `callType`, `isOutgoing`,
  `isMuted`, `localStream`, `remoteStream`
- `components/call/CallModal.vue` — full-screen overlay with one branch per
  `CallState`: calling, ringing, connecting, connected (audio: just avatars
  + waveform/dots), ended → toast → dismiss
- `components/call/CallControls.vue` — mute, end-call (video toggle disabled
  for audio calls)
- Dev URL param `?forceRelay=1` → `iceTransportPolicy: 'relay'` for TURN
  testing
- **Cleanup contract:** on any terminal state, stop all local tracks, close
  `pc`, emit `call:end`, reset reactive state — every exit path goes through
  one function

**Exit criteria**
- User A initiates audio to User B → B sees ringing modal → accepts → audio
  flows both ways
- Reject from B → A sees "rejected" state then idle
- Offline callee → A gets `CALLEE_OFFLINE` error toast
- `?forceRelay=1` on both peers → call still completes (TURN works)
- After hang-up, both browsers show no active mic indicator; reopening the
  modal works on the next call

---

## Phase 14 — WebRTC Video + Perfect Negotiation + iOS Hardening

**Goal:** Video call works on Chrome + Safari + iOS Safari with bulletproof
cleanup.

**Deliverables**
- Video tracks added when `callType === 'video'`; `getUserMedia({ audio:
  true, video: true })`
- `components/call/VideoTile.vue` — `<video autoplay playsinline muted>` for
  remote (then unmuted on user gesture if iOS demands), mirrored local
  preview tile
- Camera toggle control; toggling stops/restarts the video track without
  re-negotiating the PC
- Perfect negotiation per PRD §13.5: callee is polite, caller is impolite;
  handle `negotiationneeded` and rollback per W3C example
- iOS Safari pass: `playsinline` everywhere, stop existing tracks before
  any second `getUserMedia` call, HTTPS-only verified in dev via
  Netlify-style serving

**Exit criteria**
- Chrome ↔ Chrome video call works
- Chrome ↔ iOS Safari video call works; remote audio resumes on first user
  gesture if Safari blocked autoplay-with-audio
- Camera toggle off → remote sees black/avatar fallback; toggle back on →
  video resumes without dropping the call
- After hang-up, **camera light is off** on both peers (the demo-killer
  test)

---

## Phase 15 — Stripe Pro Upgrade

**Goal:** Test payment with 3DS works; `isPro` flips on success and survives
duplicate webhooks.

**Deliverables**
- `apps/api/src/app/plugins/stripe.ts` — initializes Stripe client from
  `STRIPE_SECRET_KEY`
- `POST /api/payments/create-intent` — creates `PaymentIntent` (amount=499,
  currency=eur, `automatic_payment_methods.enabled`, metadata `{ userId,
  product: 'pro_monthly' }`); returns `{ clientSecret, paymentIntentId }`
- `POST /api/stripe-webhook` — raw body, signature verified via
  `STRIPE_WEBHOOK_SECRET`; on `payment_intent.succeeded`, upsert into
  `payments` keyed by `stripePaymentIntent` (`INSERT … ON CONFLICT DO
  NOTHING`) and set `users.isPro = true`
- `pages/UpgradeView.vue` — fetches client secret, mounts Stripe Payment
  Element, `confirmPayment` with `return_url: ${origin}/profile`; on
  return, queries status, toasts result, refreshes `auth/me`
- Profile "Pro ✓" badge gated on `user.isPro`
- Local dev: documented `stripe listen --forward-to
  localhost:3000/api/stripe-webhook` flow

**Exit criteria**
- Test card `4242 4242 4242 4242` → payment succeeds; `users.isPro` flips
  true; Profile shows badge
- Test card `4000 0027 6000 3184` → 3DS challenge appears in iframe; on
  completion the same success path runs
- Replaying the webhook event by hand → no duplicate `payments` row, no
  state churn

---

## Phase 16 — Deployment

**Goal:** Two public URLs that talk to each other; smoke test passes
end-to-end.

**Deliverables**
- **Railway (api):** service with volume mounted at `/data`, env vars
  (`NODE_ENV=production`, `DATABASE_URL=file:/data/chat.db`, `JWT_SECRET`,
  `CORS_ORIGIN`, `STRIPE_*`); build `pnpm exec nx build api`; start `node
  dist/apps/api/main.js`; migrations run on boot
- **Netlify (web):** `netlify.toml` from PRD §17.1 with `/api/*` and
  `/socket.io/*` rewrites pointing at the Railway domain, SPA fallback
  last; env var `VITE_STRIPE_PUBLISHABLE_KEY`
- CORS allowlist on api set to the Netlify domain; Socket.io CORS likewise
- Stripe webhook endpoint registered in Stripe dashboard against the
  Railway URL; production webhook secret in Railway env
- Refresh-cookie behavior verified first-party (Lax suffices because of
  rewrites)

**Exit criteria**
- Open Netlify URL in two different browser profiles → register, log in,
  send messages, see online dots flip, hold an audio call, hold a video
  call, complete a test payment
- Hard-refresh → still authenticated (refresh cookie roundtrip works
  cross-origin via rewrites)
- Railway logs show no errors during the smoke test

---

## Phase 17 — Hardening, Quality Bars, and Tests

**Goal:** Hit every quality bar in PRD §19.3.

**Deliverables**
- Sweep every async surface for the loading + empty + error trio using
  `LoadingState`/`EmptyState`/`ErrorState`; no raw "Loading…"
- `pnpm exec ultracite check` (and `nx run-many --target=lint`, which delegates
  to it) clean across the whole repo — zero findings, zero warnings
- `pnpm exec ultracite check` clean (no unformatted files)
- `node tools/check-boundaries.mjs` still passes — no module-boundary drift
  has crept in over the build
- `tsc --noEmit` clean; grep for `: any` and `as any` → zero hits in
  shipped code (test utilities excepted)
- Bundle analysis: main chunk < 400 KB gzipped; lazy-load heavy bits
  (Stripe, WebRTC modal) via dynamic import where possible
- Lighthouse mobile run on the deployed Netlify URL: PWA > 90, A11y > 90;
  fix offenders
- Vitest:
  - All Zod schemas in `shared-contracts` (happy + reject cases)
  - `lib/password.ts` hash + verify roundtrip + wrong-password rejection
  - `lib/jwt.ts` sign + verify + expiry + tamper rejection
- Optional Playwright: one happy-path E2E covering register + send message
  between two browser contexts — only if time
- Manual critical-path script written down (used in Phase 18 report)

**Exit criteria**
- All checkboxes in PRD §19.1 (Core) and §19.3 (Quality bars) tick
- `pnpm exec nx test shared-contracts api` runs green
- Production build has zero console errors and zero unhandled rejections
  across a 5-minute smoke session

---

## Phase 18 — Documentation

**Goal:** A reviewer can clone the repo, read in 15 minutes, and reach the
live demo.

**Deliverables**
- `REPORT.md` (1–2 pages) per PRD §20: summary, architecture overview +
  small diagram, key decisions (Fastify > Express, SQLite > Postgres for
  scope, Pinia setup-stores, JWT-in-memory + refresh-cookie tradeoffs, Open
  Relay TURN, Netlify rewrites for cookie scoping), what I'd do with
  another week, known limitations (single-instance presence, SQLite write
  contention, Estonian quality)
- `README.md` per PRD §21: title, live demo + repo links, 5 screenshots
  (auth / chats / chat / call / profile), features (required + bonuses),
  tech-stack table, architecture diagram + `nx graph` screenshot, local
  dev (`pnpm install`, env setup, dev commands), deployment (one paragraph
  each for Netlify + Railway), truncated project tree, link to REPORT.md
- Avatar-upload "obvious next step" note in REPORT.md: swap data-URL
  storage for S3/R2 + signed URLs (PRD §11.9 calls this out explicitly)
- Manual critical-path test script embedded in REPORT.md

**Exit criteria**
- `README.md` and `REPORT.md` exist at repo root; both render correctly on
  GitHub; all links work
- The "Local development" section is a clean copy-paste path from clone to
  running

---

## Phase 19 — Notification System

**Goal:** In-app notifications feed (bell + dropdown in TopBar) plus
browser-level Notification API dispatch when the tab is backgrounded
or the user is on a different thread. Audio chime + missed-call
tracking. Persistent across reload via localStorage, capped at 50
entries / 7 days, no server table.

**Deliverables**
- `stores/notifications.ts` — Pinia setup-store, localStorage-persisted
  per-user (`notifications:feed:<userId>`), capacity-bound, with `push`,
  `markRead`, `markAllRead`, `clear` actions and `unreadCount` getter
- `composables/useBrowserNotifications.ts` — permission flow (gated on
  hidden-tab + Safari standalone-mode check + user-gesture fallback),
  dispatch with `tag: notif:<kind>:<senderId>` dedup, click handler that
  focuses the tab and routes
- `composables/useNotificationSound.ts` — lazy-constructed `Audio`, 1s
  debounce, mute toggle persisted to `notifications:sound-muted`
- `components/notifications/{NotificationBell,NotificationsDropdown,
  NotificationItem}.vue` matching Toaster's teleport + Transition style
- `public/sounds/notify.mp3` (~3 KB chime)
- `TopBar.vue` mounts `<NotificationBell />` at the permanent right
  edge, outside the chat-route conditional, so it's visible everywhere
- `useSocket.ts` colocates all three triggers: `message:new`,
  `call:incoming`, and `call:ended` (with "missed call" derivation when
  local state was `ringing` and we never accepted)
- `BroadcastChannel('notifications')` elects one tab as dispatcher so
  multi-tab users see exactly one OS notification per event
- `ProfileView` section: notifications on/off toggle, sound on/off toggle
- `notifications.*` i18n keys in en/tr/et
- `authStore.logout` clears `notifications:feed:<userId>` and
  `notifications:permission-dismissed` for shared-device privacy

**Exit criteria**
- Bell badge increments on hidden-tab message; decrements on `markRead`
- OS notification fires only when `visibilityState === 'hidden'`;
  same-sender messages collapse via the `tag` field
- Incoming call → one feed entry + one OS notification; clicking
  either focuses the tab and surfaces the call modal
- Missed call from Alice (callee never accepted) produces exactly one
  feed entry + one OS notification
- Permission denial persists across reload; profile toggle re-prompts
  correctly when flipped back on
- Feed survives page reload, prunes entries >7d, hard-caps at 50 with
  oldest dropped first
- Logout wipes the feed; a second user on the same browser sees an
  empty bell
- Two open tabs of the same user produce ONE OS notification, not two
- iOS PWA in standalone mode: permission prompt only appears after a
  user gesture (profile toggle), never on page load
- Lighthouse PWA and A11y scores hold above 90 with bell + dropdown
  in the DOM

---

## Phase 20 — Web Push (deferred)

**Goal:** Wake a closed PWA when a message or call arrives, so the
notifications layer reaches users who don't have the tab open at all.
Builds on Phase 19's permission + dispatch surface.

**Deliverables**
- VAPID key pair generated; `VAPID_PUBLIC_KEY` shipped to the web,
  `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` in Railway env
- `apps/api/src/db/schema.ts` — new `push_subscriptions` table
  (`userId`, `endpoint` UNIQUE, `p256dh`, `auth`, `createdAt`)
- `POST /api/push/subscribe` + `DELETE /api/push/subscribe` routes;
  client posts the `PushSubscription.toJSON()` blob after the user
  enables push in ProfileView
- Custom service worker file extending the VitePWA-generated one with
  a `push` event handler that calls `self.registration.showNotification`
- Server-side fan-out: when `message:new` or `call:incoming` is emitted
  to a user whose socket is offline, push to every saved subscription
  via `web-push` library
- 410-gone cleanup: failed pushes remove the stale subscription row
- ProfileView "Push notifications" toggle (separate from the Phase 19
  in-tab toggle)

**Exit criteria**
- Close the tab / PWA entirely. Have another user send a message.
  Receive an OS notification within ~5 seconds. Click → app opens to
  the thread.
- Unsubscribe in ProfileView → server gets DELETE → no further push
- Force-revoke browser permission → next push attempt 410s → server
  drops the row → no further attempts

---

## Files To Be Created (Index)

Backend:
- `apps/api/src/{main.ts, app/server.ts}`
- `apps/api/src/app/plugins/{auth.ts, cors.ts, drizzle.ts, socket.ts,
  stripe.ts}`
- `apps/api/src/app/routes/{auth.ts, users.ts, conversations.ts,
  messages.ts, payments.ts, stripe-webhook.ts}`
- `apps/api/src/app/sockets/{connection.ts, messages.ts, calls.ts}`
- `apps/api/src/db/{schema.ts, client.ts, migrate.ts, migrations/}`
- `apps/api/src/services/{auth.ts, users.ts, messages.ts,
  conversations.ts, payments.ts}`
- `apps/api/src/lib/{jwt.ts, password.ts, errors.ts}`

Shared:
- `libs/shared-types/src/lib/{user.ts, message.ts, conversation.ts,
  call.ts, socket-events.ts}` + `index.ts`
- `libs/shared-contracts/src/lib/{auth.ts, user.ts, message.ts,
  payment.ts}` + `index.ts`

Frontend:
- `apps/web/src/{App.vue, main.ts}`
- `apps/web/src/api/client.ts`
- `apps/web/src/router/index.ts`
- `apps/web/src/stores/{auth.ts, users.ts, chat.ts, call.ts, ui.ts}`
- `apps/web/src/composables/{useAuth.ts, useSocket.ts, useWebRTC.ts,
  useInstallPrompt.ts, useBreakpoint.ts, useAvatarUpload.ts, useI18n.ts}`
- `apps/web/src/layouts/{AuthLayout.vue, AppLayout.vue}`
- `apps/web/src/components/layout/{TopBar.vue, BottomTabBar.vue,
  Sidebar.vue, NavRail.vue}`
- `apps/web/src/components/ui/{BaseButton.vue, BaseInput.vue,
  FormField.vue, Alert.vue, LoadingState.vue, EmptyState.vue,
  ErrorState.vue, UserAvatar.vue}`
- `apps/web/src/components/chat/{MessageBubble.vue, MessageList.vue,
  ComposeBar.vue, ConversationRow.vue, OnlineNowStrip.vue}`
- `apps/web/src/components/call/{CallModal.vue, VideoTile.vue,
  CallControls.vue}`
- `apps/web/src/components/InstallPromptBanner.vue`
- `apps/web/src/pages/{AuthView.vue, ChatsView.vue, CommunityView.vue,
  ChatView.vue, ProfileView.vue, UpgradeView.vue}`
- `apps/web/src/styles/{theme.css, components.css}`
- `apps/web/src/i18n/index.ts`
- `apps/web/src/locales/{en.json, tr.json, et.json}`

Config + docs:
- `nx.json`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`,
  `biome.jsonc` (Ultracite preset; **no** `eslint.config.*` or
  `.prettierrc`), `tools/check-boundaries.mjs`, `.vscode/settings.json`
  (Biome as default formatter, format-on-save), `netlify.toml`,
  `railway.json` (optional), `.nvmrc`, `.env.example`, `.gitignore`,
  `README.md`, `REPORT.md`
- Per-project: `apps/web/{project.json, vite.config.ts, index.html}`,
  `apps/api/{project.json, drizzle.config.ts}`, `libs/*/project.json`
  (each `project.json` has a `lint` target running `ultracite check
  {projectRoot}` and a `format` target running `ultracite fix
  {projectRoot}`)

---

## Verification (End-to-End)

After every phase, the manual script below should still pass for the
features completed so far. After Phase 16, all of it should pass against
the live URLs in two browser profiles:

1. Register user A; register user B in a different browser profile
2. Both see each other in `/community` with green online dot
3. A taps B → opens `/chat/<B>` → sends "hello"
4. B sees the message arrive in real time; ✓ on A's side flips to ✓✓
5. B types → A sees "typing…" then it clears
6. Both visit `/` → conversation appears at top with last message preview
7. A taps the audio call button → B sees ringing → accepts → audio flows
8. Hang up; mic indicator off on both peers
9. Video call same flow; camera light off after hangup
10. A goes to `/profile` → uploads a 5 MB JPEG → saves → reload → avatar
    persists; switches locale to TR then ET, every string changes
11. A goes to `/upgrade` → completes test payment with 3DS card → Pro
    badge appears on `/profile`
12. Mobile viewport (375 px): BottomTabBar visible on `/`, `/community`,
    `/profile`; hidden on `/chat/:userId`
13. Desktop viewport (1280 px): Sidebar visible everywhere; `/` shows
    "Select a conversation" empty state in right pane
14. Lighthouse on the deployed URL: PWA > 90, A11y > 90
15. Install prompt: Android shows banner → install → launches standalone;
    iOS shows custom instructions banner
