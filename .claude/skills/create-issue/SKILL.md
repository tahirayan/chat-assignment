---
name: create-issue
description: Create a new GitHub issue following Chat-project conventions using gh issue create
disable-model-invocation: true
---

# Create GitHub Issue

Create a new GitHub issue following the Chat project's conventions.

## Your Task

When the user describes a task, feature, or bug, create an issue using `gh issue create`.

## Issue Title Format

Conventional Commits style:

- `feat: {description}` — new feature
- `fix: {description}` — bug fix
- `refactor: {description}` — code restructuring
- `docs: {description}` — documentation
- `chore: {description}` — maintenance

## Issue Body Template

```markdown
## Summary

{1–2 sentence description of the task}

## PRD reference

PRD §{section} ({title}).
PLAN phase: {phase number + name}.

## Tasks

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Technical Details

{Code examples, schemas, event names, file paths}

## Contract impact

{New socket events / Zod schemas / REST endpoints / shared types — or "None"}

## Acceptance Criteria

- [ ] Criterion 1 (link to PRD §19 line where relevant)
- [ ] Criterion 2
- [ ] Manual verification: {two-browser scenario where relevant}

## Out of scope

- {Anything deliberately not in this issue}

## References

- PRD.md §{section}
- PLAN.md Phase {N}
- {Other links}
```

## Labels

- `enhancement` — new feature from PRD §1.2 or §1.3
- `bug` — defect
- `chore` — tooling, deps, config
- `docs` — README/REPORT/inline docs

## Common Scopes Reference

`auth`, `api`, `web`, `chat`, `rtc`, `socket`, `pinia`, `db`, `pwa`, `i18n`, `stripe`, `theme`, `deploy`, `contracts`, `types`, `lint`

## Command Template

```bash
gh issue create \
  --title "feat: {title}" \
  --body "$(cat <<'BODY'
## Summary

{summary}

## PRD reference

PRD §{x.y}. PLAN phase {N}.

## Tasks

- [ ] {task1}
- [ ] {task2}

## Technical Details

{details}

## Acceptance Criteria

- [ ] {criterion1}
- [ ] {criterion2}

## References

- PRD.md §{x.y}
- PLAN.md Phase {N}
BODY
)" \
  --label "enhancement"
```

## Instructions

1. Confirm the ask is in PRD §1.2 (required) or §1.3 (bonus). If it lands in §1.4 (non-goals), flag it and ask the user to confirm before creating.
2. Map to a PLAN phase (1–18) — this sets dependencies and review order.
3. Write detailed tasks as checkboxes.
4. Include technical details that lift directly from PRD where possible (event names, Zod schemas, file paths).
5. Define clear acceptance criteria — copy from PRD §19 (Acceptance Criteria) where it applies.
6. List **Contract impact** explicitly — this surfaces shared-types/shared-contracts ripple work upfront.
7. Create the issue using `gh issue create`. Report the URL.

## See also

- `investigate-issue` — for the matching read-side workflow
- `create-pr` — for the matching PR-creation conventions
- `monorepo-contracts` — for what counts as "Contract impact"
