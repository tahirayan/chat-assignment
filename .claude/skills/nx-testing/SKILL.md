---
name: nx-testing
description: Vitest patterns in the Nx monorepo — co-located .spec.ts files, Fastify app.inject() for route tests, in-memory SQLite for isolation, priorities (Zod schemas, lib/password.ts, lib/jwt.ts), optional Playwright happy-path E2E for register + send message between two contexts. Use when adding a Vitest test, debugging a failing test, or planning what to cover (Zod schemas and auth crypto are the priorities per PRD §23).
---

# Testing — Vitest + Nx

Light test strategy per PRD §23. The high-value targets are Zod schemas, auth crypto, JWT, and (optionally) a Playwright happy-path E2E.

## When to Use This Skill

- Writing a new Vitest test
- Running existing tests or debugging a failure
- Setting up Playwright (optional)
- Reviewing test coverage on a PR

## Test Stack

| Layer            | Tool                                                  |
| ---------------- | ----------------------------------------------------- |
| Runner           | Vitest 1.x                                            |
| HTTP testing     | `app.inject()` from Fastify (no Supertest needed)     |
| E2E (optional)   | Playwright                                            |
| Coverage         | Built-in Vitest                                       |

## Running Tests

```bash
pnpm exec nx test shared-contracts
pnpm exec nx test api
pnpm exec nx test web
pnpm exec nx test {project} --watch
pnpm exec nx test {project} --coverage

pnpm exec nx run-many -t test
pnpm exec nx affected -t test
```

## File Layout

Co-locate tests with source:

```
libs/shared-contracts/src/lib/
├── auth.ts
├── auth.spec.ts
├── user.ts
├── user.spec.ts
```

```
apps/api/src/lib/
├── jwt.ts
├── jwt.spec.ts
├── password.ts
├── password.spec.ts
```

## Priorities (PRD §23)

1. **Zod schemas** in `shared-contracts` — every schema gets a happy-path + at least one reject case.
2. **`apps/api/src/lib/password.ts`** — hash + verify roundtrip; wrong-password rejection.
3. **`apps/api/src/lib/jwt.ts`** — sign + verify; expiry rejection; tamper rejection.
4. **Manual critical-path script** (in REPORT.md) — register → login → send message → receive on second tab → start call → end call.
5. **(Optional) Playwright happy-path** — register + send message between two contexts.

Skip exhaustive unit tests of UI components. Focus on contracts and auth, where mistakes silently cause runtime bugs.

## Unit Test Pattern

```ts
import { describe, it, expect } from 'vitest'
import { loginInput } from './auth'

describe('loginInput', () => {
  it('accepts a valid login', () => {
    const result = loginInput.safeParse({ email: 'a@b.co', password: '12345678' })
    expect(result.success).toBe(true)
  })

  it('rejects a short password', () => {
    const result = loginInput.safeParse({ email: 'a@b.co', password: 'short' })
    expect(result.success).toBe(false)
  })

  it('lowercases and trims email', () => {
    const result = loginInput.parse({ email: '  A@B.co  ', password: '12345678' })
    expect(result.email).toBe('a@b.co')
  })
})
```

## Fastify Route Test (using `app.inject`)

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestApp } from './test-helpers'        // build app w/ in-memory SQLite
import type { FastifyInstance } from 'fastify'

describe('POST /api/auth/register', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildTestApp() })
  afterAll(async () => { await app.close() })

  it('creates a user and returns access token + sets refresh cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'secret123', displayName: 'Alice' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe('a@b.co')
    expect(body.accessToken).toMatch(/^eyJ/)
    expect(res.headers['set-cookie']).toMatch(/refresh_token=/)
  })

  it('returns 409 on duplicate email', async () => { /* … */ })
  it('returns 400 on short password', async () => { /* … */ })
})
```

Use an in-memory SQLite (`:memory:`) for the test app so each suite starts clean — no fixtures to wipe between runs.

## JWT Tests

```ts
import { describe, it, expect } from 'vitest'
import { signAccessToken, verifyAccessToken } from './jwt'

describe('jwt', () => {
  it('round-trips sub claim', async () => {
    const token = await signAccessToken({ sub: 'user-1', email: 'a@b.co' })
    const payload = await verifyAccessToken(token)
    expect(payload.sub).toBe('user-1')
  })

  it('rejects an expired token', async () => {
    const token = await signAccessToken({ sub: 'user-1', email: 'a@b.co' }, { expiresIn: '0s' })
    await new Promise(r => setTimeout(r, 50))
    await expect(verifyAccessToken(token)).rejects.toThrow()
  })

  it('rejects a tampered signature', async () => {
    const token = await signAccessToken({ sub: 'user-1', email: 'a@b.co' })
    const tampered = token.slice(0, -4) + 'AAAA'
    await expect(verifyAccessToken(tampered)).rejects.toThrow()
  })
})
```

## Playwright (Optional)

If time permits, one happy-path E2E:

```ts
test('two users exchange a message', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  // register A, register B, both land on /
  // A clicks B in /community
  // A sends "hello"
  // B's UI shows "hello" within 2 s
})
```

Skip if WebRTC or Stripe is the time crunch.

## Best Practices

- Test business logic and contracts. Skip UI component tests except for `useAvatarUpload` (high-value pipeline).
- `app.inject()` is faster than spinning a real port; use it.
- In-memory SQLite for api tests — no leftover state.
- Never test against a real Stripe account or live socket server. Mock or use `app.inject()`.

## Test Discipline (from Ultracite)

These rules apply to every Vitest file:

- **Assertions go inside `it()` or `test()`** blocks — never at the top
  level of a describe.
- **No `.only` or `.skip` in committed code.** Ultracite's check fails on
  these. Use them locally while iterating, then remove before commit.
- **`async/await` over done callbacks** — Vitest fully supports `async`
  test functions; never reach for `done`.
- **Flat describe nesting** — one or two levels max. Deep nesting hurts
  readability without aiding organization.
- **One assertion focus per `it`** — split scenarios into separate `it`
  blocks rather than packing many unrelated checks into one.

## See also

- `nx-commands` — for the `nx test` invocation patterns
- `monorepo-contracts` — for why Zod schema tests are the priority
- `auth-jwt-cookies` — for the jwt/password roundtrip cases to cover

## References

- PRD §23 Testing Strategy (Light)
- Vitest docs: https://vitest.dev/
- Fastify `inject` docs: https://fastify.dev/docs/latest/Reference/Testing/
