# ASCEND — Combined Re-Audit: Final Report

**Date:** 2026-10-29 · **Revision audited:** master `24a712a5` (after PRs #58–#61)
**Scope:** fresh re-run of BOTH of the user's audit prompts as one pass — the
Pre-Release Audit (2026-10-27) and the Final Release Gauntlet (2026-10-28,
Phases 0–14). Fresh clone, independent pass; prior verdicts treated as
context, not conclusions. Production stayed READ-ONLY throughout.
**Full doc set:** `~/workspace/ascend-reaudit/docs/reaudit/` (00–12 + this report).

---

## Verdict: NO-GO — narrowly, and entirely remediable

**P0: 0 · P1: 0 · P2: 4 · P3: 27** (10 of the P3s already fixed in the audit clone).

Nothing found warrants taking the live app down, halting signups, or an
emergency patch. But by the standard both original prompts set — an open P2
in a flagship surface blocks an unconditional pass — the app as committed
does not pass a fresh audit two days after its "everything is done" moment.
The honest headline is better than the verdict sounds: **three of the four
P2s, plus ten P3s, are already fixed and gate-verified in the audit clone.**
The path to GO is one PR carrying that fix batch, plus one product decision
(P2 #3). On merge, this verdict flips to GO with no further audit required.

## The four P2s

1. **Coach-chat safety scan had two holes** (Security + E2E phases, found
   independently by both). The pre-provider pain/restriction scan read ONLY
   the current message: the same content arriving in conversation history or
   in the grounding context (which carries the user's check-in notes) was
   forwarded to the model unscanned. And the pattern lists were English-only
   — in a bilingual app, "मेरे कंधे में दर्द है" ("my shoulder hurts") sailed
   past the stop that "my shoulder hurts" triggers. The safety promise made
   at PR #59's launch was real on the main path and porous at both edges.
   **Fixed in clone:** a whole-request scan (message + user history +
   context) and a starter Hindi pattern set (flagged for native-speaker
   expansion, like all unreviewed Hindi).
2. **Sync could corrupt the one-entry-per-date invariant** (Data integrity).
   Every single-device write path dedupes body metrics by date, and the DB
   enforces UNIQUE(user_id, date) — but the cross-device pull merge unions
   by row id only. Two devices logging the same date produce duplicate
   local rows, and the next push violates the constraint and fails.
   **Fixed in clone:** a date-dedupe pass (newest wins, local wins ties) at
   both pull sites, with superseded rows tombstoned so they can't resurrect.
3. **Topic lock / caution warnings / citation are prompt-only** (E2E).
   They are system-prompt instructions; nothing on the output side enforces
   or tests them (tests pin the prompt text itself). The model complied in
   every live check at merge time, and the genuinely dangerous output
   categories (train through pain, skip the doctor, medication, extreme
   restriction) ARE mechanically blocked by the SEC-22 guardrail scan — but
   "locked" overstates the mechanism for topic drift, missed cautions, and
   uncited claims. **Open — the user's call:** build output-side
   enforcement, or describe the feature as guidance. Not fixable by an
   audit patch without making that product decision for him.
4. **The coach chat was invisible to screen readers** (UX/A11y). No
   aria-live, no alert role: replies, the sending state, and errors were
   never announced — unlike every other async surface in the app, which
   announces correctly. **Fixed in clone:** aria-live on the message list,
   role="alert" on the error lines.

## Also fixed in the clone (P3s, 10)

Safety refer-out no longer blocked by exhausted quotas (a capped user
reporting pain got 429/503 instead of help — the scan now outranks quota
denials while still counting against the chat cap) · history sanitizer kept
the FIRST 10 turns instead of the latest · middleware's rate-limit floor
trusted unvalidated X-Forwarded-For (bucket-minting) · baseline backfill
could stack a duplicate onto a user-logged date · addBodyMetric stored
dates unvalidated · missing deletion secret answered 500 instead of the
route's own 503 configuration shape · CSP report bodies could inject
forged log lines · the heatmap's only two unnamed buttons (of 757) got
labels · the offline banner was mouse-only, now keyboard-operable · a root
`global-error.tsx` now exists, so a layout-level failure no longer falls
to Next's unstyled framework page.

## What held up (verified, not assumed)

- **All four gates at baseline, exactly:** tsc clean · lint 0 errors /
  97 warnings · build PASS · vitest 2336 passed with the only 20 failures
  in the known Docker-infra file (local PostgreSQL absent here — same as
  every run since October; connection failure, not assertion failure).
- **Regression: 11/11** historical fixes from the 47 + 71 prior findings
  are present and reachable — sync/reset convergence (all three layers),
  SEC-20 floor, fail-closed limiters, coach-output guardrails, DI-05 volume
  rule, DOB picker, weekly-review cache, fork-trigger scoping, R7 401s,
  start-fresh contract, ui-mockups deletion.
- **i18n parity is perfect** (scripted diff): 2,958 keys in English =
  2,958 in Hindi, zero missing, zero empty, zero placeholder mismatches;
  coachChat.* is 67/67 in both.
- **Security floor is exact:** the middleware allowlist is set-equal to
  the 13 real API routes in both directions; all five AI routes fail
  closed and order their gates correctly; deletion tokens are HMAC +
  timing-safe + nonce-ledgered; zero hardcoded secrets and zero dangerous
  sinks in shipped code; service_role appears only in server-only files.
- **The dependency story is closed:** every version from the user's
  9-finding audit is at its fixed release in the shipped lockfile.
- **Product rules intact:** Train shows only user plans, week starts
  Monday everywhere, "Supabase" never appears in the sign-in flow (it does
  appear in legal copy — flagged for the owner as a processor-disclosure
  question, not scored), support email single-sourced, dark/light design
  tokens at parity (42/42).

## NOT TESTED (labeled, never guessed)

Live browser behavior (this stage has no browser — a six-item checklist
for the parent stage is in doc 12, including the single most informative
check: the Hindi pain message, which must flip from a model answer to the
refer-out once the fix merges) · the 20 DB-backed gate tests (no Docker) ·
R1 same-row two-device conflict and DI-R1's live two-device repro ·
R3 banner / SEC-06 emailed deletion link / signed-in sync live · keyboard
pass, screen reader, 200% zoom, true mobile viewport (harness limits,
unchanged since the first audit) · real-user results (the user's own loop;
none reported yet) · live RLS probing (the gauntlet's C-01 proof stands) ·
form-check (parked by the user; untouched).

## Handling

Everything the audit changed lives **uncommitted** in
`~/workspace/ascend-reaudit` (12 files modified, +216/−55; 2 new files;
14 new tests — fixed tree: **2350 passed / 20 known-infra**, tsc clean,
lint 0/97, build PASS). Nothing was committed, pushed, merged, deployed,
or published, per both prompts' hard rule. The fix batch is ready to
become a PR the moment the user says so — that PR, plus his decision on
the topic-lock claim, is the entire remaining distance to GO.
