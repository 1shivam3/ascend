# ASCEND — Final Certification: Regression Results (Round 3)

Round 3 verified the six Round-2 fix PRs **as a composed stack**, then ran the
charter's two-consecutive-pass condition. Method and measured evidence below.
Nothing in this round modified production or master; the stack branch is
local-only and was never pushed.

## 1. Stack construction

- Base: master `62e25543` (unchanged; production still serves it).
- Local branch `cert-stack-verify` (in scratch clone `~/workspace/ascend-cert-stack`),
  final stack commit **`840beffb822ba4dd63547b6ebf145154ee540b83`**.
- Merge order and per-PR result:

| Step | PR | Branch | Result |
|---|---|---|---|
| 1 | #95 | `fix/form-coach-design-tokens` @ df2f704 | clean |
| 2 | #96 | `feat/edit-completed-sets` @ 7e63fc8 | clean |
| 3 | #97 | `fix/cold-start-honesty` @ 928891d | clean |
| 4 | #98 | `fix/certification-p3-functional` @ e24e4f1 | clean |
| 5 | #99 | `perf/lazy-hindi-dictionary` @ 89b2f35 | clean — notable: its i18n restructure composed cleanly with the string appends from #96/#97/#98 |
| 6 | #100 | `fix/certification-p3-a11y` @ ee359a9 | **CONFLICT — 2 files, both against #95** (see §2) |

## 2. Merge-sequence findings (for the owner)

Only one collision exists in the whole set: **#95 × #100**, in two files,
caused by both PRs editing the same `className` strings for *different*
tokens. Both resolutions are mechanical compositions — neither PR's intent
is lost:

| File | #95 changed | #100 changed | Resolution applied |
|---|---|---|---|
| `src/components/GoalSelectorModal.tsx` (2 pill spans) | `text-4xs` → `text-2xs` | `py-0.2` → `py-0.5` | `text-2xs … py-0.5` (both) |
| `src/features/form-coach/components/FormSessionSummaryModal.tsx` (count badge) | `bg-surface-base` → `bg-surface-highlight`, `text-3xs` → `text-2xs` | `py-0.2` → `py-0.5` | `py-0.5 … bg-surface-highlight` |

Recommendation: merge in PR-number order (#95 → #100). Expect exactly this
one conflict, at the #100 step; it resolves in minutes by composing the
class strings as above. Post-resolution checks on the stack tree: zero
remaining `text-4xs` / `py-0.2` in `GoalSelectorModal.tsx`, zero remaining
`surface-base` / `accent-primary` in `FormSessionSummaryModal.tsx`.

## 3. Gate results on the stack (Pass A)

| Gate | Result |
|---|---|
| Full test suite | **2,881 passed / 20 failed / 2,901 total** (254 files). All 20 failures are in `tests/security-integration-gate.test.ts` — the exact Docker/PostgreSQL baseline signature of master. Arithmetic: 2,802 master + 3 (#95) + 21 (#96) + 20 (#97) + 20 (#98) + 6 (#99) + 9 (#100) = 2,881. No other failure anywhere. |
| `tsc --noEmit` | exit 0 |
| ESLint, union of all touched files (38 files) | **0 errors** (65 warnings, pre-existing population) |
| Production build | succeeds; service worker generated with **26 precache assets** (confirms #99's 27 → 26) |

## 4. Headline scenario re-drives (Pass A)

Local production build of the stack (headless Chromium, guest, fresh
profiles; the exact scenarios that produced the findings):

| # | Scenario (finding) | Result | Measured evidence |
|---|---|---|---|
| S1 | Form Coach modal @390px (F-02 / UI-1b-01 / UI-1b-07) | **PASS** | Panel element `bg-surface … rounded-2xl`; computed background **rgb(255, 255, 255)** (pre-fix rgba(0,0,0,0)); border radius **16px** (was 24px). Accent tile present under Vermilion; after switching the app accent to Cobalt (`--accent` = `37 99 235`), the modal shows the cobalt tint **rgba(37, 99, 235, 0.1)** and **zero** elements with any vermilion value. |
| S2 | Correct-a-set task (F3) | **PASS — 11/11 checks** | Logged 100×5 (set 2 pre-filled 100). Reopened set 1 via its "Set 1 — logged. Tap to edit." pill → "Editing logged Set 1" notice → corrected to 10. Store draft after edit: `[10×5 done, 100 pending, 100 pending]` — **the pre-fill guard holds** (master rewrote set 2). Completed set 2 at 100×4 → pre-save sheet **450 kg** → saved workout volume **450** → PR minted: Dumbbell Bench Press **100×4, e1RM 113.3**. History edit of set 2 (100→40): volume **210 kg**, history reads "Set 2: 40 kg × 4", and the PR record was **re-based in place** — single record, now **40×4, e1RM 45.3**, no stale 100×4. |
| S3 | Cold start (UI-1b-02) | **FAIL — see R3-01 (§6)** | All #97 surfaces pass (below); one residual surface does not. |
| S4 | Meal builder (F6 / F7) | **PASS — 8/8 checks** | "Meal Name *" required marking present; qty 200 on the blank row → MEAL TOTAL **0 kcal**; quick-add Paneer fills the blank row (still 1 food block) → **265 kcal**; in F6's exact state (food present, unnamed) the hint "Give this meal a name above to save it." is visible **and** Save Meal is disabled; naming the meal enables Save. |
| S5 | Onboarding (F1 / F2) | **PASS** | Empty-name Continue renders the designed error "Please enter your name or athlete nickname." (form carries `noValidate`); name typed at details **survives offer → details back-navigation** ("Stack Tester" intact in `#details-name`). |
| S6 | First load / language (PERF-2) | **PASS — 6/6 checks** | English cold load: 26 JS requests, Hindi chunk (`3k3djrwspykfy.js`, 296,158 B raw on the stack) **not among them**; switching to हिंदी fetches it and the UI renders Devanagari; Hindi cold start fetches the chunk during boot, lands in Hindi UI, and the English tagline "Your workout and food log." is **never visible** during load (polled). |
| S7 | Accessibility trio (A11Y-01 / UI-1b-04 / UI-1b-06) | **PASS — 4/4 checks** | Active bottom-nav label contrast measured **4.66 : 1** (was 3.57 : 1). Today (Simple): DOM order == visual order for Today's Workout → Nutrition → Protein → Quick actions → Hydration. Training Tools sheet: **every** button has an accessible name; the close button's name is **"Close"**. |

S3 detail (the parts that pass): fresh profile → no "didn't get logged"
framing on Home; Coach check-in shows no missed-yesterday card; no
"0 of 32" athlete fact; no "most often missed" claim; the full weekly
review modal for the pre-account week (2026-10-26 → 2026-11-01) renders
**"This week predates your plan — no sessions were due, and none were
missed"** with **PLANNED SESSIONS DONE 0 / 0** and no Missed-days line.

## 5. Pass B — independent confirmation

- Full suite re-run on the **same stack commit** (`840beff`): **identical
  result — 2,881 passed / 20 failed (2,901)**, all 20 in
  `tests/security-integration-gate.test.ts`, zero failures elsewhere.
  No flakiness between passes.
- S2 re-drive: **PASS (11/11)**, identical values (450 kg → PR 113.3 →
  History edit → 210 kg, PR re-based 45.3).
- S3 re-drive: **FAIL on the identical single check** (R3-01) — the
  finding is deterministic, not flaky; every #97 surface passes again.
- Stack tree confirmed unchanged after Pass B (`git status` clean for
  `src/` and `tests/`; HEAD still `840beff`).

**Charter condition check:** two consecutive suite passes with no new
P0/P1 — **met for the test suite**. The scenario condition is **not** met:
Round 3 surfaced one new P2-class residual (R3-01). It is reported, not
softened, in §6.

## 6. Round-3 finding R3-01 (P2, residual of UI-1b-02)

**What a brand-new user still sees.** Onboarding completed on Wednesday
2026-11-04 (plan created that day; scheduled days Mon/Tue/Thu/Fri). The
Coach tab's "This week" adherence card reads:

> **0 of 4 sessions done so far**
> **More than half the week was missed — the coach suggests one change:
> fewer training days next week, so the plan fits your life.**

Monday and Tuesday of this week predate the plan's existence, yet they are
counted as *due and missed* — the same misrepresentation class as
UI-1b-02, on a surface PR #97 did not cover. It affects any user whose
plan starts (or restarts) mid-week, during their first week only.

**Root cause.** `src/components/CoachChatTab.tsx` computes `weekAdherence`
in an inline `useMemo` (≈ line 316): `planned = scheduled.length` (all 4,
including future days), and `dueCount` counts scheduled days strictly
before today (the FE-02 elapsed-day clipping). `weeklySuggestion`
(`src/lib/coach-session.ts`) then fires `shrink` when ≥ half the week's
sessions are due and < half of those are done — here due = Mon+Tue = 2.
Neither computation consults the plan-start anchor
(`earliestDataDate()` / `startsOn`) that PR #97 introduced for the weekly
review, athlete model, and check-in surfaces.

**Fix sketch (small, for a follow-up PR).** Anchor this card the same
way: exclude scheduled days before the plan's start from both `planned`
(as displayed for the current week) and `dueCount` before calling
`weeklySuggestion`. With no eligible due sessions, the suggestion falls
back to `hold` and the honest copy. Add a day-one persona test mirroring
#97's.

**Severity rationale.** P2, matching UI-1b-02: a false adherence verdict
shown to a new user at the moment trust forms; no data is wrong, and it
self-corrects from the second week onward.
