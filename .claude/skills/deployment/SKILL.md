---
name: deployment
description: Deployment workflow for the Chat app — Railway (api + SQLite volume), Netlify (web + API/Socket.io rewrites for first-party cookies), CORS allowlist, Stripe webhook registration. Use when editing netlify.toml, configuring Railway, setting CORS_ORIGIN, or troubleshooting cross-origin cookies, Socket.io connection failures, or webhook signature errors in production.
---

# Deployment — Railway (api) + Netlify (web)

PRD §17 in skill form. The deployment topology is what makes the refresh
cookie work (first-party via rewrites) and what keeps the SQLite file
durable across restarts (Railway volume).

## When to Use This Skill

- Editing `netlify.toml`
- Configuring Railway service settings or env vars
- Investigating "refresh cookie not sent in production"
- Investigating Socket.io fails to connect in production (works locally)
- Setting up the Stripe webhook for the production URL
- Verifying CORS / origin config

## Quick Reference

| Concern              | Choice                                                                |
| -------------------- | --------------------------------------------------------------------- |
| **Web host**         | Netlify (free tier; Edge functions not needed)                        |
| **API host**         | Railway (free tier; supports WebSockets; persistent volume)            |
| **SQLite file**      | Mounted on Railway volume at `/data/chat.db`                          |
| **Cookie scope**     | First-party via Netlify `/api/*` rewrite → SameSite=Lax suffices       |
| **Socket.io**        | Reaches api via Netlify `/socket.io/*` rewrite                         |
| **CORS**             | `CORS_ORIGIN` = exact Netlify domain; allow credentials                |
| **Stripe webhook**   | Registered against Railway domain (not Netlify); raw-body required     |
| **Build (web)**      | `pnpm install --frozen-lockfile && pnpm exec nx build web`             |
| **Publish (web)**    | `dist/apps/web`                                                       |
| **Build (api)**      | `pnpm install --frozen-lockfile && pnpm exec nx build api`             |
| **Start (api)**      | `node dist/apps/api/main.js`                                          |

## Netlify Config (`netlify.toml`)

```toml
[build]
  base    = "."
  command = "pnpm install --frozen-lockfile && pnpm exec nx build web --skip-nx-cache"
  publish = "dist/apps/web"

[build.environment]
  NODE_VERSION = "22"
  PNPM_VERSION = "9"

# 1. API proxy — makes cookies first-party
[[redirects]]
  from   = "/api/*"
  to     = "https://<your-railway-domain>.up.railway.app/api/:splat"
  status = 200
  force  = true

# 2. Socket.io proxy — same first-party trick for the WS upgrade
[[redirects]]
  from   = "/socket.io/*"
  to     = "https://<your-railway-domain>.up.railway.app/socket.io/:splat"
  status = 200
  force  = true

# 3. SPA fallback — MUST be last
[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

**Order matters.** The SPA fallback is greedy — if you put it before the
`/api/*` rewrite, every API call returns `index.html`. Always last.

**Env vars** (Netlify dashboard):
- `VITE_STRIPE_PUBLISHABLE_KEY` (build-time only)

## Railway Config

**Service settings:**
- Build: `pnpm install --frozen-lockfile && pnpm exec nx build api`
- Start: `node dist/apps/api/main.js`
- Watch paths: `apps/api/**`, `libs/**`, `package.json`, `pnpm-lock.yaml`
- Listening port: `process.env.PORT` (Railway injects this)

**Volume:**
- Mount path: `/data`
- The SQLite file is the only stateful thing; backups are file copies

**Env vars:**

| Var                       | Value                                                |
| ------------------------- | ---------------------------------------------------- |
| `NODE_ENV`                | `production`                                         |
| `PORT`                    | (injected by Railway)                                 |
| `DATABASE_URL`            | `file:/data/chat.db`                                 |
| `JWT_SECRET`              | 32+ random chars                                     |
| `CORS_ORIGIN`             | `https://<your-netlify-domain>.netlify.app`           |
| `STRIPE_SECRET_KEY`       | `sk_test_…`                                          |
| `STRIPE_WEBHOOK_SECRET`   | `whsec_…` (from Stripe dashboard for prod endpoint)   |

## Why the Rewrites — Cookie Scoping

The refresh cookie lives only at `/api/auth`. Without rewrites, a Netlify
frontend calling Railway is **cross-site**, which forces:

- `SameSite=None` on the cookie
- `Secure` (already required in prod)
- Browser-level cookie partitioning surprises
- Extra preflight OPTIONS for every credentialed request

With the `/api/*` rewrite, the browser sees the api as same-origin under the
Netlify domain. Cookies become **first-party**, and `SameSite=Lax` is
sufficient. This is cleaner, faster, and avoids a class of cross-site bugs.

The Socket.io rewrite does the same trick for the WebSocket upgrade so the
client connects to `wss://<netlify>.netlify.app/socket.io/...` rather than
`wss://<railway>.up.railway.app/...`.

## CORS

Even with rewrites, the api still has a public Railway URL — configure CORS
defensively in case someone bypasses Netlify:

```ts
// apps/api/src/app/server.ts
await app.register(cors, {
  origin: process.env.CORS_ORIGIN,   // exact Netlify domain
  credentials: true,
})

// Socket.io takes its own CORS in the SocketIOServer options:
new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN, credentials: true },
})
```

## Migrations on Boot

`apps/api/src/main.ts`:

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
migrate(db, { migrationsFolder: './migrations' })
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) })
```

`host: '0.0.0.0'` is required — Railway routes from `0.0.0.0`, not `localhost`.

## Stripe Webhook in Production

1. Stripe dashboard → Webhooks → Add endpoint
2. URL: `https://<your-railway-domain>.up.railway.app/api/stripe-webhook`
   (the Railway URL directly, **not** the Netlify rewrite — Stripe signs
   against the URL it's calling)
3. Event: `payment_intent.succeeded`
4. Copy the signing secret → Railway env `STRIPE_WEBHOOK_SECRET`

The webhook does **not** go through Netlify because:
- Stripe needs to reach the api directly to verify signatures
- Routing through Netlify rewrites adds latency and a failure point
- The raw-body parser scoping is server-side only

## Smoke Test (Post-Deploy)

Run the full critical path on the live Netlify URL in two browser profiles:

1. Register A in profile 1; register B in profile 2
2. Hard-reload both — both stay authenticated (refresh cookie works)
3. Each sees the other in `/community` with online dot
4. A messages B → arrives within 1 tick
5. Audio call: A → B → accept → audio flows → end → mic off both peers
6. Video call: same flow → camera off both peers
7. Test payment with 3DS card → Pro badge appears

Watch Railway logs during the smoke. No errors, no stack traces.

## Common Production-Only Bugs

| Symptom                          | Likely cause                                                          |
| -------------------------------- | --------------------------------------------------------------------- |
| Logs in but reload kicks to /auth | Refresh cookie path/domain wrong; rewrites not configured             |
| Socket.io fails with CORS error  | `/socket.io/*` rewrite missing, or Socket.io `cors.origin` mismatched  |
| `/api/auth/login` returns HTML   | SPA fallback redirect placed before `/api/*` rewrite                  |
| Webhook returns 400 "bad sig"     | Raw-body parser not scoped to webhook route, or wrong webhook secret  |
| api returns 502 on first request  | Railway free-tier cold-start; trigger a warmup endpoint, accept it    |
| `lastSeenAt` resets to null      | Migrations didn't run on boot — check Railway boot logs                |

## Cost & Limits (Free Tier)

- **Netlify**: 100 GB/mo bandwidth, 300 build minutes/mo, instant deploys
- **Railway**: $5 free credit/mo, sleeps after inactivity on free trial
- **SQLite volume**: 1 GB on Railway free; plenty for this demo

For a demo: free tier is fine. For production this would move to Postgres +
Redis pub/sub (for multi-instance presence) — flag in REPORT.md.

## Checklist

- [ ] `netlify.toml` has `/api/*` and `/socket.io/*` rewrites **before** the
      SPA fallback
- [ ] Railway service has `DATABASE_URL=file:/data/chat.db` and the volume is
      mounted at `/data`
- [ ] `CORS_ORIGIN` set to the exact Netlify domain (no trailing slash)
- [ ] Fastify listens on `0.0.0.0:$PORT`
- [ ] Migrations run on boot (visible in Railway logs)
- [ ] Stripe webhook registered against the **Railway** URL, not Netlify
- [ ] `JWT_SECRET` ≥ 32 chars and committed to Railway env only
- [ ] Smoke-tested in two browser profiles on the live URL

## See also

- `auth-jwt-cookies` — for why the rewrites matter for cookie scoping
- `stripe-payments` — for the webhook signature contract
- `security` — for the production CORS + secret-handling discipline
- `fastify-plugins` — for the raw-body parser scoping
