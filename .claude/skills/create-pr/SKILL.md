---
name: create-pr
description: Create a pull request following Chat-app conventions with gh pr create
disable-model-invocation: true
---

# Create Pull Request

Create a pull request following the Chat project's conventions.

## Your Task

Create a PR that properly links to issues and follows the project's PR format.

## PR Title Format

Conventional Commits with scope:

- `feat(scope): description` — new feature
- `fix(scope): description` — bug fix
- `refactor(scope): description` — code restructuring
- `docs(scope): description` — documentation
- `test(scope): description` — tests
- `chore(scope): description` — maintenance

**Project scopes**: `auth`, `api`, `web`, `chat`, `rtc`, `socket`, `pinia`, `db`, `pwa`, `i18n`, `stripe`, `theme`, `deploy`, `contracts`, `types`, `lint`

## PR Body Format

```markdown
Closes #{issue_number}

- {bullet 1}
- {bullet 2}
```

Or for bug fixes:

```markdown
Fixes #{issue_number}

- {bullet 1}
- {bullet 2}
```

## Examples

### Feature PR

```markdown
Closes #12

- Add GET /api/conversations returning Conversation[] derived from messages
- Add ConversationRow + OnlineNowStrip components (shared mobile + desktop sidebar)
- chat store: fetchConversations + move-to-top invariant on message:new
- Mobile pull-to-refresh wired
```

### Fix PR

```markdown
Fixes #27

- Route every WebRTC terminal state through a single endCall() function
- Stop all local tracks before pc.close()
- Verifies camera light goes off on both peers after hangup
```

## Command

```bash
gh pr create \
  --title "feat(scope): description" \
  --body "$(cat <<'EOF'
Closes #N

- Change 1
- Change 2
EOF
)"
```

## Pre-PR Checklist

```bash
git status                                  # no unintended changes
pnpm exec ultracite check                    # clean
pnpm exec ultracite check          # clean
node tools/check-boundaries.mjs             # exits 0
pnpm exec nx affected -t test               # green
pnpm exec nx affected -t build              # green
```

For changes touching `libs/shared-*`: also run lint + test on **both** `apps/web` and `apps/api`, since the contract sync matters.

## Instructions

1. Review the changes with `git diff` and `git log`
2. Identify which issue(s) this PR closes
3. Write concise bullet points describing each change
4. Use the appropriate conventional commit format for the title
5. Include `Closes #N` or `Fixes #N` to auto-link issues
6. Call out contract changes (new socket events, Zod schemas, REST endpoints) explicitly
7. For WebRTC fixes: include the "camera light off" verification line
8. Create the PR and report the URL

## See also

- `create-issue` — for the matching issue-creation conventions
- `gh-issues` — for cross-referencing linked issues
- `ultracite-lint` — for the pre-PR check trio
- `monorepo-contracts` — for the contract-sync rule (touch both apps in one PR)
