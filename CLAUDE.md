# Project rules

## Git branches

- The main branch is `main` (not `master`).

## Git commits

- Use Conventional Commits: `<type>(<optional scope>): <subject>`
  - types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`
  - subject: imperative, lowercase, no trailing period, ≤ 72 chars
- Subject line only — no body or description.
- No trailers: never add `Co-Authored-By`, `Claude-Session`, or any other attribution lines.
- The commit author is the repo's git user, never Claude.
- Pull requests: no "Generated with Claude Code" or other attribution lines.
