---
name: drizzle-sqlite
description: Drizzle ORM + better-sqlite3 schema, migrations, and query patterns — UUIDv7 keys, epoch-ms timestamps, derived conversations query, Railway volume mount. Use when editing apps/api/src/db/{schema,client,migrate}.ts, files under apps/api/src/db/migrations/, apps/api/src/services/{messages,conversations,users,auth,payments}.ts, drizzle.config.ts, or running drizzle-kit. Required when designing the GET /api/conversations query, debugging migration failures on boot, or investigating SQLite-specific behavior.
---

# Database — Drizzle ORM + better-sqlite3

PRD §4 is the locked schema. Drizzle is the only DB layer in service code — no raw SQL except for `sql\`(unixepoch() * 1000)\`` in schema defaults.

## When to Use This Skill

- Editing `apps/api/src/db/schema.ts`
- Adding or reviewing a migration in `apps/api/src/db/migrations/`
- Writing a query (especially the derived conversations query)
- Working out the Railway volume / SQLite file-path setup
- Investigating a DB-related bug

## Quick Reference

| Concern               | Choice                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| **ORM**               | Drizzle (latest)                                                             |
| **Driver**            | better-sqlite3 (synchronous, fast, single-process)                            |
| **Primary keys**      | UUIDv7 (`text('id').primaryKey()`)                                            |
| **Timestamps**        | `integer('…', { mode: 'timestamp_ms' })` — epoch milliseconds                 |
| **Default now**       | `.default(sql\`(unixepoch() * 1000)\`)`                                       |
| **File location**     | Dev `file:./chat.db`; prod `file:/data/chat.db` (Railway volume mount)        |
| **Migrations**        | `drizzle-kit generate` commits SQL files; runner applies on boot             |
| **Online status**     | **Not in DB** — in-memory map on api; only `lastSeenAt` persisted on disconnect |

## Tables (PRD §4)

```
users               id, email (unique), password_hash, display_name, bio,
                    avatar_url, locale, is_pro, last_seen_at, created_at

messages            id, sender_id (fk users), recipient_id (fk users),
                    body, created_at, read_at
                    index (sender_id, recipient_id, created_at)

refresh_tokens      id (jti), user_id (fk users), token_hash (SHA-256),
                    expires_at, revoked_at, created_at

payments            id, user_id (fk users), stripe_payment_intent (unique),
                    amount, currency, status, created_at
```

## Conventions

- **UUIDv7** for primary keys via `uuidv7()` (the `uuidv7` package). Time-ordered, sortable, no collisions.
- **Epoch milliseconds** for all timestamps. Drizzle's `timestamp_ms` mode keeps these as `number` in TS.
- **No `email`/`password_hash` outside `users`** — the schema is intentionally simple.
- **No JSONB** — SQLite, and the schema doesn't need it.
- **Drizzle only** in service code. The only acceptable raw SQL is the `sql\`(unixepoch() * 1000)\`` default expression, and the derived conversations query (which may use a CTE).

## Schema Change Workflow

```bash
# 1. Edit apps/api/src/db/schema.ts
# 2. Generate migration
pnpm --filter=api exec drizzle-kit generate

# 3. Review the generated SQL in apps/api/src/db/migrations/
#    Commit both the schema and the migration.

# 4. Migrations apply automatically on boot via:
#    migrate(db, { migrationsFolder: './migrations' })
```

Never use `drizzle-kit push` in production — push skips the migration history and can drop data silently.

## Derived Conversations Query (PRD §7.3)

Conversations are not a table. For a current user, compute one row per partner with their latest message and unread count, ordered by latest message DESC.

One acceptable shape — two queries:

```ts
// 1. Distinct partner IDs and their latest message createdAt
const partners = db.select({
  partnerId: sql`CASE WHEN sender_id = ${currentUserId} THEN recipient_id ELSE sender_id END`.as('partner_id'),
  lastAt: sql`MAX(created_at)`.as('last_at'),
}).from(messages)
  .where(or(eq(messages.senderId, currentUserId), eq(messages.recipientId, currentUserId)))
  .groupBy(sql`partner_id`)
  .orderBy(sql`last_at DESC`)
  .all()

// 2. For each partner: latest message + unread count, joined with user info
//    Either a batched IN-query or a join. Either is acceptable per PRD §7.3.
```

A single-query CTE/window-function approach is also acceptable. Pick whichever reads cleaner; SQLite's planner handles both well at our scale.

## Common Patterns

```ts
// Insert with returning
const [user] = await db.insert(users).values({
  id: uuidv7(),
  email: input.email.toLowerCase(),
  passwordHash: await bcrypt.hash(input.password, 12),
  displayName: input.displayName,
}).returning()

// Pagination — DESC for messages, ?before=<timestamp>
const rows = db.select().from(messages)
  .where(and(
    or(
      and(eq(messages.senderId, userA), eq(messages.recipientId, userB)),
      and(eq(messages.senderId, userB), eq(messages.recipientId, userA)),
    ),
    before ? lt(messages.createdAt, before) : undefined,
  ))
  .orderBy(desc(messages.createdAt))
  .limit(limit ?? 50)
  .all()

// Mark read (single round-trip)
db.update(messages)
  .set({ readAt: Date.now() })
  .where(and(
    eq(messages.senderId, otherUserId),
    eq(messages.recipientId, currentUserId),
    isNull(messages.readAt),
  )).run()

// Idempotent payment upsert
db.insert(payments).values({ … }).onConflictDoNothing({ target: payments.stripePaymentIntent })
```

## Railway Volume (Production)

- Mount volume at `/data`.
- `DATABASE_URL=file:/data/chat.db`.
- SQLite file is portable; backups are just file copies.
- Single-instance write contention is fine for this demo's load; flag as a limitation in REPORT.md.

## Checklist

- [ ] UUIDv7 primary keys via `uuidv7()`
- [ ] Timestamps as `timestamp_ms` (epoch ms)
- [ ] Migrations generated, reviewed, committed, applied on boot
- [ ] No `drizzle-kit push` in prod
- [ ] Index on `messages (sender_id, recipient_id, created_at)` honored
- [ ] No `email` or `password_hash` columns outside `users`
- [ ] Stripe webhook upsert uses `onConflictDoNothing` keyed on `stripe_payment_intent`
- [ ] Online status NOT persisted; only `lastSeenAt` on disconnect

## See also

- `api-design` — for the routes that consume these queries
- `deployment` — for the Railway volume + `DATABASE_URL` setup
- `monorepo-contracts` — for how DB row shapes map to shared types

## References

- PRD §4 Data Model (Drizzle Schema)
- PRD §7.3 / §7.4 endpoints that read messages
- `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/migrate.ts`
