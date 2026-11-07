# QA-Hardening Phase 3 — Scripted Re-Verification Report

**Branch:** `qa/phase3-verification` (from master `2f8a9199`, PRs #119–#121 merged)
**Scope:** SETUP + six scripted re-verification checks, one commit per area.
**Rules honored:** harness AI mocks only (no real AI endpoints called); auth
verified with a stubbed provider only (no real Supabase project, no real
accounts); nothing merged — this branch is for the owner's review.

## Final gate numbers (own full run at commit `9058da7`)

| Gate | Result | Baseline at 2f8a9199 |
|---|---|---|
| vitest | **3,788 passed / 20 failed** (3,808 total) | 3,732 / 20 |
| lint | **107 problems** (2 errors in vendored `public/mediapipe/wasm/*.js`, 105 warnings) | 107 |
| tsc | **clean** (exit 0) | clean |
| build | **exit 0** | exit 0 |

The 20 failures are the pre-existing Docker-only `security-integration-gate`
suite (no Docker in this environment) — unchanged from baseline. Net new
passing tests from Phase 3: **+56**.

## SETUP — harness `setTheme` fix — commit `c4e8888` — DONE

`qa/fixtures/helpers.ts setTheme` now writes the app's own theme keys the way
`store.setTheme` does (standalone `ascend_theme` + `ascend_has_custom_theme='true'`
via init script, plus the persisted blob), reloads, and **asserts
`html[data-theme]`** before returning. Root cause of the old flaw:
`public/theme-init.js` honors a stored theme only as a custom choice via those
standalone keys; the old helper patched only the blob, so dark screenshots
silently followed the OS (light). All 14 Phase 0/1 screenshots taken through the
broken helper were re-shot by re-running their own specs (r8, r10) — every dark
shot is now genuinely Graphite. **No dark-mode defect was found** (one murky
320×568 frame was proven a mid-fade capture, not a defect).

*Evidence-scope note:* the r8/r10 post-theme shots show the Train landing
screen — the app does not restore an open workout/chat across the helper's
reload. Their layout assertions are measured in-page before the theme switch;
the screenshots evidence theme + landing layout only.

## Check 1 — Meal-scan trust — commit `3d8aa04` — **PASS** (+ finding F3-1)

- Unit: `tests/qa-phase3-scan-trust.test.ts` (7 tests) — the scan route stamps
  computed confidence over a lying model payload; unknown food is Low; edits
  surface `userVerified` but never inflate a level; meal confidence = weakest
  item; aliases resolve (toor/arhar/pigeon pea → toor dal; chana dal keeps its
  identity, never "chickpea"); the audit mislabel case sanitizes to the
  canonical name.
- E2E: `qa/e2e/p3-scan-trust.spec.ts` (android-360x740) — while analyzing, the
  thumbnail + elapsed timer are visible; the review pins the **Estimated**
  badge and the computed total (~405). A route-shaped payload whose items lie
  (`confidence:'high'`, one impossible 4,000 kcal / 10 g item) renders the
  modal's own computed **Low**, the canonical "Toor Dal (Pigeon Pea)", and
  "Chana" appears nowhere in the dialog.
- Evidence: `qa/screenshots/p3-scan-trust/review-high-light.png`,
  `qa/screenshots/p3-scan-trust/review-low-alias-light.png`.

## Check 2 — Form Coach report truthfulness — commit `ffa3715` — **PASS** (analyzer + string levels); rendered summary DOM **NOT TESTED**

- `tests/qa-phase3-form-coach.test.ts` (8 tests) drives the real
  `DeadliftAnalyzer`/`SquatAnalyzer` with the fixture streams in
  `qa/fixtures/form-coach/` (3 detected reps each): valid + failed +
  unverified always sum to detected; feet below the visibility threshold →
  reps **unverified** with the exact reason copy `Could not verify lockout
  (feet out of frame) on N rep(s).`, never "Incomplete Lockouts"; the same
  stalls with feet visible ARE failures. Tempo is present when the reps'
  timestamps reconstruct the set (50%–110% band of `computeTempoSeconds`)
  and `null` (→ "Tempo unavailable") after a +60 s post-set rest. Summary
  strings resolve in en + hi with no enum/snake_case leaks.
- **NOT TESTED, plainly:** the summary modal's rendered DOM. Landmarks come
  only from the MediaPipe worker on a user-picked video and there is no
  injection hook (documented Phase 0 limitation,
  `qa/fixtures/form-coach/README.md`). See also finding F3-4.

## Check 3 — Accent contrast — commit `ed93988` — **PASS**

`tests/qa-phase3-accent-contrast.test.ts` (23 tests), computed from the real
tokens (`src/lib/accent-themes.ts`, `globals.css`): all 6 presets (Vermilion,
Cobalt, Forest, Plum, Teal, Rose) × Chalk + Graphite — accent-text on page bg
≥ 4.5, on-accent on accent fill ≥ 4.5, accent-text on subtle blend ≥ 4.5,
accent fill vs page bg ≥ 3. New leg: 3 fixed-seed random custom hexes
(mulberry32 seed 20261107 → `#93F2B9`, `#B992BC`, `#A82C62`) through the real
`deriveCustomAccent` pass in both themes. Accent-independent pairs also pass:
the shared disabled button style and the habit-matrix glyph inks (water /
creatine / protein) ≥ 4.5 in both themes. **No token changes were needed.**

## Check 4 — Text-size clipping — commit `87ae286` — **PASS after 1 defect fix** (+ findings F3-2, F3-3)

`qa/e2e/p3-textsize.spec.ts`: 9 screen drives (the brief's 8 screens, Active
Workout in Beginner + Advanced views) × Large/Extra Large × 360×740 +
320×568 × light + dark = **36 tests, all passing** after the fix; 72
screenshots in `qa/screenshots/p3-textsize/`.

- **DEFECT FIXED (fail-before → pass-after):** at 320×568 / Extra Large, the
  Today Hydration card's quick-add row (+250/+500, 146 px) could not fit the
  card — the +500 button hung off the card and off-screen, causing a 5 px
  horizontal document overflow on Today and (the page behind it) the Reminder
  Center. Fail-before: 3 failing tests, docOverflow = 5, row right edge
  324.75 px (evidence: `qa/screenshots/p3-textsize/evidence-prefix-today-xlarge-320.png`).
  Fix (`src/components/HomePage.tsx`): the header row wraps (`flex-wrap`,
  `gap-2`) and the button group is `ml-auto`, so the buttons take their own
  right-aligned line instead of overflowing. Pass-after: 36/36, docOverflow 0.
- **F3-2 (finding, not a defect):** the "Graphite" theme pill measures
  scrollWidth 70 vs clientWidth 67 at xlarge/320. Screenshot + text-range
  measurement prove the word paints complete (~2.5 px overhang, overflow-x
  visible, no visible box when unselected) — painted, not clipped. The
  harness clip detector gained a narrow, documented visible-spill rescue
  (overhang ≤ 4 px with visible overflow); larger spills still fail.
- **F3-3 (finding, cosmetic):** at 320×568 / Extra Large the Today
  quick-actions tiles wrap labels letter-by-letter ("Sca/n/Mea/l") — fully
  visible, nothing clipped, but poor. Owner's design call.

## Check 5 — Hindi completeness (mechanical) — commit `f4ace18` — **PASS after fixes** (+ findings F3-4, F3-5, F3-6)

- Unit: `tests/qa-phase3-hindi.test.ts` (5 tests) — all **3,284** en keys
  exist in hi with non-empty values; `translate('hi', …)` resolves the Hindi
  value for every key (no silent English fallback, no raw key, no key echo);
  interpolation placeholders match en↔hi (one documented exception class,
  F3-5).
- E2E: `qa/e2e/p3-hindi.spec.ts` — hindi persona across Today / Train /
  Progress / Fuel / You; a surface "leaks" if it renders an English dictionary
  value verbatim while a different Hindi value exists. Fail-before: 2 leaks
  (Train). Pass-after: **0 leaks**. Screenshots: `qa/screenshots/p3-hindi/`.
- **DEFECTS FIXED:** WorkoutPage's Quick Tools Row hardcoded "Suggested
  Workout" and "Log Past Session" in English although both translations
  existed — now `t('sg.fallbackWorkout')` / `t('tools.pastTitle')`. The
  "Adjust plan" button had no key at all — added `workout.adjustPlan`
  (en + machine-translated hi, flagged unreviewed in code, per convention).

## Check 6 — Account lifecycle, guest → email — commit `9058da7` — **PASS after 1 defect fix**; provider round-trip **NOT TESTED**

`tests/qa-phase3-account-lifecycle.test.ts` (13 tests), Supabase client
stubbed via `vi.mock` throughout — never the real provider.

- **(a) Guest data survives the upgrade:** `shouldOfferMergeChoice` fires
  only in the two-sided case; `evaluateSignInMergeGate` gates the canonical
  guest case and stands down for a recorded resolution, which is bound to
  `mergeChoiceDataSignature` (different data re-gates). The 'merge' mechanics
  (`mergeRemoteRecords`, the guest-migration pull-merge) are a union: every
  guest record survives, account-only records join, local wins id collisions,
  tombstones never resurrect. The 'keep' mechanics at store level:
  `startFreshFromRetainedHistory` archives **all** guest records under
  `ascend_archived_history` (restorable) before resetting the live
  collections — the choice never destroys data.
- **(b) Wrong-password errors are generic (F-10):** with the stubbed
  provider, `signInWithPassword` returns *different* raw strings for
  "Invalid login credentials" vs "Email not confirmed" (the second reveals
  the account exists) — the UI generic key is load-bearing. **DEFECT FIXED:**
  LoginScreen and CreateAccountScreen genericized `res.error` but their
  `catch` blocks rendered `err?.message` raw into the form banner,
  contradicting F-10 and each file's own comment; both catches now assign
  only the generic key (`auth.signInFailed` / `auth.createFailed`, whose copy
  carries no enumeration wording). Fail-before: the wiring assertions failed
  on exactly those two files (AuthModal was already clean). Pass-after: 13/13.
- **NOT TESTED (needs the real provider — stated, not simulated):** the
  actual Supabase Auth credential round-trip, email-verification delivery,
  OAuth/OTP sign-in, the rendered MergeChoiceModal against a backend, and
  cross-device convergence of merged data.

## Defects fixed in Phase 3

| # | Defect | Fixed in |
|---|---|---|
| 1 | Harness `setTheme` never actually applied dark (Phase 0/1 dark screenshots invalid) | `c4e8888` |
| 2 | Hydration quick-add row overflows 320 px at Extra Large (+500 button off-screen, 5 px page overflow) | `87ae286` |
| 3 | Train Quick Tools Row hardcoded English despite existing translations; "Adjust plan" unkeyed | `f4ace18` |
| 4 | F-10: raw thrown error messages rendered on Login / Create Account (`err?.message` in catch blocks) | `9058da7` |

## Open findings carried to Phase 4

- **F3-1 — Scan canonicalization is single-layer.** Item-name sanitizing
  (aliases, canonical names) lives only in the server route
  (`src/app/api/ai/scan-meal/route.ts` `sanitizeScannedItems`); the client
  renders model item names verbatim and does not sanitize. Production cannot
  surface it today because every real response passes the route, but a raw
  model payload fed to the client rendered "Cooked Pigeon Peas (Chana)".
  Evidence: `qa/screenshots/p3-scan-trust/finding-raw-model-payload.png`.
  Confidence itself IS recomputed client-side (`computeMealConfidence`).
- **F3-2 — Graphite pill 3 px scroll overflow** at xlarge/320 (see Check 4;
  visually not clipped; harness rescue documents the threshold).
- **F3-3 — Quick-actions letter-wrap** at 320×568 / Extra Large (cosmetic;
  evidence in `qa/screenshots/p3-textsize/`).
- **F3-4 — Form Coach summary modal is pervasively hardcoded English.**
  `FormSessionSummaryModal.tsx`: tile labels ("Duration", "Total set",
  "Tempo"), "Technique & Camera Observations", "Evidence-based",
  "Consistent Technique" + four exercise-conditional sentences,
  "Evidence:"/"Note:" prefixes, "Rep-by-Rep Data", rep rows ("Hip:",
  "Lockout: Full / Not reached", "Torso lean:", "Peak: shoulder height /
  near shoulder / below shoulder", "Complete / Incomplete"), the safety
  paragraph, footer buttons ("Another Video", "Close", "Save"/"Saved"), the
  "Edit rep count" aria-label — none of it goes through `t()`. Analyzer
  observation titles/messages are likewise built in English inside the
  analyzers. A Hindi user gets an English report. Converting the component +
  analyzer strings to keys is one scoped work item; the modal also cannot be
  driven in the harness (Check 2 NOT TESTED), so no screenshot evidence
  exists — this is a code-level inventory.
- **F3-5 — Weekly-review form-check lines drop the exercise scope in
  Hindi — deliberately.** The four `weeklyReview.coachFormChecks*` hi
  templates omit `{scope}`; the drop is pinned by
  `tests/hindi-localization-item4.test.ts` because the scope VALUE
  ("deadlift sessions") is generated in English inside
  `src/lib/weekly-review.ts` and cannot sit inside the Hindi sentence. An
  initial Phase 3 restoration of `{scope}` was reverted for contradicting
  that pinned decision. The real fix is localizing the scope value
  generation (and, by the same pattern, the English `segments`/`change`
  params those lines interpolate) — an owner decision, not a dictionary edit.
- **F3-6 — More unkeyed English on the Train surface** beyond the items
  fixed in Check 5: the "`{n} of {m} completed this week`" template line
  (WorkoutPage schedule card), "+ New Plan", the "CURRENT SPLIT" eyebrow,
  and the "Train" page H1 render in English under the Hindi persona.
  Evidence: `qa/screenshots/p3-hindi/train.png`.

## What Phase 4 needs from the owner

1. **Merge word on this branch's PR** (Phase 4 builds on it), as with
   Phases 0–2.
2. **F3-5 decision:** localize the weekly-review scope/segment value
   generation, or accept the pinned trade-off permanently.
3. **F3-4 scoping:** confirm the Form Coach summary modal + analyzer strings
   conversion is in Phase 4's scope (it pairs naturally with the Hindi
   persona's route).
