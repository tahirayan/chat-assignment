---
name: security
description: Security patterns — OWASP-aligned input validation (Zod everywhere), bcrypt cost 12 with timing-safe compare + min-response-time, refresh-token rotation, CORS allowlist, Stripe raw-body signature verification, secrets only in env vars, no stack traces in prod, no message bodies in logs. Use when reviewing or editing auth/payment/webhook code, any handler that touches user input, anything under apps/api/src/lib/, or when adding a new socket event that accepts user-supplied content. Required for code-review of any PR touching apps/api/src/app/routes/auth/, payments/, or apps/api/src/app/plugins/{auth,stripe}.ts.
---

# Security

OWASP-aligned guardrails for the Chat app. The PRD locks in many choices (bcrypt cost 12, JWT 15-min TTL, refresh-token rotation, single-flight refresh, raw-body Stripe verify); this skill is the consolidated reference.

## When to Use This Skill

- Reviewing auth, payment, webhook, or socket code
- Adding a new route that accepts user input
- Touching CORS / cookie / TLS / env-var configuration
- Investigating a security-suspicious bug report
- Pre-PR self-review on anything in `apps/api/src/app/routes/auth/`, `…/payments/`, or `…/sockets/`

## OWASP Top 10 Mapping (Selected)

| Risk                          | Mitigation in this project                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| A01 Broken Access Control     | `socket.data.userId` enforced on every C→S event; REST routes auth-gated by preHandler |
| A02 Cryptographic Failures    | bcrypt cost 12; refresh tokens SHA-256 hashed; JWT HS256 with ≥32-char secret        |
| A03 Injection                 | Zod schemas on every input (REST + sockets); Drizzle parameterized queries; no string SQL |
| A04 Insecure Design           | PRD §9 split-token scheme + rotation; webhook idempotency by intent ID               |
| A05 Misconfiguration          | CORS allowlist via env; HttpOnly + Secure (prod) cookies; no stack traces in prod    |
| A07 Auth Failures             | Generic error messages; timing-safe compare + min-response-time on login            |
| A08 Software & Data Integrity | Stripe webhook signature verified against **raw** body                              |
| A09 Logging Failures          | `fastify.log` structured logs; no message bodies/tokens/passwords ever logged       |

## Auth Hardening

- **Password hashing**: `bcrypt.hash(password, 12)` and `bcrypt.compare()`. Both async.
- **Timing-safe**: never use string equality on secrets. Use `crypto.timingSafeEqual` for byte comparisons. bcrypt compare is already timing-safe.
- **Minimum response time** on login: e.g. 250 ms floor before returning, regardless of outcome. Prevents enumeration via response-time differences.
- **Generic errors**: `INVALID_CREDENTIALS` for any login failure. Never reveal whether the email exists.
- **Refresh rotation**: every refresh issues a new token and marks the old `jti` as revoked. Re-using an old token is a detectable security event — log it.

## Input Validation

- **Every REST route** has a Zod `schema.body`, `querystring`, `params`, and `response`. `fastify-type-provider-zod` ensures handlers see typed input.
- **Every C→S socket event** with user-supplied content (e.g. `message:send`) is validated with a Zod schema from `@chat/shared-contracts`.
- **Length limits** are explicit: message bodies ≤2000 chars, display names ≤50, bios ≤280, avatar data URLs ≤150,000 chars.
- **Trust nothing** from the wire — `socket.data.userId` (set in the handshake) is the only source of truth for "who am I".

## Secret Handling

- All secrets via env: `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `.env.example` checked in with placeholder values; real `.env` in `.gitignore`.
- Never log JWTs, refresh tokens, passwords, Stripe webhook bodies, or message bodies.
- Production responses include no `stack`, no internal file paths, no DB error text.

## CORS

```ts
await app.register(cors, {
  origin: process.env.CORS_ORIGIN,    // exact Netlify domain
  credentials: true,                  // cookies cross-origin
})
```

Socket.io takes its own CORS in `new SocketIOServer(server, { cors: { origin: env.CORS_ORIGIN, credentials: true } })`. Both must match.

With Netlify rewrites, the production browser sees same-origin requests — but the api still runs on Railway and should be configured defensively in case rewrites are bypassed.

## Stripe Webhook (PRD §15)

- Raw body parser scoped **only** to `/api/stripe-webhook` — never globally.
- Verify signature with `stripe.webhooks.constructEvent(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)`.
- Idempotent: insert into `payments` with `onConflictDoNothing` keyed on `stripe_payment_intent`. Stripe retries succeeded webhooks — duplicates must be no-ops.
- On `payment_intent.succeeded`, flip `users.isPro = true` in the same transaction as the insert.

## Rate Limiting (Optional but Recommended)

Use `@fastify/rate-limit` with stricter limits on auth and payment routes:

| Route                     | Suggested limit  |
| ------------------------- | ---------------- |
| `POST /api/auth/login`    | 5 / min / IP     |
| `POST /api/auth/register` | 3 / min / IP     |
| `POST /api/auth/refresh`  | 30 / min / IP    |
| `POST /api/payments/create-intent` | 10 / min / user |
| Default                   | 60 / min / IP    |

Not in PRD §1.2 so technically out of scope, but trivially cheap to add and mentioned positively in REPORT.md.

## WebRTC Trust Boundary

- SDP and ICE payloads are **opaque** to the server — they are relayed verbatim. Do not parse, log, or rewrite them.
- The server only validates: (a) handshake auth, (b) target user is online at `call:initiate`.
- Camera/mic permissions are user-granted in the browser; the server has zero involvement.

## Avatar Upload (PRD §11.9)

- **Client** enforces: 10 MB pre-decode limit, MIME allow-list, 256×256 canvas resize, 100 KB post-encode limit.
- **Server** validates only the Zod union (https URL | `data:image/jpeg;base64,…` ≤ 150,000 chars | `null`). No decoding, no resizing, no inspection.
- Malformed data URLs are stored as-is and render as a broken image — acceptable failure mode per PRD.

## Frontend-Specific Hardening (from Ultracite)

These complement the OWASP framing above; Ultracite's rule set surfaces them
automatically in code review:

- **`rel="noopener noreferrer"`** on every `<a target="_blank">`. Without
  it, the opened page can read `window.opener` and navigate the parent.
- **No `dangerouslySetInnerHTML`** unless rendering pre-sanitized HTML from
  a trusted source. We have no such case in this app — flag any
  occurrence.
- **No `eval()`**, no `Function(...)` constructor, no direct assignment to
  `document.cookie`. There is no situation in this app that justifies
  these.
- **No `console.log` of user input** in shipped code. Especially not
  message bodies, JWTs, refresh tokens, or Stripe events.
- **Validate user input at every boundary.** REST handlers + socket
  handlers both. Trust nothing from the wire.

## Logging Discipline

- `fastify.log.info({ event: 'auth.login.success', userId })` — structured, no PII.
- Never log: `req.body` on auth/payment routes, JWTs, refresh tokens, message bodies, Stripe event bodies, avatar data URLs.
- On 500: log full stack server-side; return generic message to client.

## Checklist

- [ ] All inputs validated with Zod (REST + sockets)
- [ ] No secrets in code, logs, error responses
- [ ] Bcrypt cost 12; timing-safe + min-response-time on login
- [ ] Generic auth errors (no user enumeration)
- [ ] Refresh tokens rotated; old `jti` revoked
- [ ] CORS allowlist exact, credentials enabled
- [ ] Stripe webhook signature verified against raw body, idempotent insert
- [ ] No `stack` in production error responses
- [ ] SDP/ICE not logged or parsed
- [ ] No `any` for user-controlled values — narrow `unknown` instead

## See also

- `auth-jwt-cookies` — the auth-specific hardening
- `stripe-payments` — webhook signature + idempotency specifics
- `avatar-pipeline` — client-side guards + server-side ceiling
- `deployment` — production CORS + secret handling

## References

- PRD §9 Auth, §11.9 Avatar, §15 Stripe, §17.3 CORS
- OWASP API Security Top 10 (2023)
- `apps/api/src/lib/`, `apps/api/src/app/plugins/`
