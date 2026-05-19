---
name: investigate-issue
description: Gather context and requirements for a GitHub issue using gh issue view and related commands
disable-model-invocation: true
---

# Investigate GitHub Issue

Investigate a GitHub issue to understand requirements and context before implementation.

## Your Task

When given an issue number or URL, gather all relevant information and produce a summary that an implementer can pick up cold.

## Investigation Steps

### 1. View Issue Details

```bash
gh issue view {number} --json title,body,labels,milestone,state,comments,assignees
```

### 2. View Issue Comments

```bash
gh issue view {number} --comments
```

### 3. Cross-reference PRD + PLAN

If the issue body references a PRD section (e.g. "PRD §11.3"), open `PRD.md` and read that section. If it references a PLAN phase, open `PLAN.md` and read that phase. **These take precedence over the issue body when they conflict** — the issue may have been written before a PRD revision.

### 4. Check Related Issues

```bash
gh issue list --search "{keywords} in:title,body" --state all --limit 10
```

### 5. Check Linked PRs

```bash
gh pr list --search "#{number}" --state all
```

### 6. Inspect Existing Code

If the issue touches an existing surface, read the current implementation:

- Socket events → `apps/api/src/app/sockets/`, `apps/web/src/composables/useSocket.ts`
- REST endpoints → `apps/api/src/app/routes/`
- Vue surfaces → `apps/web/src/pages/`, `apps/web/src/components/`
- Stores → `apps/web/src/stores/`
- Shared contracts → `libs/shared-contracts/src/lib/`
- Shared types → `libs/shared-types/src/lib/`

## Output Format

Provide a summary including:

1. **Issue overview**: Title, state, labels, linked PRD section, target PLAN phase
2. **Summary**: 1–2 sentences on what the issue is about
3. **Tasks**: Outstanding tasks from the checkbox list (call out any already done)
4. **Technical context**: Key technical details — event names, schemas, file paths
5. **Contract impact**: Shared-types / shared-contracts / socket events / REST endpoints affected
6. **Acceptance criteria**: What "done" means (from issue + PRD §19)
7. **Related issues / PRs**: Any linked work
8. **Blockers**: Dependencies on other phases/issues (e.g. "blocked by #N — needs `chat` store conversations action")
9. **Suggested next step**: A concrete first move

## Sub-Issues Investigation

If the issue has sub-issues (GitHub native sub-issues):

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

## Instructions

1. Fetch the full issue details
2. Parse the body to identify tasks, technical details, acceptance criteria
3. Cross-reference against `PRD.md` and `PLAN.md`
4. Inspect any existing code the issue touches
5. Summarize findings — including any drift between the issue and the current PRD/code state
6. Identify blockers and dependencies
7. Suggest a concrete next step

## See also

- `gh-issues` — for the underlying gh CLI commands
- `create-pr` — for the next step when investigation leads to implementation
- `monorepo-contracts` — for "Contract impact" assessment
