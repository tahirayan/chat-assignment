---
name: avatar-pipeline
description: Client-side avatar pipeline — 10 MB pre-decode guard, MIME allow-list, Image+ObjectURL decode, 256×256 center-crop canvas, JPEG q=0.85, 100 KB post-encode guard; deterministic-color initials fallback in UserAvatar.vue; Zod 150,000-char server ceiling. Use when editing apps/web/src/composables/useAvatarUpload.ts, apps/web/src/components/ui/UserAvatar.vue, the avatarUrl field in libs/shared-contracts/src/lib/user.ts, or the avatar input in apps/web/src/pages/ProfileView.vue.
---

# Avatar Upload Pipeline

PRD §11.9 in skill form. Client-side canvas pipeline → JPEG data URL → stored directly in `users.avatar_url`. No bucket, no server-side image processing.

## When to Use This Skill

- Implementing or changing `apps/web/src/composables/useAvatarUpload.ts`
- Working on the `UserAvatar` component (data URL + deterministic-color initials fallback)
- Touching the `updateProfileInput.avatarUrl` Zod schema
- Wiring the avatar input in `ProfileView`

## Why This Approach

Storing data URLs in SQLite is unusual but right for this demo:

- Zero infrastructure (no S3/R2, no signed URLs, no presigned uploads, no MIME proxying)
- Works on Railway's volume-backed SQLite
- 8–25 KB per avatar (JPEG q=0.85 at 256×256)
- Flag in `REPORT.md` that the production move is S3/R2 + signed URLs

## Quick Reference

| Constraint                    | Value                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| Accepted MIME types           | `image/jpeg`, `image/png`, `image/webp`                                  |
| Output format                 | `image/jpeg` (re-encoded from any input)                               |
| Output dimensions             | 256×256 px, center-cropped                                              |
| Output JPEG quality           | 0.85                                                                   |
| Max input file size           | 10 MB (pre-decode guard — prevents OOM on mobile)                       |
| Max output data URL length    | 100,000 chars (~75 KB binary)                                           |
| Server-side schema max length | 150,000 chars (Zod, headroom for tolerance)                             |

## Composable: `useAvatarUpload`

```ts
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_DATA_URL_LENGTH = 100_000

async function pickAndProcess(file: File): Promise<{ dataUrl: string } | { error: string }> {
  // 1. Pre-decode size guard (don't OOM on a 50MB raw camera image)
  if (file.size > MAX_FILE_BYTES) return { error: 'avatar.errors.fileTooLarge' }

  // 2. MIME allow-list (defense — extension can lie, but type from File works on modern browsers)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { error: 'avatar.errors.unsupportedFormat' }
  }

  // 3. Decode via Image + object URL (works on all mobile browsers)
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode failed'))
      img.src = objectUrl
    })
  } catch {
    URL.revokeObjectURL(objectUrl)
    return { error: 'avatar.errors.decodeFailed' }
  }

  // 4. Center-crop to square, resize to 256×256
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  const sourceSize = Math.min(img.width, img.height)
  const sx = (img.width - sourceSize) / 2
  const sy = (img.height - sourceSize) / 2
  ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size)
  URL.revokeObjectURL(objectUrl)

  // 5. Encode as JPEG at 0.85
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

  // 6. Post-encode size guard (rare — extremely complex photos can blow the budget)
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return { error: 'avatar.errors.resultTooLarge' }
  }

  return { dataUrl }
}
```

## ProfileView Wiring

The avatar is staged in the form's local `draft` state — it only persists when the user clicks Save (no auto-save). This matches the rest of the profile form behavior.

```ts
async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isProcessing.value = true
  const result = await pickAndProcess(file)
  isProcessing.value = false
  if ('error' in result) {
    toast.error(t(result.error))
    return
  }
  draft.value.avatarUrl = result.dataUrl
}
```

A hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` is triggered by clicking the avatar.

## Default Avatar — `UserAvatar` Component

When `user.avatarUrl` is null, render a colored circle with initials:

```ts
function hueFromUserId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

const initials = computed(() => (props.user.displayName || '?').charAt(0).toUpperCase())
const bgColor = computed(() => `oklch(0.7 0.1 ${hueFromUserId(props.user.id)})`)
```

```vue
<template>
  <img v-if="user.avatarUrl" :src="user.avatarUrl" :alt="user.displayName" class="rounded-full" />
  <div v-else class="rounded-full flex items-center justify-center text-white font-medium" :style="{ background: bgColor }">
    {{ initials }}
  </div>
</template>
```

The same `UserAvatar` is used everywhere a user is rendered — `ConversationRow`, `OnlineNowStrip`, `CommunityView` rows, `ChatView` TopBar, `ProfileView`, `CallModal`.

## Server-Side Validation

The Zod schema in `libs/shared-contracts/src/lib/user.ts`:

```ts
avatarUrl: z.union([
  z.string().url(),                                              // future bucket migration
  z.string().startsWith('data:image/jpeg;base64,').max(150_000), // data URL with headroom
  z.null(),                                                       // clear avatar
]).optional()
```

The 150,000-char ceiling is server-side defense — the client enforces 100,000 first, but a tampered client must not be able to bloat the DB.

**No server-side image decoding.** If the client sends malformed bytes, Drizzle stores the string as-is and the next `<img>` render shows a broken image. Acceptable failure mode per PRD §11.9.

## i18n Keys

```json
{
  "avatar": {
    "uploadLabel": "Change photo",
    "errors": {
      "fileTooLarge": "Image is too large (max 10MB)",
      "unsupportedFormat": "Please use JPEG, PNG, or WebP",
      "decodeFailed": "Couldn't read that image. Try another?",
      "resultTooLarge": "Image is too complex to compress. Try a simpler photo."
    }
  }
}
```

Translate to TR + ET in Phase 11.

## Why JPEG, Not PNG or WebP

- **JPEG q=0.85 at 256×256**: 8–25 KB. Avatars are photographic — JPEG is the right call.
- **PNG at same dims**: 200 KB+ for photos. Wrong format.
- **WebP**: smaller still, but Safari support history was rocky enough that JPEG is the safer demo choice. The 25 KB ceiling makes the size difference irrelevant.

## Checklist

- [ ] Pre-decode 10 MB size guard before `URL.createObjectURL`
- [ ] MIME allow-list checked against `file.type`
- [ ] `URL.revokeObjectURL` called after decode (and on error path)
- [ ] Canvas center-crop to square, then resize to 256×256
- [ ] `toDataURL('image/jpeg', 0.85)`
- [ ] Post-encode 100 KB guard
- [ ] Staged in `draft`, saved only on Save button
- [ ] `UserAvatar` renders data URL if present; otherwise deterministic-color initials
- [ ] Zod schema enforces ≤150,000 chars for data URLs; accepts https URLs and null
- [ ] No server-side image decoding

## See also

- `vue-frontend` — for the Pinia draft pattern and component conventions
- `i18n-vue-i18n` — for the four `avatar.errors.*` keys
- `security` — for why server-side decoding is intentionally skipped
- `monorepo-contracts` — for the `updateProfileInput.avatarUrl` schema

## References

- PRD §11.9 Avatar Upload Implementation
- `apps/web/src/composables/useAvatarUpload.ts`
- `apps/web/src/components/ui/UserAvatar.vue`
- `libs/shared-contracts/src/lib/user.ts`
