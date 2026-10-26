<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## CI / PR review (copied from Discord-bots)

- PR review loop (`opencode-review.yml`): every push to an open PR triggers an automatic review that posts findings as PR comments (typically within ~2 min; job timeout 10 min; a new push cancels the in-flight review). Keep addressing all findings and pushing until both sides are satisfied: the build/tests pass AND the reviewer has no non-negligible findings.
- Reviewer is Muse Spark 1.3 Contributor via the official OpenCode GitHub action (`anomalyco/opencode/github@latest`, model `opencode-go/muse-spark-1.3-contributor`, per https://opencode.ai/docs/github/ Pull Request Example). Trigger is `pull_request` only: no `/oc` comment commands, no issue triage, no schedules. Review-only: `contents:read` so it cannot push code; it posts findings as PR comments.
- Fork PRs have no `OPENCODE_API_KEY` secret, so the job skips instead of failing. Requires `OPENCODE_API_KEY` repo secret (same as Discord-bots).
- The reviewer reads back scratch files it stages in `/tmp`. Repo-root `opencode.json` grants `/tmp/*` (the CLI's matcher turns `*` into `.*`, so that covers nested temp dirs too); do not delete it as dead config (Discord-bots #319).
