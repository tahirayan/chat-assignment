---
name: responsive-layout
description: Mobile-first responsive layout for the Chat app — AuthLayout vs AppLayout, mobile single-pane stack vs desktop split-pane at md (768px), BottomTabBar hide-on-/chat rule, sidebar/right-pane semantics, useBreakpoint composable. Use when editing layouts/AuthLayout.vue, layouts/AppLayout.vue, any file under components/layout/, the useBreakpoint composable, or any page that needs to behave differently between mobile and desktop.
---

# Responsive Layout — Mobile Stack + Desktop Split-Pane

The full layout architecture per PRD §11.1. Two layouts, one responsive
shell, one breakpoint. Build this early — every screen inherits it.

## When to Use This Skill

- Editing `apps/web/src/layouts/{AuthLayout.vue, AppLayout.vue}`
- Editing anything in `apps/web/src/components/layout/`
- Adding a new page and figuring out how it should behave at both viewports
- Investigating "this looks fine on desktop but broken on iPhone"
- Adding a new breakpoint-conditional UI element

## Quick Reference

| Concern              | Choice                                                           |
| -------------------- | ---------------------------------------------------------------- |
| **Breakpoint**       | `md` = 768px (Tailwind default)                                   |
| **Layouts**          | `AuthLayout` (only `/auth`), `AppLayout` (everything else)        |
| **Mobile shell**    | TopBar + router-view + BottomTabBar (hidden on `/chat/:userId`)  |
| **Desktop shell**   | TopBar + Sidebar + NavRail + router-view (right pane)             |
| **Sidebar**          | Always visible at `md+`; shows ConversationRow list (recents)     |
| **Empty right pane** | `EmptyState` "Select a conversation" at `/` on desktop            |
| **Height unit**     | `dvh` (handles mobile keyboard); never `vh`                       |
| **Safe areas**       | `env(safe-area-inset-bottom)` on BottomTabBar                     |

## The Two Layouts

### `AuthLayout` — used only for `/auth`

Centered card on a neutral background, full `dvh` height. No navigation
chrome — just the app logo and the form.

```vue
<template>
  <div class="min-h-dvh flex items-center justify-center bg-surface-subtle p-4">
    <div class="card w-full max-w-md">
      <slot />
    </div>
  </div>
</template>
```

### `AppLayout` — used for all authenticated routes

Adapts to viewport via `useBreakpoint()`. The router-view content doesn't
change shape — only the surrounding chrome.

```vue
<script setup lang="ts">
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useRoute } from 'vue-router'
const { isMobile } = useBreakpoint()
const route = useRoute()
const hideTabBar = computed(() => route.name === 'chat')
</script>

<template>
  <div class="h-dvh flex flex-col">
    <TopBar />

    <div v-if="isMobile" class="flex-1 overflow-hidden">
      <router-view />
    </div>

    <div v-else class="flex-1 grid grid-cols-[18rem_1fr] overflow-hidden">
      <Sidebar />
      <main class="overflow-auto">
        <router-view />
      </main>
    </div>

    <BottomTabBar v-if="isMobile && !hideTabBar"
                  class="pb-[env(safe-area-inset-bottom)]" />
  </div>
</template>
```

## The Decision Matrix (PRD §11.1)

| Route             | Mobile (< 768px)             | Desktop (≥ 768px) right pane                |
| ----------------- | ---------------------------- | ------------------------------------------- |
| `/` (Chats)       | Full-pane recents list        | `EmptyState` ("Select a conversation")       |
| `/community`      | Full-pane user grid           | User grid                                   |
| `/chat/:userId`   | Full-pane chat, **no tab bar** | Chat view (sidebar conversation highlighted) |
| `/profile`        | Full-pane form                | Form, `max-w-md` centered                    |
| `/upgrade`        | Full-pane form                | Form, `max-w-md` centered                    |

On desktop, the **sidebar is always present** showing the recents list. So
the right pane on `/` is not the list — it's an empty state. On
`/chat/:userId`, the sidebar item for the active partner is highlighted.

## `useBreakpoint` Composable

```ts
// apps/web/src/composables/useBreakpoint.ts
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

export function useBreakpoint() {
  const isMd = useMediaQuery('(min-width: 768px)')
  const isLg = useMediaQuery('(min-width: 1024px)')
  return {
    isMd,
    isLg,
    isMobile: computed(() => !isMd.value),
  }
}
```

`@vueuse/core` is the right primitive — SSR-safe, reactive, small. Don't
write your own `addEventListener('resize')` wrapper.

## Bottom Tab Bar — The Hide Rule

The tab bar shows: Chats · Community · Profile. On `/chat/:userId` it is
**hidden** so the message thread gets full vertical real estate.

Implementation: route-based, not store-based:

```ts
const route = useRoute()
const hideTabBar = computed(() => route.name === 'chat')
```

When the user taps Back from chat, the previously active tab is restored
naturally because the route history retains it.

## Sidebar Reuse

The same `ConversationRow.vue` component renders in:

- **Mobile** `ChatsView` body (the full-pane list)
- **Desktop** `Sidebar` (the persistent left rail)

Don't fork the component. If spacing differs, accept a `density` prop:

```vue
<ConversationRow :conversation="c" :density="isMobile ? 'comfortable' : 'compact'" />
```

## Why Two Panes, Not Three

PRD §11.1 documents this explicitly. Discord-style three-pane layout
(servers + channels + content) requires concepts not in scope for 1:1 chat.
A third "members" pane would duplicate information already in the online
dots on each ConversationRow + the Community tab.

Two panes (list + active) is the right pattern for 1:1 — same as WhatsApp
Web and Telegram Desktop.

## Tap Targets and Safe Areas

- **Minimum tap target**: 44×44 px (Apple HIG, Google Material guidance).
  Tailwind's `h-11` (44px) and `min-w-11` line up with this.
- **Safe area inset** on the BottomTabBar:
  ```html
  <nav class="pb-[env(safe-area-inset-bottom)]">…</nav>
  ```
  Without this, the home-indicator on notched iPhones overlaps the tabs.

## Heights

Use `dvh`, not `vh`:

- `vh` is the **largest** viewport height — including hidden browser chrome
  on mobile. Using it makes content go behind the toolbar.
- `dvh` is the **dynamic** viewport height — shrinks when the keyboard or
  toolbar appears. Use everywhere a full-screen container needs to fit the
  visible area.
- `100dvh` for AppLayout / AuthLayout root; `min-h-dvh` for centered
  containers.

## Test Discipline

The two-pane layout only becomes visible at `md+`. Test both regularly:

- **375px** — iPhone SE. Tab bar should be visible (except on chat). Tap
  targets ≥ 44 px.
- **1280px** — typical desktop. Sidebar always visible. Right-pane empty
  state on `/`.

Resize the browser across the 768 px boundary while on `/chat/:userId` —
the layout should swap without remounting the router-view (so message
scroll position is preserved).

## Anti-Pattern: Per-Page Responsive Logic

```vue
<!-- BAD — every page checks isMobile -->
<template>
  <div v-if="isMobile" class="mobile-grid">…</div>
  <div v-else class="desktop-split">…</div>
</template>
```

The router-view content shouldn't care about the layout. The layout wraps
it. If you find yourself writing `v-if="isMobile"` inside a page, that's a
signal the responsive split belongs in `AppLayout`, not the page.

The exception: route-conditional UI like the call buttons that show in the
TopBar only on `/chat/:userId` — this is route logic, not viewport logic.

## Anti-Pattern: vh Instead of dvh

```css
/* BAD — content hides behind iOS Safari toolbar */
.app-shell { height: 100vh; }

/* GOOD — adapts when toolbar shows/hides */
.app-shell { height: 100dvh; }
```

## Checklist

- [ ] `AuthLayout` used only on `/auth`; everything else uses `AppLayout`
- [ ] Mobile shell: TopBar + router-view + BottomTabBar
- [ ] Desktop shell: TopBar + Sidebar + router-view (right pane)
- [ ] BottomTabBar hidden on `/chat/:userId`
- [ ] Desktop `/` shows EmptyState in right pane (not the recents list)
- [ ] Selected conversation highlighted in desktop sidebar when on
      `/chat/:userId`
- [ ] `dvh` used for full-height containers (never `vh`)
- [ ] `env(safe-area-inset-bottom)` padding on BottomTabBar
- [ ] Tap targets ≥ 44×44 px
- [ ] `useBreakpoint().isMobile` checked at the layout level, not in pages
- [ ] Tested at 375 px and 1280 px

## See also

- `vue-frontend` — for `<script setup>`, Pinia, Tailwind theme conventions
  that the layout sits on top of
- `i18n-vue-i18n` — for tab labels and TopBar copy
- `pwa-and-install` — for the install banner placement, which respects the
  same safe-area inset
