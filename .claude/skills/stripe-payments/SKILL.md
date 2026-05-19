---
name: stripe-payments
description: Stripe Payment Element + 3DS + idempotent webhook — €4.99 one-time PaymentIntent, automatic_payment_methods, raw-body signature verification, INSERT … ON CONFLICT DO NOTHING on payments.stripe_payment_intent, user.isPro flip only after verified payment_intent.succeeded. Use when editing apps/api/src/app/plugins/stripe.ts, apps/api/src/app/routes/payments/, the stripe-webhook route, apps/web/src/pages/UpgradeView.vue, or apps/web/src/pages/ProfileView.vue (Pro badge). Required when debugging webhook signature failures, isPro not flipping after payment, or duplicate payment rows.
---

# Stripe — Payment Element + 3DS + Webhook

The Pro upgrade flow per PRD §15. Single product, one-time charge, 3DS-capable.

## When to Use This Skill

- Implementing or changing `apps/web/src/pages/UpgradeView.vue`
- Working on `POST /api/payments/create-intent` or `POST /api/stripe-webhook`
- Editing `apps/api/src/app/plugins/stripe.ts`
- Investigating webhook signature failures or `isPro` not flipping

## Quick Reference

| Concern              | Choice                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| **Product**          | "Chat Pro" — €4.99 one-time (no subscription complexity for the demo)         |
| **Amount**           | `499` cents, `currency: 'eur'`                                                |
| **Auth methods**     | `automatic_payment_methods: { enabled: true }` — Stripe picks                |
| **Client library**   | `@stripe/stripe-js` + Stripe Elements (`Payment Element`)                     |
| **Server library**   | `stripe` (Node)                                                              |
| **Idempotency**      | `payments.stripe_payment_intent` UNIQUE → `INSERT … ON CONFLICT DO NOTHING`   |
| **Webhook secret**   | `STRIPE_WEBHOOK_SECRET` env var; verified against raw body                    |
| **3DS test card**    | `4000 0027 6000 3184`                                                         |
| **Normal test card** | `4242 4242 4242 4242`                                                          |

## Server

### Plugin (`apps/api/src/app/plugins/stripe.ts`)

```ts
import fp from 'fastify-plugin'
import Stripe from 'stripe'

declare module 'fastify' {
  interface FastifyInstance { stripe: Stripe }
}

export const stripePlugin = fp(async (fastify) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-09-30.acacia' })
  fastify.decorate('stripe', stripe)

  // Raw body parser scoped to the webhook route only (see fastify-plugins skill)
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    if (req.url === '/api/stripe-webhook') return done(null, body)
    try { done(null, JSON.parse(body.toString())) } catch (err) { done(err as Error) }
  })
}, { name: '@chat/stripe' })
```

### Create Intent Route

```ts
POST /api/payments/create-intent
body: { product: 'pro_monthly' }    // CreatePaymentIntentInput (Zod)
auth: bearer
```

```ts
const intent = await fastify.stripe.paymentIntents.create({
  amount: 499,
  currency: 'eur',
  automatic_payment_methods: { enabled: true },
  metadata: { userId: req.userId, product: 'pro_monthly' },
})
return { clientSecret: intent.client_secret, paymentIntentId: intent.id }
```

### Webhook Route

```ts
POST /api/stripe-webhook
auth: signature (no bearer)
```

```ts
const sig = req.headers['stripe-signature'] as string
let event: Stripe.Event
try {
  event = fastify.stripe.webhooks.constructEvent(
    req.body as Buffer,                       // RAW body — Buffer
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!,
  )
} catch (err) {
  reply.code(400).send({ error: { code: 'INVALID_SIGNATURE', message: 'Bad webhook signature' } })
  return
}

if (event.type === 'payment_intent.succeeded') {
  const pi = event.data.object as Stripe.PaymentIntent
  const userId = pi.metadata.userId
  if (!userId) return reply.code(200).send()  // unknown intent, ack and skip

  // Idempotent: ON CONFLICT DO NOTHING so duplicate webhooks are no-ops
  db.transaction((tx) => {
    tx.insert(payments).values({
      id: uuidv7(), userId,
      stripePaymentIntent: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      status: 'succeeded',
    }).onConflictDoNothing({ target: payments.stripePaymentIntent }).run()

    tx.update(users).set({ isPro: true }).where(eq(users.id, userId)).run()
  })
}

return reply.code(200).send()
```

**Critical**: the raw-body parser must give the route a `Buffer`. If something stringifies + re-parses the body, signature verification fails silently.

### Anti-pattern: verifying signature against parsed JSON

```ts
// BAD — the body has been parsed to an object, then JSON.stringify'd again
//        to feed constructEvent. Stripe's signature was computed over the
//        original byte stream, including whitespace and key ordering, so
//        the verification fails for reasons that look random.
async function webhook(req, reply) {
  const event = fastify.stripe.webhooks.constructEvent(
    JSON.stringify(req.body),                  // ← reconstructed JSON
    req.headers['stripe-signature'] as string,
    process.env.STRIPE_WEBHOOK_SECRET!,
  )
}
```

```ts
// GOOD — req.body is a Buffer (raw bytes), produced by the scoped
//        raw-body parser. Stripe's HMAC matches.
async function webhook(req, reply) {
  const event = fastify.stripe.webhooks.constructEvent(
    req.body as Buffer,                        // ← original bytes
    req.headers['stripe-signature'] as string,
    process.env.STRIPE_WEBHOOK_SECRET!,
  )
}
```

Symptom in production: every webhook returns 400 "Invalid signature".
Cause: the raw-body parser isn't scoped to this route, or it's scoped but
something else (like a global preHandler) is parsing the buffer before the
handler sees it.

## Anti-pattern: flipping isPro before signature verification

```ts
// BAD — trusts the request body before verifying it came from Stripe.
//        Anyone who can POST to /api/stripe-webhook with a known userId
//        gets free Pro.
async function webhook(req, reply) {
  const event = req.body as Stripe.Event             // ← no verification
  if (event.type === 'payment_intent.succeeded') {
    const userId = event.data.object.metadata.userId
    db.update(users).set({ isPro: true }).where(eq(users.id, userId)).run()
  }
}
```

```ts
// GOOD — verify first; act only on verified events
async function webhook(req, reply) {
  let event: Stripe.Event
  try {
    event = fastify.stripe.webhooks.constructEvent(
      req.body as Buffer,
      req.headers['stripe-signature'] as string,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch {
    return reply.code(400).send({ error: { code: 'INVALID_SIGNATURE' } })
  }

  if (event.type === 'payment_intent.succeeded') {
    /* …idempotent insert + isPro flip… */
  }
}
```

## Anti-pattern: non-idempotent insert

```ts
// BAD — Stripe retries succeeded webhooks. Without ON CONFLICT, a retry
//        creates a duplicate payment row, and the UNIQUE constraint
//        blows the second one up with a 500 → Stripe retries forever.
db.insert(payments).values({ stripePaymentIntent: pi.id, … }).run()
db.update(users).set({ isPro: true }).where(eq(users.id, userId)).run()
```

```ts
// GOOD — INSERT … ON CONFLICT DO NOTHING; the update is also idempotent
//        because setting isPro=true a second time is a no-op
db.transaction((tx) => {
  tx.insert(payments)
    .values({ stripePaymentIntent: pi.id, … })
    .onConflictDoNothing({ target: payments.stripePaymentIntent })
    .run()
  tx.update(users).set({ isPro: true }).where(eq(users.id, userId)).run()
})
```

## Client

### UpgradeView

```ts
import { loadStripe } from '@stripe/stripe-js'

const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
const { clientSecret } = await api.post('/payments/create-intent', { product: 'pro_monthly' }).then(r => r.data)
const elements = stripe!.elements({ clientSecret })
const paymentElement = elements.create('payment')
paymentElement.mount('#payment-element')

async function onSubmit() {
  const { error } = await stripe!.confirmPayment({
    elements,
    confirmParams: { return_url: `${window.location.origin}/profile?stripe=return` },
  })
  if (error) toast.error(error.message ?? 'Payment failed')
}
```

The 3DS challenge is rendered inline by Stripe — no extra wiring required.

### On Return URL

`/profile?stripe=return` triggers a check:

1. Read `payment_intent_client_secret` from query params (Stripe adds it).
2. `stripe.retrievePaymentIntent(clientSecret)` to read status.
3. If `succeeded`: toast success, refresh `authStore.bootstrap()` to pick up the new `isPro`.
4. If `requires_payment_method` or `requires_action`: toast failure, let user retry.

**Don't** rely on the return-URL check to flip `isPro` — that's the webhook's job. The return-URL check is purely cosmetic (toast + refresh).

## Env Vars

```
STRIPE_SECRET_KEY=sk_test_xxx                    # api
STRIPE_WEBHOOK_SECRET=whsec_xxx                  # api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx          # web (build-time)
```

## Local Webhook Forwarding

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
# Prints a webhook secret — put it in apps/api/.env as STRIPE_WEBHOOK_SECRET
```

## Production Webhook Setup

1. Stripe dashboard → Webhooks → Add endpoint
2. URL: `https://<your-railway>.up.railway.app/api/stripe-webhook`
3. Select event: `payment_intent.succeeded`
4. Copy the webhook secret to Railway env

## Test Cards (PRD §15.5)

- `4242 4242 4242 4242` — succeeds without 3DS
- `4000 0027 6000 3184` — always triggers 3DS challenge
- More: https://docs.stripe.com/testing

## Profile Pro Badge

```vue
<div v-if="user.isPro" class="badge badge-pro">Pro ✓</div>
<router-link v-else to="/upgrade" class="btn-primary">Upgrade to Pro</router-link>
```

## Checklist

- [ ] Raw-body parser scoped to `/api/stripe-webhook` only — never globally
- [ ] Webhook signature verified against the **Buffer**, not a parsed object
- [ ] `metadata.userId` set on every `paymentIntents.create`
- [ ] Insert into `payments` is idempotent (`onConflictDoNothing` on `stripe_payment_intent`)
- [ ] `users.isPro = true` happens **after** verified `payment_intent.succeeded`
- [ ] Client confirms with `confirmPayment({ elements, confirmParams: { return_url } })`
- [ ] 3DS card tested manually before merge
- [ ] Webhook replay tested (Stripe CLI `stripe events resend`) — `isPro` doesn't flip twice
- [ ] No secrets in code, logs, or Stripe event bodies in logs

## See also

- `fastify-plugins` — for the route-scoped raw-body parser
- `security` — for the verify-then-act discipline and idempotency
- `deployment` — for registering the production webhook against Railway
- `drizzle-sqlite` — for the `onConflictDoNothing` pattern on `payments`

## References

- PRD §15 Stripe Integration
- Stripe Payment Element docs: https://docs.stripe.com/payments/payment-element
- Stripe webhook signing: https://docs.stripe.com/webhooks/signatures
- Test cards: https://docs.stripe.com/testing
