# Phase 2 — Test environment (RE-AUDIT, 2026-10-29)

## What ran where

| Layer | Environment | Status |
|---|---|---|
| Type check | this VM, Node v24.22.1, repo tsconfig | RAN — clean |
| Lint | this VM, ESLint 9.39.5 flat config (`eslint.config.mjs`) | RAN — 0 errors / 97 warnings |
| Unit/integration tests | this VM, vitest (`npm test`) | RAN — 2,356 tests, 196 files |
| DB-backed security gate | `tests/security-integration-gate.test.ts` needs a real local PostgreSQL (Docker) | NOT RUNNABLE here — 20 tests fail on connection ("fetch failed"), identical to every prior run; this is the documented pre-existing infra dependency, not a regression |
| Production build | this VM, `next build` (Turbopack) | RAN — PASS |
| Live browser checks | parent agent's browser stage (this audit's agents cannot operate the live browser) | PARENT-STAGE — itemized in 12-final-verification.md |
| Production site | https://ascendtonext.vercel.app/ | READ-ONLY by rule; no requests needed for this pass beyond what the parent stage runs |
| npm audit endpoint | registry security endpoint | BLOCKED (403 in this sandbox) — versions verified from the lockfile instead (see 00-baseline.md) |

## Reproducibility notes

- The clone is byte-identical to master 24a712a5 (fresh `git clone`, clean
  status at baseline). `npm install` resolved strictly from the committed
  lockfile, including the PR #61 overrides.
- The build's `prebuild` step regenerates `public/sw.js`; the file shows as
  modified after any local build and was restored — the same known churn
  both prior audits recorded. It is a build artifact, not a finding.
- No environment variables were required for the gates above. Live-provider
  behavior (Groq/Gemini/Cloudflare AI calls, Supabase RPC against the real
  project, QStash, web-push) is NOT exercised from this environment — routes
  are verified by code path + unit/integration tests with mocked providers,
  and end-to-end behavior on the real deployment belongs to the parent
  browser stage and the user's own real-user testing (Phase 10).

## Known environment blind spots (carried honestly into the verdict)

1. No Docker → the 20 DB-backed security-gate tests cannot execute here.
   Their assertions are unchanged from the gauntlet-verified state; the
   failure mode is connection refusal before any assertion runs.
2. No live browser in this stage → all rendering/interaction claims rest on
   code + tests until the parent stage runs its itemized checklist.
3. No real device → Capacitor/Android behavior, camera, Health Connect,
   and true mobile viewports are out of reach here (as in both prior audits).
