---
name: vue-frontend
description: Vue 3 + Pinia setup-stores + Tailwind 4 conventions — script-setup only, defineStore with composition syntax, storeToRefs for destructuring, OKLCH brand tokens, loading/empty/error trio on every async surface, optimistic-UI rule (sends only). Use when editing files under apps/web/src/{components,pages,stores,composables,styles}/, when adding a new Pinia store, or when adding a Tailwind component class to theme.css. For layout-specific concerns (mobile stack vs desktop split-pane, BottomTabBar, sidebar) use responsive-layout instead.
---

# Vue Frontend — Vue 3 + Pinia + Tailwind 4

The frontend conventions per PRD §10–§12 and §24. Mobile-first, responsive at `md:` (768px) with a desktop split-pane.

## When to Use This Skill

- Building or reviewing a component, page, or store in `apps/web`
- Adding a Pinia store
- Tailwind theme questions or adding component classes to `theme.css`
- Loading/empty/error state discipline on a new async surface

For mobile-stack-vs-desktop-split-pane, BottomTabBar rules, and viewport
breakpoint logic, use `responsive-layout` instead.

## Quick Reference

| Concern              | Choice                                                                |
| -------------------- | --------------------------------------------------------------------- |
| **Component style** | `<script setup lang="ts">` — always. No Options API.                  |
| **Stores**          | Pinia setup-store — `defineStore('name', () => { … })`                |
| **Destructure**     | `storeToRefs` when pulling reactive state out of a store              |
| **Type quality**    | No `any`. `unknown` + narrowing.                                      |
| **Layout primitive** | Tailwind utility classes                                              |
| **Repeated pattern** | Component class (`btn-primary`, `input`, `card`) in `theme.css`       |
| **Theme tokens**    | OKLCH colors via Tailwind 4 `@theme` block in `styles/theme.css`      |
| **Async UI**        | Always provide LoadingState + EmptyState + ErrorState                  |
| **Optimistic UI**   | Sends only (with clientId reconciliation); reads show loading         |

## Component Conventions

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{ otherUserId: string }>()
const emit = defineEmits<{ (e: 'send', body: string): void }>()

const chatStore = useChatStore()
const { messagesByUser } = storeToRefs(chatStore)
const messages = computed(() => messagesByUser.value.get(props.otherUserId) ?? [])
</script>

<template>
  <!-- Tailwind for layout; component class for repeated patterns -->
  <div class="flex flex-col h-dvh">
    <button class="btn-primary">Send</button>
  </div>
</template>
```

Rules:

- **No Options API**, ever.
- **`defineProps<T>()`** with a TS interface, not the runtime object form.
- **`defineEmits<{...}>()`** with the type-only signature.
- **Don't use `ref()`** for primitives that never change. `const` is fine.
- **Lift business logic** out of `<script setup>` into composables (`composables/useFoo.ts`) or stores.

## Pinia Setup-Store Conventions

```ts
// stores/chat.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, Conversation } from '@chat/shared-types'

export const useChatStore = defineStore('chat', () => {
  // state
  const messagesByUser = ref<Map<string, Message[]>>(new Map())
  const conversations = ref<Conversation[]>([])
  const typingByUser = ref<Map<string, boolean>>(new Map())

  // getters
  const totalUnread = computed(() =>
    conversations.value.reduce((sum, c) => sum + c.unreadCount, 0)
  )

  // actions
  function addMessage(msg: Message) {
    // PRD §24 note 16 — single atomic action that updates messages,
    // conversations entry, and ordering.
    const partnerId = msg.senderId === currentUserId ? msg.recipientId : msg.senderId
    const list = messagesByUser.value.get(partnerId) ?? []
    messagesByUser.value.set(partnerId, [...list, msg])
    updateOrInsertConversation(partnerId, msg)
    moveConversationToTop(partnerId)
  }

  return { messagesByUser, conversations, typingByUser, totalUnread, addMessage }
})
```

Rules:

- **Always setup-store** — never options-store form.
- **State**: `ref`/`reactive`.
- **Getters**: `computed`.
- **Actions**: plain functions.
- **Invariants** that span multiple state fields (e.g. PRD §24 note 16) live in a single action.

## Layout

The responsive shell (mobile stack vs desktop split-pane), `useBreakpoint`,
BottomTabBar hide-on-chat, and the page-vs-layout decision rules live in the
**`responsive-layout`** skill. This skill stays focused on `<script setup>`,
Pinia, theme, and async-state discipline.

The only thing to remember here: **don't put `v-if="isMobile"` inside a
page**. If you need viewport-conditional structure, push it up to
`AppLayout`. The router-view content shouldn't care about layout.

## Tailwind 4 Theme

```css
/* styles/theme.css */
@import "tailwindcss";

@theme {
  --color-brand-500: oklch(0.58 0.20 250);    /* primary */
  /* …rest of the ramp + semantic colors + radii + shadows (PRD §12.1) */
}

@layer components {
  .btn { @apply inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg font-medium transition; }
  .btn-primary { @apply btn bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700; }
  .input { @apply w-full h-11 px-3 rounded-lg border border-border bg-surface-subtle outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20; }
  .card  { @apply bg-surface rounded-xl shadow-[var(--shadow-card)] p-4; }
}
```

- **OKLCH** for perceptual uniformity. Don't introduce hex colors.
- **Inter Variable** as the sans font.
- **No CSS-in-JS** libraries; Tailwind 4 + custom component classes is the whole story.

## Loading / Empty / Error States

Every async surface must have all three. Use the shared components from `components/ui/`:

- `LoadingState.vue` — replaces raw "Loading…" text
- `EmptyState.vue` — replaces "No results" text
- `ErrorState.vue` — for fetch failures with retry CTA

PRD §12.3 is non-negotiable on this.

## Optimistic UI Rule

**Sends only.** Reads (history fetch, user list, conversations) show a loading state. The `message:send` flow:

1. Generate a client-side `clientId` (UUID).
2. Insert the temp message into `messagesByUser[partnerId]` immediately.
3. Emit `message:send` with the `clientId`.
4. On `message:delivered { clientId, id, createdAt }`, swap the temp message's `id` and `createdAt` for the server values.

## Path Aliases

```ts
// vite.config.ts
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
}
```

Imports from shared libs use the project aliases:

```ts
import type { Message } from '@chat/shared-types'
import { sendMessageInput } from '@chat/shared-contracts'
```

**Never** `import { Message } from '../../../../libs/shared-types/...'` across project boundaries — Ultracite + the boundary script will reject this.

## Vue Template Rules (from Ultracite)

- **`class` and `for`** are the Vue/Solid/Svelte attribute names — never use
  React's `className` / `htmlFor`. Biome won't catch this for you because
  the templates are valid Vue regardless; you must remember.
- **`key` prop on `v-for`** elements — prefer stable unique IDs over array
  indices. `v-for="msg in messages" :key="msg.id"`, not `:key="index"`.
- **Semantic HTML** with ARIA — `<button>`, `<nav>`, `<main>`, proper
  heading hierarchy, alt text on images, labels on form inputs, keyboard
  handlers alongside mouse ones.

## Code-Standards Rules (from Ultracite — apply to `<script setup>` too)

These are the high-leverage ones; see `.claude/skills/ultracite/` for the
full list.

- **No `console.log`, `debugger`, or `alert`** in shipped code. Use
  `fastify.log` server-side and toast notifications client-side.
- **Throw `Error` objects** with descriptive messages, not strings:
  ```ts
  throw new Error(`Unknown locale: ${locale}`)   // ✓
  throw `Unknown locale: ${locale}`              // ✗
  ```
- **Early returns** over nested conditionals.
- **Extract complex conditions** into named boolean variables.
- **Prefer specific imports** over namespace imports
  (`import { ref } from 'vue'`, not `import * as Vue from 'vue'`).
- **Top-level regex literals** — don't create `new RegExp(...)` inside a
  loop body.

## Checklist

- [ ] `<script setup lang="ts">` on every `.vue` file
- [ ] Pinia setup-store form, no Options API anywhere
- [ ] `storeToRefs` used when destructuring state
- [ ] No `any` — use `unknown` + narrowing
- [ ] `class` and `for` (not `className`/`htmlFor`) — Vue not React
- [ ] `:key` on every `v-for` element, prefer stable IDs
- [ ] Tailwind for layout; component classes for repeated patterns
- [ ] Async surfaces have LoadingState + EmptyState + ErrorState
- [ ] Optimistic UI used only for sends (with `clientId` reconciliation)
- [ ] Imports from shared libs use `@chat/shared-*` aliases, not relative paths
- [ ] No `console.log`/`debugger`/`alert` left in code

(For viewport / layout / breakpoint checks, see `responsive-layout`.)

## See also

- `ultracite` — full code-standards reference (the upstream Ultracite skill)
- `responsive-layout` — for the AppLayout matrix and breakpoint discipline
- `i18n-vue-i18n` — for the `t()` rule and date formatting
- `avatar-pipeline` — for the canvas pipeline used in ProfileView
- `socket-events` — for the chat store invariant on `message:new`

## References

- PRD §10 Frontend Architecture, §11 Screen Specifications, §12 Design System
- PRD §24 notes 5–14 (frontend implementation rules)
- `apps/web/src/styles/theme.css`
- `apps/web/src/components/ui/`
