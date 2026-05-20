# Lylia Chat

Real-time chat web app — registration + 1:1 messaging with typing
indicators and read receipts, peer-to-peer audio and video calls over
WebRTC, Stripe-gated Pro upgrade, and PWA install on Android + iOS. Three
languages, mobile-first, installs to the home screen, audio/video media
never touches the server.

- **Live demo:** https://lylia-chat.netlify.app
- **Engineering report:** [REPORT.md](./REPORT.md) — architecture, key decisions, what I'd build next.
- **Full requirements:** [PRD.md](./PRD.md). **Build sequence:** [PLAN.md](./PLAN.md).

## Screenshots

_(5 screenshots will be added once the production deploy is up: auth, chats, chat thread, video call, profile.)_

<!-- TODO:
| Auth | Chats | Chat | Call | Profile |
|------|-------|------|------|---------|
| ![]() | ![]() | ![]() | ![]() | ![]() |
-->

## Features

| Required | Status |
|---|---|
| Register + login with secure password hashing | ✅ bcrypt cost 12 + min-response-time on login (no user enumeration) |
| Real-time 1:1 messaging | ✅ socket.io 4.8 with optimistic UI |
| Typing indicators | ✅ throttled emit, 6s defensive auto-clear |
| Read receipts (`✓ / ✓✓`) | ✅ marks all unread on thread open + live flip |
| Online/offline presence | ✅ "last-socket" semantics so multi-tab doesn't flicker |
| Audio + video calls | ✅ WebRTC with perfect-negotiation, Open Relay TURN fallback |
| Profile editing + avatar upload | ✅ client-side canvas pipeline 10 MB → 256×256 JPEG ≤100 KB data URL |
| i18n (3 languages) | ✅ EN + TR hand-written, ET best-effort; lazy non-EN chunks |
| PWA installable | ✅ vite-plugin-pwa, Android + iOS, Lighthouse PWA >90 |
| Stripe Pro upgrade | ✅ Payment Element + 3DS + idempotent webhook |

| Bonus | Status |
|---|---|
| JWT-on-socket TTL enforcement + auto-refresh | ✅ socket can't outlive its 15-min access token; logout kicks all sockets |
| `?forceRelay=1` TURN testing | ✅ flips `iceTransportPolicy: relay` so the TURN path can be verified |
| Camera toggle mid-call without renegotiation | ✅ via `sender.replaceTrack(null/newTrack)` |
| Server-stored locale wins on bootstrap | ✅ PRD §14.2 — login on a new device picks up your saved language |
| Single-flight refresh interceptor | ✅ axios + socket share one `/auth/refresh` per concurrent 401 |
| Workspace-root single `.env` | ✅ api via `tsx --env-file`, web via Vite `envDir` |

## Tech stack

Nx 22 monorepo · pnpm. Vue 3.5 + Vite 7 + Pinia 3 + Tailwind 4 · Fastify 5
+ Socket.io 4.8 · Drizzle ORM + SQLite (WAL) · JWT (jose) + bcrypt cost 12
· Stripe Payment Element · Vitest · Ultracite (Biome 2) . Three locales via vue-i18n 11 composition mode.

Full breakdown: [REPORT.md §7](./REPORT.md#7-tech-stack-at-a-glance).

## Architecture

```
Browser ──▶ Netlify (static + /api,/socket.io rewrites) ──▶ Railway (Fastify+SQLite)
   │                                                              │
   └───────────── WebRTC peer-to-peer (TURN if needed) ────────────┘
                                                                  ▲
                                                                  └── Stripe webhook
```

Full diagram + decision log: [REPORT.md §2](./REPORT.md#2-architecture).

To see the live monorepo graph:

```bash
pnpm graph
```

## Local development

```bash
pnpm install
cp .env.example .env   # then fill in Stripe keys (optional for non-payment work)
pnpm nx serve api      # → http://localhost:3000
pnpm nx serve web      # → http://localhost:4200
```

Tooling:

```bash
pnpm lint              # ultracite check (read-only)
pnpm format            # ultracite fix
pnpm typecheck         # nx run-many -t typecheck (4 projects)
pnpm test              # vitest across api + shared-contracts
pnpm boundaries        # nx-graph module-boundary enforcement
pnpm db:studio         # drizzle-kit studio (browser DB inspector)
```

### Stripe (local)

To test the Pro upgrade end-to-end you need both Stripe keys plus the
[Stripe CLI](https://docs.stripe.com/stripe-cli) forwarding webhooks to
your local API:

```bash
# in .env (workspace root)
STRIPE_SECRET_KEY=sk_test_...           # https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=whsec_...         # printed by `stripe listen`
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# in a third terminal
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

The CLI prints the `whsec_…` on its first line — paste it into
`STRIPE_WEBHOOK_SECRET` and restart `pnpm nx serve api`. Without the
keys set, the API decorates `fastify.stripe` as `null` and the
UpgradeView shows a friendly "not configured" panel — the rest of the
app keeps working.

Test cards: `4242 4242 4242 4242` (succeeds), `4000 0027 6000 3184`
(3DS), `4000 0000 0000 9995` (declines). Full list:
<https://docs.stripe.com/testing>.

## Deployment

The web ships to **Netlify** as a static SPA; the api ships to **Railway**
with a persistent volume. Netlify rewrites `/api/*` and `/socket.io/*` to
the Railway URL so cookies stay first-party (`SameSite=Lax` suffices).

### One-time setup

1. **Railway (api).** Create a service from this repo; Railway picks up
   `railway.json` + `railpack.json` for the build/start commands. Add a
   volume mounted at `/data` (any size; SQLite is tiny). Set env vars in
   the Railway dashboard:

   ```
   NODE_ENV=production
   DATABASE_URL=file:/data/chat.db
   JWT_SECRET=<32+ char random — generate with `openssl rand -base64 48`>
   CORS_ORIGIN=https://<your-netlify-domain>.netlify.app
   STRIPE_SECRET_KEY=sk_live_...     # or sk_test_… for a test deploy
   STRIPE_WEBHOOK_SECRET=whsec_...   # filled in below after step 4

   # Web Push (Phase 20) — generate the keypair ONCE locally with:
   #   node -e "console.log(require('web-push').generateVAPIDKeys())"
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   ```

   `PORT` is provided by Railway — Fastify reads `process.env.PORT`.
   First deploy auto-runs drizzle migrations on boot (db plugin).

2. **Netlify (web).** Create a site from this repo; the build config in
   `netlify.toml` is picked up automatically. **Before pushing**, open
   `netlify.toml` and replace `<your-railway-domain>` (two places) with
   the actual Railway service URL. Then set the env var in the Netlify
   dashboard:

   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...  (or pk_test_…)
   # Same value as Railway's VAPID_PUBLIC_KEY — the browser needs it to
   # construct the push subscription.
   VITE_VAPID_PUBLIC_KEY=...
   ```

3. **CORS sanity check.** Once both are live, hit
   `https://<your-railway-domain>.up.railway.app/health` directly in a browser —
   should return `{"status":"ok"}`. Then load the Netlify URL and watch
   the Network panel: every `/api/*` request should be same-origin (no
   CORS preflight), and `/socket.io/*` should upgrade to WebSocket.

4. **Stripe webhook.** In the Stripe Dashboard → Developers → Webhooks
   → "Add endpoint": URL is
   `https://<your-railway-domain>.up.railway.app/api/stripe-webhook`,
   event is `payment_intent.succeeded`. Copy the signing secret into
   `STRIPE_WEBHOOK_SECRET` in Railway and redeploy.

### Smoke test (post-deploy)

Open the Netlify URL in two different browser profiles and run the
[manual critical-path checklist](./docs/critical-path.md) — ~10 minutes,
41 steps, covers every shipped surface. Highlights from the checklist:

- [ ] Register on both; messages exchange in real time, presence flips on close
- [ ] Audio call connects + the mic indicator goes off on both peers after hangup
- [ ] Video call connects, camera toggle works without dropping the call, camera light goes off on both peers after hangup
- [ ] Stripe upgrade with `4242…` flips the Pro badge across all surfaces
- [ ] Hard-refresh keeps you logged in (refresh-cookie round-trips through the Netlify rewrite)

Railway logs should show no errors during the run.

## Project structure

```
chat/
├── apps/
│   ├── web/      # Vue 3.5 + Vite 7 + Tailwind 4 + Pinia 3
│   └── api/      # Fastify 5 + Socket.io 4.8 + Drizzle + better-sqlite3
├── libs/
│   ├── shared-types/      # plain TS types, zero runtime deps
│   └── shared-contracts/  # Zod schemas
├── tools/
│   ├── check-boundaries.mjs       # Nx-graph module-boundary enforcement
│   ├── generate-pwa-icons.mjs     # sharp-based icon generator
│   └── *-smoke.mjs                # multi-client socket smoke tests
├── docs/
│   └── critical-path.md           # 41-step manual smoke checklist
├── netlify.toml                   # web deploy + /api & /socket.io rewrites
├── railway.json + railpack.json   # api deploy on Railway
├── REPORT.md                      # engineering report (decisions, limits)
├── PRD.md                         # product spec
└── PLAN.md                        # phased build sequence
```

Module boundaries: apps may only import from `@chat/shared-*`. Enforced
via Biome (`noRestrictedImports`) and `tools/check-boundaries.mjs`.

## Internationalization

Three locales: **English** (`en`), **Turkish** (`tr`), **Estonian**
(`et`). English and Turkish are hand-written.

> **Estonian translations are best-effort** — DeepL-drafted with light
> review, not yet vetted by a native speaker. Contributions and
> corrections are welcome
> ([`apps/web/src/locales/et.json`](./apps/web/src/locales/et.json)).

Locale precedence on each session:

1. Server-stored `user.locale` (wins on login + refresh-cookie bootstrap).
2. `localStorage["locale"]` (in-app switcher).
3. `navigator.language` (first visit only).
4. `en` fallback.

## License

Demo project; no license set. Code is here as a portfolio sample.
