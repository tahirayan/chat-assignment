---
name: i18n-vue-i18n
description: vue-i18n v11 composition mode — EN/TR/ET locale files, detection order (localStorage → navigator.language → 'en'), server-stored locale wins on bootstrap, Intl.DateTimeFormat + Intl.RelativeTimeFormat for dates/relative times. Use when editing apps/web/src/i18n/index.ts, apps/web/src/locales/{en,tr,et}.json, the locale switcher in apps/web/src/pages/ProfileView.vue, when adding any user-facing string (must have an `en.json` key), or when formatting a date in any component.
---

# i18n — vue-i18n (composition mode)

Three locales per PRD §14: English (canonical), Turkish (hand-written by Tahir), Estonian (DeepL-drafted, flagged as best-effort).

## When to Use This Skill

- Adding a translation key
- Touching `apps/web/src/i18n/index.ts` or `apps/web/src/locales/*.json`
- Working on the locale switcher in `ProfileView`
- Formatting a date or relative time

## Quick Reference

| Concern             | Choice                                                              |
| ------------------- | ------------------------------------------------------------------- |
| **Library**         | `vue-i18n` v11                                                       |
| **Mode**            | `legacy: false` (composition API)                                    |
| **Locales**         | `'en' \| 'tr' \| 'et'` — type from `@chat/shared-types`               |
| **Detection order** | localStorage → `navigator.language[:2]` → fallback `en`              |
| **Persistence**     | localStorage + PATCH `/api/users/me { locale }` on change            |
| **Server wins**     | On next bootstrap, server-stored locale overrides localStorage       |
| **Date formatting** | `Intl.DateTimeFormat(locale, opts)` — wired via i18n `datetimeFormats` |
| **Relative time**   | `Intl.RelativeTimeFormat(locale)`                                    |

## Setup (PRD §14.1)

```ts
// apps/web/src/i18n/index.ts
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import tr from '@/locales/tr.json'
import et from '@/locales/et.json'
import type { Locale } from '@chat/shared-types'

const SUPPORTED: Locale[] = ['en', 'tr', 'et']

function detectInitial(): Locale {
  const stored = localStorage.getItem('locale') as Locale | null
  if (stored && SUPPORTED.includes(stored)) return stored
  const browser = navigator.language.split('-')[0] as Locale
  return SUPPORTED.includes(browser) ? browser : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectInitial(),
  fallbackLocale: 'en',
  messages: { en, tr, et },
  datetimeFormats: {
    en: { short: { day: 'numeric', month: 'short' }, long: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } },
    tr: { /* same shapes */ },
    et: { /* same shapes */ },
  },
})
```

## Locale Change Flow

1. User picks new locale in `ProfileView`.
2. `i18n.global.locale.value = newLocale`.
3. `localStorage.setItem('locale', newLocale)`.
4. PATCH `/api/users/me { locale: newLocale }` — server persists.
5. On the next bootstrap, server-stored locale overrides the localStorage value.

## Translation Key Conventions

Namespace by feature, single source of truth:

```
auth.title
auth.login.email
auth.login.password
auth.register.displayName
auth.errors.invalidCredentials
auth.errors.emailTaken

chat.compose.placeholder
chat.typing                          // "{name} is typing…"
chat.empty.title
chat.empty.cta

community.empty.title
community.search.placeholder

profile.section.account
profile.section.preferences
profile.locale.label
profile.upgradeCta
profile.logout

call.incoming                        // "Incoming call from {name}"
call.connecting
call.ended
call.controls.mute
call.controls.unmute
call.controls.cameraOn
call.controls.cameraOff
call.controls.end

avatar.uploadLabel                   // "Change photo"
avatar.errors.fileTooLarge
avatar.errors.unsupportedFormat
avatar.errors.decodeFailed
avatar.errors.resultTooLarge

common.save
common.cancel
common.loading
common.retry
common.back
```

Use **dot-namespaced** keys. Don't dump everything into a flat object.

## Date & Time Formatting

```ts
const { d, t } = useI18n()

// Date — uses datetimeFormats from i18n config
d(new Date(message.createdAt), 'short')              // "5 May"
d(new Date(message.createdAt), 'long')               // "5 May 2026, 14:23"

// Relative — use Intl.RelativeTimeFormat directly
const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
rtf.format(-2, 'minute')                             // "2 minutes ago" / "2 dakika önce" / "2 minutit tagasi"
```

For the "Online now" / "last seen X ago" UI, wrap `RelativeTimeFormat` in a small composable so locale changes trigger reactivity (`useNow()` from `@vueuse/core` + `computed`).

## Pluralization

vue-i18n supports the `| ` separator:

```json
{
  "chat": {
    "unread": "no unread messages | 1 unread message | {count} unread messages"
  }
}
```

```ts
t('chat.unread', { count: n }, n)
```

Use sparingly — Turkish and Estonian don't always need all three forms but it's the safe pattern.

## Audit Rule

**No hardcoded English strings in `.vue` files**, except:

- Loading skeleton placeholders that are visually masked
- Console logs (dev only)
- Test files

Run a grep over `apps/web/src` for English-only words during the Phase 11 translation pass.

## Estonian Caveat

ET translations are DeepL-drafted, not native. Note this in `README.md` and `REPORT.md` under "Known limitations". A native speaker pass is the obvious follow-up.

## Checklist

- [ ] Every new user-facing string has a key in `en.json` first
- [ ] TR + ET translations added in the same PR for any new key (Phase 11+) or noted as TODO if EN-only is shipping first
- [ ] Date formatting uses `d(date, 'short' | 'long')`, not raw `Date.prototype.toLocaleString`
- [ ] Relative time uses `Intl.RelativeTimeFormat` with the current locale
- [ ] Locale switch immediately re-renders the UI (composition mode → reactive `locale` ref)
- [ ] PATCH `/api/users/me { locale }` fires on every change

## See also

- `vue-frontend` — for the component conventions that wrap `t()` calls
- `avatar-pipeline` — for the four `avatar.errors.*` keys
- `responsive-layout` — for tab/topbar labels and safe-area handling

## References

- PRD §14 Internationalization
- vue-i18n v11 docs: https://vue-i18n.intlify.dev/
- `apps/web/src/i18n/index.ts`
- `apps/web/src/locales/{en,tr,et}.json`
