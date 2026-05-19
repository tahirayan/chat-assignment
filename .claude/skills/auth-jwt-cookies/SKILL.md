---
name: auth-jwt-cookies
description: Authentication patterns — JWT access tokens in Pinia memory plus opaque refresh tokens in HttpOnly cookies, rotated on every use. Use when editing apps/api/src/app/routes/auth/*, apps/api/src/lib/{jwt,password}.ts, apps/api/src/services/auth.ts, apps/web/src/api/client.ts (axios refresh interceptor), apps/web/src/stores/auth.ts, the socket handshake in apps/api/src/app/plugins/socket.ts, or the refresh_tokens table. Required reading for any change near JWT signing, bcrypt verification, cookie config, or token rotation.
---

# Auth — JWT in memory + opaque refresh cookie

The Chat app uses a split-token scheme per PRD §9. Access tokens are short-lived JWTs held in Pinia memory; refresh tokens are opaque, hashed in the DB, and rotated on every use.

## When to Use This Skill

- Implementing or changing routes under `apps/api/src/app/routes/auth/`
- Touching the axios refresh interceptor in `apps/web/src/api/client.ts`
- Modifying the socket handshake middleware in `apps/api/src/app/plugins/socket.ts`
- Editing the auth store (`apps/web/src/stores/auth.ts`)
- Reviewing any change near `refresh_tokens` table or cookie config

## Quick Reference

| Concern               | Choice                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| **Access token**      | JWT HS256, 15-min TTL, payload `{ sub, email, iat, exp }`                          |
| **Access storage**    | Pinia store (memory) only — never localStorage, never a cookie                     |
| **Refresh token**     | Opaque, 64-byte base64url random, 7-day TTL                                       |
| **Refresh storage**   | HttpOnly Secure cookie; SHA-256 hash stored in `refresh_tokens.token_hash`         |
| **Refresh rotation**  | Every use: issue new token, mark old `jti.revoked_at = now()`                      |
| **Cookie path**       | `/api/auth` so it's sent only to auth routes                                       |
| **SameSite**          | `Lax` in production (Netlify rewrites make api first-party)                        |
| **Password hash**     | bcrypt cost 12 (async hash + async compare)                                        |
| **JWT secret**        | `process.env.JWT_SECRET`, min 32 chars                                             |

## Token Strategy (PRD §9.1)

- **Access token** is short-lived so a leaked token has a small blast radius. It lives only in Pinia memory and is sent as `Authorization: Bearer …`. It is lost on hard reload and recovered via the refresh flow on app boot.
- **Refresh token** is opaque (not a JWT) so revocation requires only a DB update — there is no "still-valid signature" problem.
- Rotation on every use defeats refresh-token replay. The old `jti` is recorded as revoked; a second use of the old token can be detected and the user's session terminated.

## Cookie Config

```ts
reply.setCookie('refresh_token', token, {
  httpOnly: true,
  secure: true,           // production
  sameSite: 'lax',        // first-party via Netlify rewrites (PRD §9.2)
  path: '/api/auth',
  maxAge: 60 * 60 * 24 * 7,
})
```

In development, omit `secure` and accept `sameSite: 'lax'` on localhost.

## Bootstrap Flow (Client)

1. App boots → `useAuthStore.bootstrap()` calls `POST /api/auth/refresh`
2. On 200: set `accessToken` and `user`; connect socket (via watcher in `useSocket`)
3. On 401: clear state, route to `/auth`
4. Refresh cookie survives hard reload — this is what keeps the user logged in across sessions

## Axios Refresh Interceptor

Single-flighted to avoid a thundering herd of refresh calls when many requests race a 401:

```ts
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

Exclude `/auth/*` from the interceptor — refreshing the refresh endpoint is a recursion bug.

### Anti-pattern: refresh-on-401 without exclusion

```ts
// BAD — when /auth/refresh itself returns 401, the interceptor tries to
//        refresh it. Infinite loop, 401 storm, possible logout cascade.
api.interceptors.response.use(undefined, async err => {
  if (err.response?.status === 401) {
    await useAuthStore().refresh()       // ← refresh fires on EVERY 401,
    return api.request(err.config)        //   including refresh's own 401
  }
  throw err
})
```

```ts
// BAD — no single-flight; ten concurrent 401s fire ten refreshes in parallel
api.interceptors.response.use(undefined, async err => {
  if (err.response?.status === 401 && !err.config.url.includes('/auth/')) {
    await useAuthStore().refresh()
    return api.request(err.config)
  }
  throw err
})
```

```ts
// GOOD — exclude /auth/*, mark `_retry` to prevent retry loops,
//        and single-flight via a module-scoped promise
let refreshPromise: Promise<string> | null = null

api.interceptors.response.use(undefined, async err => {
  const status = err.response?.status
  const original = err.config
  if (
    status === 401 &&
    !original._retry &&
    !original.url.includes('/auth/')
  ) {
    original._retry = true
    refreshPromise ??= useAuthStore()
      .refresh()
      .finally(() => { refreshPromise = null })
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

Three properties matter together: **exclude `/auth/*`**, **mark `_retry`**,
and **single-flight**. Missing any one of them creates a different bug
class.

## Anti-pattern: storing the access token in localStorage

```ts
// BAD — access tokens in localStorage are XSS-readable; any third-party
//        script in the page can exfiltrate them
useAuthStore().setAccessToken(token)
localStorage.setItem('accessToken', token)
```

```ts
// GOOD — access token lives in Pinia memory only. It's intentionally lost
//        on hard reload and recovered via the refresh cookie.
useAuthStore().setAccessToken(token)
```

The whole point of the split-token scheme is that the long-lived part
(refresh) is HttpOnly (XSS can't read it) and the short-lived part (JWT)
isn't persisted (so even if XSS reads it, it expires in 15 min and isn't
re-readable on the next page load).

## Socket Handshake (PRD §8.1)

```ts
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('unauthorized'))
    const payload = await verifyAccessToken(token)
    socket.data.userId = payload.sub
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})
```

When the access token expires while a socket is open, the client should reconnect with the fresh token. The `useSocket` composable watches `authStore.accessToken` and triggers reconnect on change.

## Password Hashing

```ts
import bcrypt from 'bcrypt'

const hash = await bcrypt.hash(password, 12)
const ok = await bcrypt.compare(password, hash)
```

- Cost factor 12 is the project default.
- Always async — never block the event loop on auth.
- Generic error messages on login failure: don't reveal whether the email is registered (no user enumeration).

## Checklist

- [ ] JWT secret loaded from env, min 32 chars, not present in code
- [ ] Refresh tokens stored as SHA-256 hashes — never raw
- [ ] Rotation revokes the old `jti` and issues a new one in the same transaction
- [ ] Cookie path scoped to `/api/auth`; HttpOnly + Secure (prod) + SameSite=Lax
- [ ] Single-flighted axios refresh interceptor with `/auth/*` exclusion
- [ ] Socket handshake rejects on missing/invalid token with `Error('unauthorized')`
- [ ] `useSocket` reconnects on `accessToken` change
- [ ] Generic error messages on login (no user enumeration)
- [ ] No JWT, refresh token, or password value ever logged

## See also

- `socket-events` — the handshake auth that pairs with this token strategy
- `security` — the broader OWASP framing this fits into
- `deployment` — why Netlify rewrites make `SameSite=Lax` sufficient
- `api-design` — the auth-endpoint schemas + error envelope

## References

- PRD §9 Authentication Flow (Detailed)
- PRD §7.1 Auth endpoints table
- `apps/api/src/lib/jwt.ts`, `apps/api/src/lib/password.ts`
- `apps/api/src/services/auth.ts`
- `apps/web/src/api/client.ts`, `apps/web/src/stores/auth.ts`
