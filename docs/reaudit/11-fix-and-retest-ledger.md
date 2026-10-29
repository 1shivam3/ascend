# Phase 11 — Fix-and-retest ledger (RE-AUDIT, 2026-10-29)

Rules in force: fixes exist ONLY as uncommitted changes in this audit
clone (`~/workspace/ascend-reaudit`). Nothing was committed, pushed,
merged, deployed, or published. No test or assertion was weakened; the
single test-file edit (i18n pin, item F-11) ADDS the deliberately-created
new file to a pinned list, with the reason recorded in the test itself.

## Retest gates — baseline tree vs fixed tree

| Gate | Baseline (24a712a5) | After fix batch |
|---|---|---|
| tsc --noEmit | clean | clean |
| lint | 0 errors / 97 warnings | 0 errors / 97 warnings (exact) |
| vitest | 2336 passed / 20 failed (all Docker-infra) | **2350 passed / 20 failed** (same 20; +14 new tests, all passing; 0 failures outside the known file — verified by grep) |
| build | PASS | PASS |

## Fixes applied in the clone

| ID | Finding (severity) | Fix | Files | Retest evidence |
|---|---|---|---|---|
| F-01 | SEC-R1 + E2E-R2 (P2) — coach-chat safety scan covered only the current message, English only | `findSafetyStop()` scans message + user history turns + grounding contextText; Hindi patterns added (दर्द/चोट/सूजन/मोच, उल्टी — starter set, needs native-speaker expansion) | src/lib/coach-chat.ts, src/app/api/ai/coach-chat/route.ts | tests/reaudit-fixes.test.ts (lib + route, incl. Hindi + history + context cases) |
| F-02 | E2E-R3 (P3) — safety refer-out blocked by quota denials | Route restructured: body parse → safety scan → quota outcomes captured; refer-out served regardless of quota state; denial precedence for benign requests unchanged (shared quota → chat cap → provider); daily cap still counts every parsed request (documented exception) | src/app/api/ai/coach-chat/route.ts | reaudit-fixes route tests: refer-out under exhausted quota (200/safety), benign+quota-denied still 429, benign+daily-denied still 429 DAILY_CAP; full existing coach-chat suite green |
| F-03 | SEC-R8 / E2E-R4 (P3) — sanitizeHistory kept the FIRST 10 turns | Collect-then-slice: keeps the most recent 10 | src/lib/coach-chat.ts | reaudit-fixes test (m4…m13 survive); existing sanitize test green |
| F-04 | DI-R1 (P2) — sync union could create same-date body-metric duplicates; next push violates UNIQUE(user_id, date) | New pure helper `dedupeBodyMetricsByDate` (newest updatedAt wins, local wins ties); applied at BOTH pull sites (merge + adoption); superseded rows tombstoned via deletedBodyMetricIds | src/lib/supabase/reconcile.ts, src/lib/supabase/sync.ts | reaudit-fixes unit tests (3); all sync suites green (gauntlet-body-metric-sync, sync-pull-adoption, sync-pull-recompute, sync-push-error-status, newest-wins, offline-resilience, plan-deletion) |
| F-05 | DI-R2 (P3) — baseline backfill could stack onto a user-logged date | Skip backfill when a row already exists on the baseline date | src/lib/store.ts | full suite green |
| F-06 | DI-R3 (P3) — addBodyMetric stored dates verbatim | Normalize via isValidEntryDate → local today, mirroring updateBodyMetrics | src/lib/store.ts | full suite green |
| F-07 | SEC-R2 (P3) — middleware floor trusted unvalidated XFF | clientIp validates format (same rule as lib/rate-limit.ts) before using XFF / x-real-ip; else 'unknown' | src/middleware.ts | gauntlet-batch4-big + api-route-allowlist suites green |
| F-08 | SEC-R4 (P3) — missing deletion secret surfaced as 500 DELETION_FAILED | Route catch maps the secret-configuration error to the route's existing 503 CONFIGURATION_ERROR shape | src/app/api/auth/delete-account/route.ts | account-deletion suite green |
| F-09 | SEC-R6 (P3) — CSP report body could inject log lines | CR/LF stripped from the logged report string | src/app/api/csp-report/route.ts | full suite green |
| F-10 | UX-R1 (P2) — CoachChatSection invisible to screen readers | aria-live="polite" on the message list (covers replies + sending state); role="alert" on all three error lines | src/components/CoachChatSection.tsx | code-verified; live SR check = parent stage |
| F-11 | UX-R2 (P3) — 2 unnamed icon buttons (WorkoutHeatmap month nav) | aria-labels from existing keys homeMatrix.prevMonth/nextMonth (no new i18n keys; parity untouched) | src/components/WorkoutHeatmap.tsx | full suite green |
| F-12 | UX-R3 (P3) — offline banner mouse-only | tabIndex={0} + Enter/Space key handler opens the details modal | src/app/page.tsx | code-verified; live keyboard check = parent stage |
| F-13 | PERF-R3 (P3) — no global-error.tsx | Added root global-error mirroring error.tsx (own html/body, ErrorState recovery, redacted logging; hard-reload justified + eslint-disable with reason, keeping lint at exactly 97) | src/app/global-error.tsx (new), tests/i18n.test.ts (pin updated to include the new deliberately-unwired file, reason commented in the test) | build PASS (route table unchanged); i18n suite green |

Diff: 12 files modified (+216/−55) + 2 new files (global-error.tsx,
tests/reaudit-fixes.test.ts, +14 tests). public/sw.js build churn restored.

## Findings deliberately NOT fixed in the clone (disposition + proposed fix)

| ID | Severity | Why not fixed here | Proposed path |
|---|---|---|---|
| E2E-R1 — topic lock / caution warnings / citation are system-prompt rules with NO output-side enforcement (hard-danger categories ARE mechanically blocked by the SEC-22 output guardrails) | P2 | Enforcement-vs-claim is a product decision, not a patch: either build an output-side topic/caution checker, or soften the "locked" claim to "guided". Tests currently pin only the prompt text | User decision; if enforcing, add an output scan + tests in a normal PR |
| SEC-R3 — middleware 404s unknown routes before the ceiling check, so probing is unthrottled by the floor | P3 | Middleware short-circuit never invokes a function (Vercel absorbs); reordering risks pinned floor semantics for negligible gain | Optional: move ceiling above allowlist in a future hardening PR |
| SEC-R5 — deletion nonce replay check degrades to per-instance memory when the ledger read errors | P3 | Fail-closed-vs-availability is a semantics decision (token still HMAC-verified + 15-min expiry bounds the window) | User decision; recommend fail-closed to match SEC-02 doctrine |
| DI-R4 — Settings restore runs both import paths; the direct blob write overwrites Path A's R1 stamps | P3 | Restore semantics are delicate (R1 convergence); removing a path needs its own focused change + restore-file live test (harness cannot drive file inputs) | Scoped PR: single-path restore + regression test |
| E2E-R8 — chat UI counter (30/day chat cap) overstates what's usable; the shared guest quota (10/day) binds first | P3 | Counter semantics are product copy: route would need to report the binding quota | Report min(chat cap, shared quota) remaining, or relabel the counter |
| E2E-R6 — perMuscle readiness context hardcoded [] in CoachChatSection | P3 | The readiness module lives on the unmerged coach branch (known PR #59 limit, recorded at merge) | Wire when/if the readiness module is ported |
| E2E-R9 — no render/interaction test for CoachChatSection | P3 | Repo has no component-testing stack (no testing-library/jsdom); adding one is a tooling decision | Adopt @testing-library/react + jsdom in a tooling PR |
| UX-R4 — hardcoded English in SW update banner, offline banner, skip link | P3 | SW banner strings live in the generated worker (scripts/generate-sw.js), outside React i18n; needs a small design, not a string swap | Pass locale into SW registration / move strings into the register component |
| UX-R5 — <html lang="en"> static; legal routes never corrected post-hydration | P3 | Needs route-level lang handling for static legal pages | Middleware-free fix: per-route metadata/lang in the legal pages |
| SEC-R7 — nested postcss under next is 8.5.23 vs top-level 8.5.29 | — | VERIFIED NOT A VULNERABILITY: advisory bound is ≤8.5.22; 8.5.23 is outside it. No action | none |
| DI-R5, E2E-R5, E2E-R7, UX-R6, PERF-R1, PERF-R2, PERF-R4, REG exceptions ×2 | P3 | Accepted designs / recorded trade-offs / owner decisions (documented in their phase docs; UX-R6 "Supabase" in legal copy is a processor-disclosure question for the owner, not scored as a defect) | none unless the owner revisits |
