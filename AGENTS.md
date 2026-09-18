# Repository agent policy

## Scope boundary

- Do not start implementation, create a branch or PR, dispatch CI, archive an
  OpenSpec change, or merge unless the user explicitly requested that action.
- Treat the selected GitHub issue and its associated OpenSpec change as the
  complete scope. Do not include unrelated refactors, dependency updates, or
  opportunistic fixes.
- Report newly discovered out-of-scope work instead of implementing it.
- Never weaken tests, CI, branch protections, or review rules to obtain a pass.
- Stop and ask before making decisions about security, authentication,
  authorization, privacy, billing, destructive migrations, or conflicting
  product requirements that are not resolved by the selected issue.

## Issue delivery workflow

Run the full issue-to-merge workflow only when the user explicitly invokes the
`ship-issue` skill. The invocation authorizes work on one selected issue and a
merge only after every gate in that skill passes. It does not authorize work on
additional issues.

- Use `issue_planner` to establish the issue/OpenSpec scope before editing.
- Use `implementer` as the only code-writing agent.
- Use `reviewer` after every implementation or review-fix round.
- Add `security_reviewer` when the diff affects trust boundaries, credentials,
  authentication, authorization, secrets, parsing of untrusted input, or data
  access controls.
- Do not run remote integration CI until the required reviewers approve.
- After OpenSpec sync and archive, run remote integration CI again against the
  new exact PR head SHA. Merge only that verified SHA.

