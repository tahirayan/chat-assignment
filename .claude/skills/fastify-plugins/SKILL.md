---
name: fastify-plugins
description: Fastify 5 plugin authoring — encapsulation, fastify-plugin (fp) wrapping, decorator visibility, TypeScript module augmentation, onReady/onClose lifecycle, raw-body parser scoping for the Stripe webhook. Use when adding or editing files under apps/api/src/app/plugins/ ({cors,cookie,drizzle,auth,socket,stripe}.ts), wrapping a shared utility, debugging "fastify.X is undefined" errors in routes, or fixing registration-order issues in apps/api/src/app/server.ts.
---

# Fastify Plugins

PRD §17 + §9 lean on Fastify 5 plugins for cookies, CORS, JWT, Drizzle, Socket.io, and Stripe. This skill gives the encapsulation rules and the project layout.

## When to Use This Skill

- Adding a new plugin under `apps/api/src/app/plugins/`
- Wrapping a shared utility (DB client, JWT helpers, Stripe client) for the server
- Debugging "decorator is not defined" errors or registration-order surprises
- Reviewing plugin code

## Quick Reference

| Concern          | Choice                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| **Distribution** | Wrap with `fastify-plugin` so decorators are visible to parent + siblings    |
| **Name**         | `name: '@chat/<feature>'` in `fp` options                                    |
| **Types**        | `declare module 'fastify' { interface FastifyInstance { … } }` in plugin file |
| **Options**      | Typed via `fp<OptionsType>(async (fastify, options) => {…}, { name })`        |
| **Lifecycle**    | `onReady` for post-boot checks (e.g. ping DB); `onClose` for cleanup          |
| **Logging**      | `fastify.log.debug/info/warn` — never `console.*`                            |

## Plugin Structure

1. **Wrap with `fp`** if the decorator should be available outside this plugin's encapsulation context. Almost always yes for shared utilities (db, jwt, stripe).
2. **Name** with `{ name: '@chat/<feature>' }`. The name shows up in errors and lifecycle logs.
3. **Augment the FastifyInstance type** in the same file:
   ```ts
   declare module 'fastify' {
     interface FastifyInstance {
       db: DrizzleDb
     }
   }
   ```
4. **Options** are optional unless the plugin is configurable (e.g. CORS). Type them.
5. **Decorate once**:
   ```ts
   fastify.decorate('db', drizzleInstance)
   ```
6. **Cleanup** with `onClose`:
   ```ts
   fastify.addHook('onClose', async () => {
     sqlite.close()
   })
   ```

## Project Plugin Inventory (apps/api/src/app/plugins/)

| Plugin     | Purpose                                                              |
| ---------- | -------------------------------------------------------------------- |
| `cors`     | `@fastify/cors` allowlist from `process.env.CORS_ORIGIN`, credentials |
| `cookie`   | `@fastify/cookie` for refresh-token cookie                            |
| `drizzle`  | better-sqlite3 + Drizzle, decorates `fastify.db`, runs migrations on boot |
| `auth`     | JWT helpers + `verifyAccessToken` decorator                          |
| `socket`   | Socket.io attached to Fastify HTTP server with handshake auth        |
| `stripe`   | Stripe client; raw-body parser scoped to the webhook route only       |

## Encapsulation Rules

- `fastify.register(plugin)` creates a **new context**: decorators and routes registered inside are not visible to ancestors or siblings.
- **Children** inherit from their parent.
- **fastify-plugin** breaks encapsulation for that plugin's decorators/hooks — they become visible to the parent app.

If `fastify.db` is undefined in a route, the most common cause is the `drizzle` plugin wasn't wrapped with `fp`, or it was registered inside an encapsulated `register()` block.

### Anti-pattern: forgetting `fp()` — invisible decorator

```ts
// BAD — no fastify-plugin wrapper. The decorator IS attached, but only
//        within this plugin's encapsulation context. Sibling plugins and
//        the parent app see fastify.db as undefined.
export async function drizzlePlugin(fastify: FastifyInstance) {
  const db = createDrizzleClient()
  fastify.decorate('db', db)
}
// In a route file:
// TypeError: Cannot read properties of undefined (reading 'select')
//   at … fastify.db.select(…)
```

```ts
// GOOD — fp() breaks encapsulation, so the decorator is visible to the
//        parent app and all sibling plugins/routes
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance { db: DrizzleDb }
}

export const drizzlePlugin = fp(async (fastify) => {
  const db = createDrizzleClient(process.env.DATABASE_URL!)
  fastify.decorate('db', db)
  fastify.addHook('onClose', async () => { db.$client.close() })
}, { name: '@chat/drizzle' })
```

The diagnosis is always the same: "decorator visible inside the plugin file
but undefined in routes" → forgot `fp()` or missed the `declare module`
augmentation.

## Anti-pattern: global raw-body parser

```ts
// BAD — raw body is now the format for ALL JSON POSTs. The login route
//        receives a Buffer instead of a parsed object; Zod validation
//        rejects everything; the whole api is broken.
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => done(null, body),   // ← never parses
)
```

```ts
// GOOD — scope by route URL inside the parser
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    if (req.url === '/api/stripe-webhook') return done(null, body)
    try { done(null, JSON.parse(body.toString())) }
    catch (err) { done(err as Error) }
  },
)
```

Or attach a route-scoped parser using `addContentTypeParser` only on the
specific webhook route (depending on Fastify version). Either works; both
keep the rest of the api on normal JSON parsing.

## Registration Order (in `app/server.ts`)

```ts
await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true })
await app.register(cookiePlugin)
await app.register(drizzlePlugin)       // decorates app.db
await app.register(authPlugin)          // decorates app.verifyAccessToken
await app.register(stripePlugin)        // decorates app.stripe + raw-body for webhook
await app.register(socketPlugin)        // attaches socket.io to app.server
// Routes last, after all decorators are registered:
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(usersRoutes, { prefix: '/api/users' })
await app.register(messagesRoutes, { prefix: '/api/messages' })
await app.register(conversationsRoutes, { prefix: '/api/conversations' })
await app.register(paymentsRoutes, { prefix: '/api/payments' })
await app.register(stripeWebhookRoute)  // raw body — separate, no prefix
```

## Raw Body for Stripe Webhook

Stripe signature verification needs the **raw** request body. Configure the parser **scoped to the webhook route only**, not globally:

```ts
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    // Only apply for the webhook URL; otherwise fall through to default JSON parsing
    if (req.url === '/api/stripe-webhook') return done(null, body)
    try { done(null, JSON.parse(body.toString())) } catch (err) { done(err as Error) }
  },
)
```

Or scope a content-type parser on the route's `config` — either works. The goal: never verify a Stripe signature against a parsed-then-restringified JSON body.

## Checklist for a New Plugin

- [ ] Wrapped with `fp(…, { name: '@chat/<feature>' })`
- [ ] `declare module 'fastify'` extends `FastifyInstance` with new decorators
- [ ] Options typed via `fp<Options>(...)` when configurable
- [ ] Resources cleaned up in `onClose` (DB handle, Stripe client, etc.)
- [ ] Optional `onReady` sanity check (e.g. `PRAGMA integrity_check` on SQLite)
- [ ] Exported from a single `index.ts`
- [ ] Registered in `app/server.ts` in the correct order

## See also

- `api-design` — routes consume plugin decorators (e.g. `fastify.db`)
- `stripe-payments` — the raw-body parser is the canonical scoping case
- `auth-jwt-cookies` — the auth plugin decorates verifyAccessToken
- `deployment` — registration order matters in production boot

## References

- Fastify v5 plugin docs: https://fastify.dev/docs/latest/Reference/Plugins/
- `@fastify/cors`, `@fastify/cookie` docs
- PRD §17 (deployment + CORS), §9 (auth), §15 (Stripe webhook)
- `apps/api/src/app/plugins/`
