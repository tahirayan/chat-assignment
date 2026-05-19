# Manual Critical-Path Script

Run this against the deployed Netlify URL (or local dev — same script).
Two browser profiles required so you can see real-time effects between
users. ~10 minutes end to end.

## Setup

- **Browser A:** open the live URL in your main browser (or an Incognito window).
- **Browser B:** open the live URL in a second profile (different user) or a different browser.
- Keep both windows visible side-by-side.

## 1. Auth flow

1. **A:** click "Sign up", create an account (e.g. `alice@example.com` / `correcthorse99`). Land on `/`.
2. **B:** sign up as `bob@example.com` / `correcthorse99`.
3. **A:** hit hard-refresh (`Ctrl+Shift+R`). You should stay logged in (refresh-cookie round-trip).
4. **A:** open `/profile`, log out, get bounced to `/auth`. Log in again.

**Expected:** zero console errors, no flash of unauthenticated UI on refresh.

## 2. Presence + Discovery

5. **A:** navigate to **Community**. Bob shows in the "Online now" section.
6. **B:** close the tab. Within ~2 seconds, **A** sees Bob flip to "Offline" with a "last seen X ago" string.
7. **B:** reopen and log back in. **A** sees Bob flip back to "Online".

**Expected:** dots animate, `user:offline` / `user:online` events visible in DevTools → Network → WS frames.

## 3. Real-time messaging

8. **A:** click Bob in Community → opens `/chat/<bob-id>`.
9. **A:** type "hi Bob" + Enter. Bubble appears immediately (optimistic) and within ~150 ms shows ✓ (server-acked).
10. **B:** open the same chat. The message is there; the unread badge clears.
11. **B:** type back. On **A's** side the bubble flips ✓ → ✓✓ as soon as B's view marks it read.
12. **A:** start typing without sending. **B** sees "Alice is typing…" within 2 seconds; it clears 3 seconds after A stops.
13. **A:** scroll to the top of the thread. If >50 messages exist, older messages load in (pagination). The compose bar stays anchored to the bottom (no layout shift).

**Expected:** every interaction round-trips in real time; read receipts flip both ways.

## 4. Audio call

14. **A:** click the ☎ icon in the chat header. Grant mic permission. State shows "Calling…".
15. **B:** within a second sees "Incoming call" full-screen with A's avatar + Pro badge (if applicable).
16. **B:** taps the green Answer button. Grant mic permission. State on both sides transitions: connecting → connected.
17. Speak. Audio flows both ways. **A** clicks Mute — **B** hears silence; A's button shows muted state.
18. Either side hangs up. Both modals close. **Critical:** the OS-level mic indicator (Windows: notification area; macOS: status bar) is OFF on both machines.

**Expected:** clean teardown, no "phantom" mic-still-active state.

## 5. Video call

19. **A:** click 🎥. Grant camera + mic. State: "Calling…".
20. **B:** sees video-incoming modal. Answer.
21. Both see each other's video. Local preview is mirrored in the corner.
22. **A:** click the camera-toggle button. A's camera light goes OFF, B's tile falls back to A's avatar instantly.
23. **A:** toggle camera back on. Camera light comes back, B sees A again. **The call does not drop.**
24. Either side hangs up. **Camera lights OFF on both machines.**

**Expected:** track-replace happens without renegotiation; no glitches; no lingering camera light.

## 6. Stripe upgrade

25. **A:** open `/profile` → "Upgrade to Pro".
26. Form loads with the Stripe Payment Element. Use test card `4242 4242 4242 4242`, any future expiry, any CVC, any zip. Submit.
27. Redirect to `/profile?payment_intent=…`. Toast: "Welcome to Pro!".
28. URL query params strip out (no `?payment_intent` left). Pro badge appears next to A's name in the header.
29. **B:** refresh — Alice in their Community/Chats lists also shows the Pro badge.

**Expected:** webhook fires server-side (`stripe-webhook: payment recorded, user flipped to Pro` in api log); idempotent on resend.

## 7. 3DS challenge

30. From `/upgrade`, use card `4000 0027 6000 3184`. Submit.
31. 3DS challenge iframe pops. Complete it.
32. Same success path as step 27.

## 8. i18n switch

33. **A:** `/profile` → Language → Türkçe → Save.
34. Every visible string flips: nav tabs, compose placeholder, modal headlines, button labels. Times format in TR locale ("dün" not "yesterday").
35. Hard-refresh. Locale persists. Open Incognito and log in as A — same locale because the server stores it.

## 9. PWA install

36. **Android Chrome / desktop Chrome:** within ~3 seconds of first visit, the bottom banner shows "Install Chat" with an Install button. Click → native dialog → install. Banner disappears; reopening the installed app loads the shell offline (Network → Offline + reload).
37. **iOS Safari:** banner shows "Tap the Share button, then choose Add to Home Screen". No native button (iOS doesn't expose one).
38. "Not now" dismissal persists across reloads.

## 10. Logout-kicks-all-sockets (security)

39. **A:** log into the same account on a second browser profile (call it A2). Both are active.
40. **A2:** click Log out.
41. **A:** within a second, the chat goes "offline" indicator, presence flips. If A tries to send a message, it gets refreshed-or-bounced. (Server kicks all sockets for the logged-out user.)

**Expected:** logout-anywhere kills sockets everywhere for that user.

---

## Failure log template

| Step | What happened | Expected | Console log |
|------|---------------|----------|-------------|
|      |               |          |             |

Use this if anything diverges. Most issues land in steps 4 (call teardown), 6 (webhook), or 10 (socket lifecycle).
