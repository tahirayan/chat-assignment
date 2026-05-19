# Chat — Project Rules for Claude Code

This file is auto-loaded into every Claude Code session in this repo. It sets
the rules and conventions specific to this project. For the canonical
**generic** JS/TS code standards (type-safety, modern syntax, async patterns,
React/Vue/Solid framework rules, accessibility, security, performance), see
`.claude/skills/ultracite/SKILL.md` and `.claude/skills/ultracite/references/code-standards.md`.

When the user asks you to do something, follow this priority order:

1. **Direct user instruction** (this conversation) — highest priority
2. **Project rules** (this file + PRD.md + PLAN.md) — override defaults
3. **Generic code standards** (`.claude/skills/ultracite/`) — apply unless this
   file or PRD/PLAN says otherwise

## Read These First

- **`PRD.md`** (v1.2, locked) — the product spec. Single source of truth for
  *what* to build and *how it behaves*.
- **`PLAN.md`** — the phased build sequence. Use it to know which phase the
  current work belongs to and what the exit criteria are.

If a request is ambiguous, the PRD and PLAN are the tiebreakers. If a
request conflicts with PRD §1.4 (Non-goals), surface that to the user
before implementing.

## Tech Stack (Locked — Do Not Substitute)

| Layer        | Choice                              |
| ------------ | ----------------------------------- |
| Monorepo     | Nx 22 + pnpm                        |
| Frontend     | Vue 3.5 (script-setup) + Pinia 3    |
| Build        | Vite 7+                             |
| Styling      | Tailwind 4 (CSS-first `@theme`)     |
| Router       | vue-router 4                        |
| i18n         | vue-i18n 11 (composition mode)      |
| State        | Pinia 3 setup-stores (never options) |
| HTTP         | axios with single-flight refresh    |
| Backend      | Fastify 5 + socket.io 4.8           |
| ORM          | Drizzle ORM                         |
| Database     | SQLite (better-sqlite3)             |
| Auth         | JWT (jose) + bcrypt cost 12          |
| Validation   | Zod 4 (`z.email()`, `z.url()`, `z.uuid()` are standalone) |
| Payments     | Stripe Payment Element              |
| Linter       | **Ultracite** (Biome 2). No ESLint, no Prettier. |
| Tests        | Vitest                              |

## Workspace Layout

```
apps/
  web/                    scope:web, type:app       Vue + Vite
  api/                    scope:api, type:app       Fastify + Socket.io
libs/
  shared-types/           scope:shared, type:types      plain TS, no runtime deps
  shared-contracts/       scope:shared, type:contracts  Zod schemas
tools/
  check-boundaries.mjs                              Nx-graph module-boundary enforcement
.claude/
  agents/                 5 project agents
  skills/                 23 project + tool skills
  settings.json
PRD.md, PLAN.md
biome.jsonc, tsconfig.base.json, nx.json
```

## Project Rules

### Architecture

- **Apps may only import from `@chat/shared-*`.** Never `apps/web` ↔
  `apps/api`. Never deep-relative across project boundaries. Enforced by
  Biome `noRestrictedImports` and `tools/check-boundaries.mjs`.
- **`shared-types` has zero runtime deps.** No `zod`. No
  `@chat/shared-contracts`. Pure types only.
- **`shared-contracts` depends on `shared-types`**, never the reverse.

### Vue / Frontend

- **`<script setup lang="ts">` on every component.** No Options API.
- **Pinia setup-stores only.** `defineStore('name', () => { … })`. Use
  `storeToRefs` when destructuring reactive state.
- **No `any`.** Use `unknown` and narrow.
- **Loading + Empty + Error** on every async surface (use shared
  `LoadingState` / `EmptyState` / `ErrorState` components).
- **Optimistic UI for sends only.** Reads show a loading state.
- **Vue uses `class` and `for`** (not `className` or `htmlFor`).
- **Mobile-first.** Default styles target mobile; `md:`/`lg:` to expand.
  Tap targets ≥ 44×44 px. Use `dvh` not `vh`.
- **Tailwind for layout; component classes** (`btn-primary`, `input`,
  `card`) for repeated patterns. Don't write a 40-class string when a
  component class exists.
- **Path aliases only** (`@chat/shared-types`, `@chat/shared-contracts`).
  Never deep relative imports across project boundaries.

### Fastify / Backend

- **Plugins that decorate `fastify` use `fastify-plugin`** with a `name`.
  Augment `FastifyInstance` types via `declare module 'fastify'` in the
  same file.
- **Routes use `fastify-type-provider-zod`.** Register
  `schema.body`/`querystring`/`params`/`response` on every route.
- **Raw-body parser scoped to `/api/stripe-webhook` only.** Never global.
- **Domain errors** thrown from `apps/api/src/lib/errors.ts`. No ad-hoc
  `reply.code(...)` in handlers.

### Real-time

- **All event names + payload types from `libs/shared-types/src/lib/socket-events.ts`.**
  Never inline-type a socket payload.
- **Server validates every C→S payload** with the matching Zod schema.
- **`socket.data.userId` is authority.** Never trust a client-supplied
  `senderId` / `fromUserId` for authorization.
- **The `chat` store invariant** (PRD §24 note 16): on `message:new`,
  append-to-thread + update-conversation + move-to-top must happen in
  **one** action.

### WebRTC

- **Single `endCall()` exit path.** Every terminal state routes through it.
- **Stop tracks before `pc.close()`.** Both local and remote streams.
- **`<video playsinline autoplay>`** on every remote and local tile (iOS Safari).
- **Camera/mic indicator off after hangup** is the demo-killer test.

### Auth

- **Access tokens in Pinia memory only** — never localStorage.
- **Refresh tokens HttpOnly + SHA-256 hashed + rotated on every use.**
  Path `/api/auth`, SameSite=Lax (first-party via Netlify rewrites).
- **bcrypt cost 12** with timing-safe compare + min-response-time on login.
- **Generic error messages** on auth failures (no user enumeration).
- **Axios refresh interceptor:** exclude `/auth/*`, mark `_retry`,
  single-flight.

### Stripe

- **Webhook signature verified against the raw Buffer**, not parsed JSON.
- **Idempotent insert** into `payments` via `ON CONFLICT DO NOTHING` keyed
  on `stripe_payment_intent`.
- **`isPro` flip only after verified `payment_intent.succeeded`.**

### General

- **No bare `try/catch` that swallows errors.** Handle it (toast / retry)
  or rethrow.
- **No `console.log`/`debugger`/`alert`** in shipped code.
- **No secrets in code, logs, or error responses.**
- **No comments unless WHY is non-obvious.** Don't restate what code does.
- **Test discipline:** Vitest priorities are Zod schemas, `lib/password.ts`,
  `lib/jwt.ts`. Skip UI component tests.

## Commands (npm scripts)

```bash
pnpm install                      # install workspace deps
pnpm graph                        # nx project graph in browser
pnpm lint                         # ultracite check (read-only)
pnpm format                       # ultracite fix (write fixes)
pnpm format:check                 # ultracite check (CI mode)
pnpm boundaries                   # node tools/check-boundaries.mjs
pnpm build                        # nx run-many -t build
pnpm test                         # nx run-many -t test
pnpm typecheck                    # nx run-many -t typecheck
pnpm doctor                       # ultracite doctor (diagnose setup)
```

## Agents and Skills

Project-specific agents in `.claude/agents/`:

- **`prd-keeper`** — scope/phase clarification against PRD + PLAN
- **`code-reviewer`** — quality + security + contract sync review
- **`realtime-specialist`** — Socket.io + WebRTC domain expert
- **`debugger`** — root cause + minimal fix
- **`pr-opener`** — conventional commits + PR workflow

Browse `.claude/skills/` for 23 skills covering auth, sockets, WebRTC,
Drizzle/SQLite, Vue, Pinia, i18n, PWA, Stripe, deployment, monorepo
contracts, responsive layout, and Ultracite. Each skill names the file
paths it applies to so auto-invocation triggers correctly.

## When in Doubt

- "Is this in scope?" → use the `prd-keeper` agent (PRD §1.2 + §1.3 + §1.4)
- "Is this safe?" → consult `.claude/skills/security/SKILL.md`
- "How do I name a commit/PR?" → see `.claude/skills/create-pr/SKILL.md`
- "I'm debugging X" → use the `debugger` agent — it has a common-bugs table
- Any change to socket events, WebRTC, presence → `realtime-specialist`
