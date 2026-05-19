---
name: nx-commands
description: Nx 22 command reference — projects (web, api, shared-types, shared-contracts), serve/build/test/lint/typecheck targets, affected vs run-many, drizzle-kit invocation via --filter, graph + boundary script, cache reset. Use when running any Nx command, wiring a new target in project.json, debugging cache issues, or setting up the CI affected command set.
---

# Nx Commands Reference

**Always use `pnpm exec nx` (or `pnpm nx`) instead of bare `nx`.**

Project names in this workspace: `web`, `api`, `shared-types`, `shared-contracts`.

## Development

```bash
pnpm exec nx serve api
pnpm exec nx serve web
pnpm exec nx serve web --port=4200
```

## Building

```bash
pnpm exec nx build web
pnpm exec nx build api
pnpm exec nx run-many -t build
pnpm exec nx affected -t build
```

## Testing

```bash
pnpm exec nx test shared-contracts
pnpm exec nx test api
pnpm exec nx test web
pnpm exec nx test {project} --watch
pnpm exec nx test {project} --coverage
pnpm exec nx run-many -t test
pnpm exec nx affected -t test
```

## Linting (Ultracite via Nx)

Each project has a `lint` target that runs `ultracite check <projectRoot>`:

```bash
pnpm exec nx lint web
pnpm exec nx lint api
pnpm exec nx run-many -t lint
pnpm exec nx affected -t lint
```

Or call Ultracite directly (faster for whole-repo checks):

```bash
pnpm exec ultracite check                  # whole repo
pnpm exec ultracite fix                # write fixes
pnpm exec ultracite check        # CI mode, no writes
```

## Type Checking

```bash
pnpm exec nx typecheck web
pnpm exec nx typecheck api
pnpm exec nx run-many -t typecheck
```

## Database (api)

```bash
pnpm --filter=api exec drizzle-kit generate    # generate migration from schema diff
pnpm --filter=api exec drizzle-kit studio      # open Drizzle Studio
# Migrations apply on api boot — no separate migrate step
```

See `.claude/skills/drizzle-sqlite/` for the schema-change workflow.

## Workspace

```bash
pnpm exec nx graph                          # dependency graph in browser
pnpm exec nx affected:graph
pnpm exec nx show projects                  # list all
pnpm exec nx show project web --web         # project config in browser
pnpm exec nx reset                          # clear cache
```

## Boundary Check

```bash
node tools/check-boundaries.mjs             # asserts no cross-app or shared→app imports
```

Runs alongside `ultracite check` in CI; failures here block PR merge.

## CI Profile

```bash
pnpm exec nx affected -t lint test build --base=origin/main --head=HEAD
pnpm exec ultracite check
node tools/check-boundaries.mjs
```

Or with `nx-cloud` (if enabled):

```bash
pnpm exec nx affected -t lint test build --parallel=3
```

## Troubleshooting

```bash
pnpm exec nx reset                                 # clear all caches
pnpm exec nx test {project} --skip-nx-cache        # bypass cache
NX_VERBOSE_LOGGING=true pnpm exec nx test {project} # verbose
```

## Quick Cheats

```bash
# Run the whole test+lint+build suite affected by your branch:
pnpm exec nx affected -t lint test build

# Watch tests for a single project:
pnpm exec nx test api --watch

# Build everything from scratch:
pnpm exec nx reset && pnpm exec nx run-many -t build
```

## See also

- `nx-testing` — for what to actually test and how
- `ultracite-lint` — for the lint target wiring + boundary script
- `drizzle-sqlite` — for `drizzle-kit generate` via `--filter=api`
