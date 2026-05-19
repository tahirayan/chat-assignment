---
name: ultracite-lint
description: Ultracite (Biome preset) — sole linter + formatter in this repo (no ESLint, no Prettier). Covers biome.jsonc config, per-project noRestrictedImports overrides, tools/check-boundaries.mjs for Nx project-graph enforcement, Nx lint targets that shell out to ultracite, common rule fixes (noExplicitAny, useImportType, noNonNullAssertion). Use when fixing a lint finding, adding a per-project rule override in biome.jsonc, editing tools/check-boundaries.mjs, or wiring a new project.json lint target.
---

# Ultracite — Linter + Formatter (Biome preset)

The Chat app uses **Ultracite** as the sole linter and formatter — there is no ESLint or Prettier. Ultracite is Vercel's strict, zero-config Biome preset.

> **Scope split.** This skill covers project-specific config: the
> `biome.jsonc` shape, `noRestrictedImports` boundaries, the boundary
> script, and Nx target wiring.
>
> For the general Ultracite CLI surface (`init`, `check`, `fix`, `doctor`),
> the full code-standards reference (type safety, modern JS/TS, async,
> framework-specific rules), and troubleshooting, see the upstream
> **`ultracite`** skill at `.claude/skills/ultracite/SKILL.md` + its
> `references/code-standards.md`. The two skills are complementary — read
> both when working on linter setup or rule overrides.

## When to Use This Skill

- Fixing Ultracite findings
- Adding a per-project rule override
- Wiring or debugging the `tools/check-boundaries.mjs` script
- Setting up the editor for format-on-save with Biome

## Quick Reference

| Concern                  | Choice                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Config file**          | `biome.jsonc` at repo root, extends `ultracite`                                |
| **Lint**                 | `pnpm exec ultracite check` (whole repo) or `pnpm exec nx lint <project>`       |
| **Format/fix**           | `pnpm exec ultracite fix` (writes fixes); `pnpm exec ultracite check` (read-only) |
| **Editor**               | Biome VS Code extension as default formatter, format-on-save                   |
| **Module boundaries**    | `style/noRestrictedImports` per-project + `tools/check-boundaries.mjs`         |
| **Replaces**             | ESLint + Prettier (we never had them — Ultracite is the only linter)           |

## Initial Setup

```bash
pnpm dlx ultracite init
```

This generates `biome.jsonc` extending the Ultracite preset. Commit it.

## `biome.jsonc` Shape

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "extends": ["ultracite"],
  "files": {
    "ignore": [
      "**/dist/**",
      "**/.nx/**",
      "**/coverage/**",
      "apps/api/src/db/migrations/**"   // generated SQL — leave alone
    ]
  },
  "overrides": [
    {
      "include": ["apps/web/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "@chat/shared-types": { "allowed": true },
                  "@chat/shared-contracts": { "allowed": true }
                  // any other @chat/* import would fail
                }
              }
            }
          }
        }
      }
    },
    {
      "include": ["apps/api/**"],
      "linter": { "rules": { "style": { "noRestrictedImports": { /* same shape */ } } } }
    },
    {
      "include": ["libs/shared-types/**"],
      "linter": { "rules": { "style": { "noRestrictedImports": {
        "level": "error",
        "options": { "patterns": [{ "group": ["@chat/shared-contracts"] }] }
      } } } }
    }
  ]
}
```

The intent: apps may only import from `@chat/shared-*`; `shared-types` cannot import from `shared-contracts` (one-way dependency); `shared-contracts` may import from `shared-types`.

## Module Boundary Script

Biome's `noRestrictedImports` catches import-path violations within files. But it can't see the **project graph** — e.g. an `apps/web` file importing from a relative `../../apps/api/...` path would not be caught (Biome doesn't know what an "app" is).

The boundary script closes that gap:

```js
// tools/check-boundaries.mjs
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

execSync('pnpm exec nx graph --file=.nx-graph.json', { stdio: 'inherit' })
const graph = JSON.parse(readFileSync('.nx-graph.json', 'utf-8'))

const tags = {}
for (const [name, project] of Object.entries(graph.graph.nodes)) {
  tags[name] = project.data.tags ?? []
}

const violations = []
for (const [source, deps] of Object.entries(graph.graph.dependencies)) {
  const sourceTags = tags[source] ?? []
  for (const dep of deps) {
    const targetTags = tags[dep.target] ?? []
    // Rule: scope:web cannot depend on scope:api (and vice versa)
    if (sourceTags.includes('scope:web') && targetTags.includes('scope:api')) {
      violations.push(`${source} → ${dep.target} (web cannot depend on api)`)
    }
    if (sourceTags.includes('scope:api') && targetTags.includes('scope:web')) {
      violations.push(`${source} → ${dep.target} (api cannot depend on web)`)
    }
    // Rule: shared libs cannot depend on apps
    if (sourceTags.includes('scope:shared') && (targetTags.includes('scope:web') || targetTags.includes('scope:api'))) {
      violations.push(`${source} → ${dep.target} (shared cannot depend on apps)`)
    }
    // Rule: type:types cannot depend on type:contracts
    if (sourceTags.includes('type:types') && targetTags.includes('type:contracts')) {
      violations.push(`${source} → ${dep.target} (types cannot depend on contracts)`)
    }
  }
}

if (violations.length > 0) {
  console.error('Boundary violations:')
  violations.forEach(v => console.error('  ' + v))
  process.exit(1)
}
console.log('Boundaries OK')
```

Run it locally and in CI:

```bash
node tools/check-boundaries.mjs
```

## Nx Lint Target Wiring

Each `project.json` has a `lint` target that shells out to Ultracite:

```jsonc
{
  "name": "web",
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": {
        "commands": ["pnpm exec ultracite check apps/web"],
        "cwd": "{workspaceRoot}"
      }
    }
  }
}
```

This lets `nx affected -t lint` work — Nx scopes the Ultracite invocation per project.

## Editor Setup

Install the **Biome VS Code extension** (`biomejs.biome`).

`.vscode/settings.json`:

```jsonc
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "[json]": { "editor.defaultFormatter": "biomejs.biome" },
  "[jsonc]": { "editor.defaultFormatter": "biomejs.biome" },
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[vue]": { "editor.defaultFormatter": "biomejs.biome" }
}
```

## Common Findings & Fixes

| Finding                       | Fix                                                                  |
| ----------------------------- | -------------------------------------------------------------------- |
| `noExplicitAny`                | Replace `any` with `unknown` and narrow                              |
| `useImportType`                | Use `import type { … }` for type-only imports                        |
| `noUnusedVariables`           | Delete or prefix with `_`                                            |
| `noNonNullAssertion`           | Replace `value!` with a narrowing check                              |
| `noRestrictedImports`          | Switch to `@chat/shared-*` path alias                                |
| `useNodejsImportProtocol`      | `import { readFile } from 'node:fs/promises'`                        |
| `useTemplate`                  | Use template literals instead of string concatenation                |

## CI

In CI, run all three checks:

```bash
pnpm exec ultracite check
pnpm exec ultracite check
node tools/check-boundaries.mjs
```

Any one of them failing blocks merge.

## Checklist

- [ ] `biome.jsonc` at repo root extends `ultracite`
- [ ] No `eslint.config.*` or `.prettierrc*` files (Ultracite is the whole linter story)
- [ ] Per-project `noRestrictedImports` overrides in `biome.jsonc`
- [ ] `tools/check-boundaries.mjs` exists and exits 0 on a clean tree
- [ ] Each `project.json` has a `lint` target that calls `ultracite check <projectRoot>`
- [ ] `.vscode/settings.json` configures Biome as the default formatter
- [ ] CI runs lint + format-check + boundary script

## See also

- `ultracite` — **the upstream Ultracite skill.** Full CLI reference and the
  complete code-standards rule list (type safety, async, framework rules,
  testing, security, performance). Required reading when fixing a finding.
- `monorepo-contracts` — `noRestrictedImports` enforces the contract layer
- `nx-commands` — for how Nx lint targets shell out to ultracite
- `deployment` — CI runs all three checks (check, fix --check, boundary)

## References

- Ultracite: https://www.ultracite.ai/
- Biome rules: https://biomejs.dev/linter/rules/
- PLAN.md Phase 1 "Tooling note — Ultracite as the linter"
