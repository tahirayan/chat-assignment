---
name: api-design
description: REST API design — resource-oriented routes, Zod schemas via fastify-type-provider-zod, standard error envelope ({ error: { code, message, details } }), status code semantics, cursor pagination by createdAt. Use when adding or editing files under apps/api/src/app/routes/, defining schemas in libs/shared-contracts/src/lib/, designing error responses, or reviewing endpoint contracts. Required when adding a new endpoint or changing response shapes consumed by apps/web.
---

# API Design

REST conventions for the Chat app per PRD §7. APIs are resource-oriented, Zod-validated via `fastify-type-provider-zod`, and return a consistent success or error payload.

## When to Use This Skill

- Adding or changing routes in `apps/api/src/app/routes/`
- Defining or updating request/response schemas (Zod) in `libs/shared-contracts`
- Designing error response shape or status codes
- Questions about REST conventions, versioning, or pagination

## Quick Reference

| Concern          | Choice                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Validation**   | Zod schemas in `libs/shared-contracts`; `fastify-type-provider-zod` on routes         |
| **Route schema** | `schema: { body?, querystring?, params?, response: { 200: schema } }`                 |
| **Success**      | 200/201/204 with typed body; no extra envelope unless paginating                       |
| **Errors**       | `{ error: { code, message, details } }` (PRD §7.6)                                    |
| **JSON casing**  | camelCase for app-specific fields; messages REST returns match `Message` shape in `shared-types` |
| **Versioning**   | Not in use; if introduced later, prefer `/v1/` path prefix                            |

## Endpoint Table (PRD §7)

| Method | Path                                  | Auth | Schema                              |
| ------ | ------------------------------------- | ---- | ----------------------------------- |
| POST   | `/api/auth/register`                  | —    | `registerInput` → `{ user, accessToken }` |
| POST   | `/api/auth/login`                     | —    | `loginInput` → `{ user, accessToken }`    |
| POST   | `/api/auth/refresh`                   | cookie | — → `{ accessToken }`            |
| POST   | `/api/auth/logout`                    | cookie | — → 204                         |
| GET    | `/api/auth/me`                        | bearer | — → `User`                       |
| GET    | `/api/users`                          | bearer | — → `PublicUser[]`               |
| GET    | `/api/users/:id`                      | bearer | — → `PublicUser`                  |
| PATCH  | `/api/users/me`                       | bearer | `updateProfileInput` → `User`     |
| GET    | `/api/conversations`                  | bearer | — → `Conversation[]`             |
| GET    | `/api/messages/:otherUserId`          | bearer | querystring `?before&limit` → `Message[]` |
| POST   | `/api/messages/:otherUserId/read`     | bearer | — → 204                          |
| POST   | `/api/payments/create-intent`         | bearer | `createPaymentIntentInput` → `{ clientSecret, paymentIntentId }` |
| POST   | `/api/stripe-webhook`                 | sig    | (raw body)                       |

**Sending messages is NOT a REST endpoint.** Messages are sent via the `message:send` Socket.io event so the server can persist + broadcast in one round-trip (PRD §7.4 note).

## Route Structure

1. **Schemas first.** Define Zod schemas in `libs/shared-contracts/src/lib/` (`auth.ts`, `user.ts`, `message.ts`, `payment.ts`). Export both the schema and the inferred type:
   ```ts
   export const loginInput = z.object({ email: z.string().email().toLowerCase().trim(), password: z.string().min(8).max(128) })
   export type LoginInput = z.infer<typeof loginInput>
   ```
2. **Register schema on route** with `fastify.withTypeProvider<ZodTypeProvider>().get|post|patch(path, { schema, config }, handler)`. Set `schema.body`, `schema.querystring`, `schema.params`, and `schema.response` (`{ 200: responseSchema }` etc.). Fastify validates + types both request and response.
3. **Errors.** Throw domain errors from `apps/api/src/lib/errors.ts`. A custom error handler maps them to status codes and the envelope. For Zod validation failures, Fastify's built-in 400 with `details` is fine.
4. **Auth.** Use a `preHandler` that calls `fastify.verifyAccessToken(req)` and sets `req.userId`. Skip on `/auth/*` and `/stripe-webhook`.
5. **Stateless handlers.** No request-scoped globals beyond `req.userId`. Use constant-time comparisons for secrets.

## Status Codes

| Status | Use                                                                |
| ------ | ------------------------------------------------------------------ |
| 200    | Success with body                                                  |
| 201    | Created (register)                                                 |
| 204    | Success, no body (logout, mark-read)                                |
| 400    | Bad request / Zod validation failure                                |
| 401    | Unauthorized (missing/invalid auth)                                 |
| 403    | Forbidden (valid auth, insufficient permission)                     |
| 404    | Not found                                                           |
| 409    | Conflict (email already registered)                                  |
| 429    | Rate-limited (set `Retry-After`)                                    |
| 500    | Internal server error                                                |

## Error Envelope (PRD §7.6)

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password incorrect",
    "details": null
  }
}
```

- `code` is the machine-readable identifier (uppercased snake case).
- `message` is the human-readable string. **Use generic wording for auth failures** — never confirm whether an email is registered.
- `details` may carry Zod field errors on 400 in development; in production keep it minimal.
- **Never** include stack traces in production responses.

## Naming Conventions

- **JSON**: camelCase for all app-specific fields (`emailVerified`, `lastSeenAt`, `isPro`).
- **URLs**: lowercase, plural nouns for resources (`/api/users`, `/api/messages`, `/api/conversations`). Keep nesting shallow (max 2 levels).
- **Query params**: camelCase (`?before=…&limit=…`).
- **OAuth-related** endpoints don't apply here (we don't expose OAuth). If we ever add them, use RFC 6749 snake_case.

## Pagination

Messages use cursor pagination by timestamp:

```
GET /api/messages/:otherUserId?before=<epochMs>&limit=50
```

DESC order. Limit defaults to 50, max 100. The client passes the `createdAt` of the oldest message in its buffer as `before` to fetch the next page.

## Checklist for a New Endpoint

- [ ] Zod schema in `libs/shared-contracts` with exported `z.infer<...>` type
- [ ] Route registered with `schema.body` / `querystring` / `params` / `response`
- [ ] Auth `preHandler` applied (or explicitly skipped with a justification)
- [ ] Domain errors thrown from `lib/errors.ts` — no ad-hoc `reply.code(...)` in the handler
- [ ] Response shape matches what `apps/web` consumes (verify by importing the same type)
- [ ] No secrets, tokens, or PII in logs

## See also

- `monorepo-contracts` — for the shared-types/shared-contracts ripple rule
- `fastify-plugins` — for the type-provider + preHandler plumbing
- `security` — for input-validation and error-envelope discipline
- `auth-jwt-cookies` — for the auth preHandler that gates these routes

## References

- PRD §7 REST API Contract
- `libs/shared-contracts/src/lib/`
- `apps/api/src/app/routes/`
- `apps/api/src/lib/errors.ts`
- `fastify-type-provider-zod` docs
