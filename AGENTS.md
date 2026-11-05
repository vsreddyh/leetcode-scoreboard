<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## CI / PR review (same as agento — pasted from Discord-bots AGENTS.md)

- PR review loop (`opencode-review.yml`): every push to an open PR triggers an automatic review (usually ~2 min; timeout 10 min; a new push cancels the in-flight one). While waiting for review/checks, sleep between polls (`sleep 60`, then `gh pr checks` / `gh pr view --comments`) — never busy-loop. Verify each finding before fixing, then fix correctness, security, CI, documented rules and docs. Nothing real → ask the user to merge.
- Git workflow (no exceptions): ALL changes land on `main` via branch + PR — never commit or push directly to `main`, not even one-line fixes. After a PR merges, delete the branch locally AND remotely (`git branch -d <b>` + `git push origin --delete <b>`), then prune (`git fetch --prune`). Wipe any other branches already merged into `main` at the same time.
- **The Nth PR of a piece of work targets the branch of PR N−1, never `main`.** Start PR 1 against `main`; every PR after it targets the previous PR's branch, all the way up. Merge strictly bottom-up, one at a time. This holds for the Nth PR — it is not a "second PR" special case. PR 3 targets PR 2's branch whether or not PR 1 has merged yet. Why: two open PRs that both edit `CHANGELOG.md` and `android/agento/VERSION` will conflict the moment either merges under the other, and out-of-order merges produce a version whose changelog header does not match the version file. GitHub reports this as `DIRTY`, not as a failure, so it looks like a transient state and gets missed. Concretely: two app PRs at `4.14.5` and `4.14.6` both open against `main` means whichever merges second is no longer a valid version bump until rebased, and the rebase conflicts in `CHANGELOG.md` are indistinguishable from real ones. A stacked chain also makes the dependency explicit — `mergeable: true` against another PR's branch means "safe once the one below lands", whereas `true` against `main` means "safe now" and is a claim that is false whenever two PRs touch the same file.
- Scope note: the `CHANGELOG.md` / `android/agento/VERSION` rationale above is agento's motivating example (from Discord-bots, kept for cross-repo consistency). This repo has neither file; keep only the chaining rule itself — PR N targets PR N−1's branch, merge bottom-up.

## Build policy (CI owns storage; RAM checks are fine locally)

- NEVER run storage-heavy checks on this machine: no `npm run build`, no `.next` output, no Vercel CLI deploys, no `npm ci` reinstalls. Disk is constrained — keep the checkout lean (source only, no `node_modules`, no `.next`).
- ALLOWED locally (RAM-only, no disk writes): `npm run lint`, `npx tsc --noEmit`, reading code, `git` ops. (`tsc --noEmit` type-checks in memory; the old ban on it is lifted.)
- `ci.yml` (`npm ci` + `npm run lint` + `npm run build`) runs on every PR and every `main` push, plus Vercel Preview on PRs. A PR merges only when CI is green AND the reviewer has no non-negligible findings.
- Local iteration uses `npm run dev` (needs `node_modules` — reinstall only if you must, then delete it after). When CI fails, fix and push — do not reproduce with a local build.
