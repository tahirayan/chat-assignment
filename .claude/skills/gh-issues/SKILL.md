---
name: gh-issues
description: gh CLI reference for issues in this repo — view, list with filters (label, assignee, search), comment, edit (labels/milestone/assignee), close/reopen, cross-reference linked PRs, GraphQL for sub-issues. Use when the user references an issue by number, when investigating linked PRs/issues, when triaging, or when scripting issue queries with --json + --jq.
---

# GitHub Issues — gh CLI Reference

Quick reference for working with issues on the Chat project's GitHub repo.

## View

```bash
gh issue view {number}
gh issue view {number} --comments
gh issue view {number} --json title,body,labels,milestone,state,assignees
gh issue view {number} --web                # open in browser
```

## List & Search

```bash
gh issue list                                # open issues
gh issue list --state all
gh issue list --label enhancement
gh issue list --label bug
gh issue list --assignee "@me"
gh issue list --search "stripe in:title,body"
gh issue list --search "phase 13"
gh issue list --json number,title,state,labels --limit 50
```

## Create / Edit

See `.claude/skills/create-issue/` for the templated workflow.

```bash
gh issue edit {number} --add-label "bug"
gh issue edit {number} --remove-label "needs-triage"
gh issue edit {number} --milestone "MVP"
gh issue edit {number} --assignee "@me"
```

## Comments

```bash
gh issue comment {number} --body "Implemented in #N"
gh issue comment {number} --body-file comment.md
```

## Close / Reopen

```bash
gh issue close {number}
gh issue close {number} --comment "Superseded by #M"
gh issue reopen {number}
```

## Cross-Reference

```bash
# PRs that reference this issue
gh pr list --search "#{number}"

# Recent activity across both
gh issue list --search "is:open updated:>=2026-05-01"
```

## Sub-Issues (GraphQL)

```bash
gh issue view {number} --json id --jq ".id"

gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f query='
    query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          subIssues(first: 20) {
            nodes { number title state }
          }
        }
      }
    }
  ' \
  -f id="{issue_id}"
```

## Useful Project Filters

```bash
# Phase-tagged issues (if you adopt phase labels)
gh issue list --label "phase:13"

# Issues touching shared contracts
gh issue list --search "shared-contracts OR shared-types"

# Bonus-feature issues (per PRD §1.3)
gh issue list --search "stripe OR webrtc OR pwa OR i18n"
```

## Tips

- Use `--json` + `--jq` for scripting; the raw JSON makes it trivial to feed into other commands.
- When closing as superseded, comment with the replacement issue/PR number so the audit trail survives.
- For long bodies use `--body-file` rather than escaping inline.

## See also

- `investigate-issue` — the structured deep-dive for a single issue
- `create-issue` — for the body conventions on new issues
- `create-pr` — for cross-linking via Closes #N / Fixes #N
