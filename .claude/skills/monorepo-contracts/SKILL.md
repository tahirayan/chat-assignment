---
name: monorepo-contracts
description: Shared-types and shared-contracts discipline for the Chat app — the one-way dependency rule (contracts → types), the contract-sync rule (ripple to both apps in the same PR), and the path-alias convention (@chat/shared-*). Use when adding or changing anything in libs/shared-types or libs/shared-contracts, when reviewing a PR that touches either, or when an import in apps/web or apps/api drifts from the alias path.
---

# Monorepo Contracts — `shared-types` and `shared-contracts`

Two shared libraries, one rule each. The whole web↔api type story flows
through these — get them wrong and you have client/server drift bugs that
TypeScript can't catch.

## When to Use This Skill

- Adding or changing any file under `libs/shared-types/src/`
- Adding or changing any file under `libs/shared-contracts/src/`
- Reviewing a PR diff that touches either lib
- Wiring a new import in `apps/web` or `apps/api` from a shared lib

## Quick Reference

| Lib                 | Contains                                                          | Dependencies allowed                |
| ------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `@chat/shared-types`  | Plain TS types — `User`, `Message`, `Conversation`, socket payload shapes, event-name consts | **None** (zero runtime deps)        |
| `@chat/shared-contracts` | Zod schemas with their `z.infer<>` types                          | `zod` + `@chat/shared-types`         |

## The Two Rules

### Rule 1 — One-way dependency

```
shared-contracts ──depends on──▶ shared-types
        ▲                              │
        │                              │
        └────── never ◀────────────────┘
```

- `shared-types` is **the base** — pure types, no runtime imports, not even
  `zod`. It compiles to nothing at runtime.
- `shared-contracts` may import from `shared-types` when a Zod schema
  describes a shape that the type system already names (e.g. a Zod schema
  for `MessageSendPayload`).
- `shared-types` **never** imports from `shared-contracts`. Reversing this
  pulls Zod into the type layer and into every consumer that only needs
  shapes.

Enforced by `tools/check-boundaries.mjs` (rule: `type:types` cannot depend
on `type:contracts`) and by the per-project `noRestrictedImports` overrides
in `biome.jsonc`.

### Rule 2 — Contract sync ripples in one PR

If a `libs/shared-*` change isn't consumed by both apps in the same PR,
runtime drift can hide behind type errors that only fire when the consumer
finally updates. **Always** in one PR:

- New socket event name + payload type → server handler + client emitter
- New Zod schema → server route validation + client form (VeeValidate or
  composable)
- Changed `User`/`Message`/`Conversation` shape → server query response +
  client store consumer

The PR diff should touch `apps/web` **and** `apps/api` for any change to
`libs/shared-*`, or explicitly note "consumer updates in PR #N".

## Where Each Thing Lives

```
libs/shared-types/src/
├── lib/
│   ├── user.ts              ← User, PublicUser, Locale
│   ├── message.ts           ← Message
│   ├── conversation.ts      ← Conversation (derived, not stored)
│   ├── call.ts              ← CallType, CallState, CallEndReason
│   └── socket-events.ts     ← CLIENT_EVENTS, SERVER_EVENTS consts + payload types
└── index.ts                 ← re-exports everything

libs/shared-contracts/src/
├── lib/
│   ├── auth.ts              ← loginInput, registerInput
│   ├── user.ts              ← updateProfileInput
│   ├── message.ts           ← sendMessageInput
│   └── payment.ts           ← createPaymentIntentInput
└── index.ts                 ← re-exports everything
```

## Path Aliases

```ts
// tsconfig.base.json
{
  "compilerOptions": {
    "paths": {
      "@chat/shared-types": ["libs/shared-types/src/index.ts"],
      "@chat/shared-contracts": ["libs/shared-contracts/src/index.ts"]
    }
  }
}
```

Imports always use the alias:

```ts
// GOOD
import type { Message, User } from '@chat/shared-types'
import { sendMessageInput } from '@chat/shared-contracts'

// BAD — these will be caught by Biome + the boundary script
import type { Message } from '../../../libs/shared-types/src/lib/message'
import { sendMessageInput } from '../../../../libs/shared-contracts/src/lib/message'
```

## Conventions

### `shared-types`

- **`type` over `interface`** when the value is purely a shape (no
  declaration merging needed). Both compile equivalently; consistency matters
  more.
- **Export from `index.ts`**. Never import from internal paths
  (`@chat/shared-types/lib/user` is wrong).
- **Constants as `as const`** for event-name maps:
  ```ts
  export const CLIENT_EVENTS = {
    MESSAGE_SEND: 'message:send',
    // …
  } as const
  ```
- **No `any`.** Use `unknown` and let consumers narrow.

### `shared-contracts`

- **Always export both the schema and the type**:
  ```ts
  export const loginInput = z.object({ … })
  export type LoginInput = z.infer<typeof loginInput>
  ```
- **Coerce + normalize at the boundary**:
  ```ts
  z.string().email().toLowerCase().trim()
  ```
- **Hard length limits** on every string field — never `z.string()` alone.
- **Server-side defense** — schemas have ceilings even if the client also
  enforces them (e.g. `avatarUrl` max 150,000 chars on top of the client's
  100,000-char guard).

## Anti-Pattern: Type Drift via Inline Shapes

```ts
// BAD — apps/web/src/composables/useSocket.ts
socket.on('message:new', (msg: { id: string; body: string }) => {
  // …client-only shape; will silently disagree with server when fields change
})

// GOOD
import type { Message } from '@chat/shared-types'
socket.on('message:new', (msg: Message) => {
  // …
})
```

Inline shapes are how client/server contracts diverge. The whole reason for
`shared-types` is to make this kind of "I'll just inline it here" feel wrong.

## Anti-Pattern: Reversed Dependency

```ts
// BAD — libs/shared-types/src/lib/message.ts
import { sendMessageInput } from '@chat/shared-contracts'      // ← rejected
import type { z } from 'zod'                                    // ← also wrong here

export type Message = z.infer<typeof sendMessageInput>
```

```ts
// GOOD — libs/shared-types/src/lib/message.ts (pure type)
export interface Message {
  id: string
  senderId: string
  recipientId: string
  body: string
  createdAt: number
  readAt: number | null
}

// libs/shared-contracts/src/lib/message.ts (depends on types lib if needed)
import { z } from 'zod'
import type { Message } from '@chat/shared-types'

export const sendMessageInput = z.object({
  recipientId: z.string().uuid(),
  body: z.string().min(1).max(2000).trim(),
  clientId: z.string(),
})
```

## Contract Change Workflow

When changing a shape that both apps consume:

1. Edit the type in `shared-types` (or add the Zod schema in
   `shared-contracts`).
2. Update **the server** consumer (route handler / socket handler / repo).
3. Update **the client** consumer (store action / form / composable).
4. Run `pnpm exec nx run-many -t test build` — catches the obvious
   compile errors.
5. Manual test: two browser profiles, exercise the changed surface.
6. Open one PR with all three apps' changes together.

If you can't ripple in one PR (e.g. you're staging a multi-step migration),
add a discriminator field and keep the old shape valid for one release.
Avoid breaking changes without an explicit migration plan.

## Checklist

- [ ] No imports from `@chat/shared-contracts` inside `libs/shared-types`
- [ ] No deep-relative imports across project boundaries
- [ ] Every Zod schema exports its `z.infer<>` type
- [ ] Every shared `interface`/`type` is exported from the lib's `index.ts`
- [ ] String fields have hard length limits in their Zod schemas
- [ ] Server-side schema ceilings are looser than client guards (defense in
      depth)
- [ ] Any shape change is consumed by both `apps/web` and `apps/api` in the
      same PR (or explicitly tracked as a multi-PR migration)

## See also

- `api-design` — for how schemas attach to Fastify routes
- `socket-events` — for the socket-events.ts contract and its consumers
- `ultracite-lint` — for the `noRestrictedImports` + boundary script that
  enforce these rules
