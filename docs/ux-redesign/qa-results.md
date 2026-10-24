# ASCEND UX Redesign — QA Results (Phase 12, part A)

> **Branch:** `feat/ux-redesign` @ `5ad6faf` (implementation Stage 10 tip `4c87b22` + Phase 11 round-2 doc).
> **Base:** `master` @ `2c6512d7` (untouched throughout; never pushed to, never merged into).
> **Method (this phase):** full check suite re-run on the tip in a fresh clone; static code
> inspection + targeted greps for the regression tasks and preservation claims; targeted
> re-run of the gate test file to confine the failures. **No browser was operated, no
> screenshots were taken or faked** (no screenshot tooling exists in the repo) — the live
> visual acceptance in §3 is **PENDING the parent-run browser phase** and is not claimed here.
> No sign-in, no credentials, no Supabase/production state touched. This phase changed no
> app code; its only commit is this document.
> **Headline: zero deviation from Stage 10.** Every check reproduces Stage 10's numbers
> exactly, which is expected: the tip is Stage 10 code plus one documentation commit.

## 1. Check results (re-run on the tip, fresh clone)

| Check | Command | Result | vs Stage 10 |
|---|---|---|---|
| Unit/integration tests | `npx vitest run --configLoader runner` (129.9 s) | **1,788 passed / 20 failed (1,808 total), 129/130 files passed** | IDENTICAL |
| Gate confinement | `npx vitest run tests/security-integration-gate.test.ts --configLoader runner` | **20 failed, all in that one file** (live Supabase/Docker infra: "Real Local Database Tests", e.g. deletion-nonce lifecycle against real PostgreSQL) | Confirms the 20 are the known pre-existing gate only |
| Type check | `npx tsc --noEmit` | **Clean, exit 0** | IDENTICAL |
| Production build | `npm run build` | **Success, exit 0. Shared First Load JS 88.2 kB** (chunks 31.9 + 53.6 + 2.63 kB) | IDENTICAL (shared JS unchanged from baseline) |
| Lint | `npm run lint` | **Exit 0, 15 warnings, 0 errors** (all `react-hooks/exhaustive-deps`, incl. 5× missing `t`, 3× unnecessary `todayStr`, 1× missing `stopCamera`) | IDENTICAL (the baseline audit's "5" was an undercount; Stage 1 established 15, all in untouched hook code) |
| Whitespace/errors | `git diff --check 2c6512d7..HEAD` | **Clean, exit 0** | IDENTICAL |

The `--configLoader runner` flag was needed because the default vitest config loader hits
the sandbox EPERM issue; it is verification-only, never a repo change. No check was
weakened to pass: no test, threshold, or config was altered in this phase.

## 2. Eighteen-task regression (brief's named tasks)

Verdict key: **Pass** = code + test evidence on the tip. **Partial** = code/test evidence
holds but the task needs live eyes to close (see §3). Evidence marked "(this phase)" was
re-verified by grep/diff in Phase 12; evidence marked "(Stage 10/11)" is taken from
`implementation-summary.md` / `synthetic-personas-round-2.md`, which this phase spot-checked
but did not fully re-derive.

| # | Task | Verdict | Evidence |
|---|---|---|---|
| 1 | Onboarding | Pass | Stage 7: summary screen, labeled guest path, Skip visually equal to Accept (Stage 7 tests 7/7). |
| 2 | Start/resume workout | Pass | Resume handler in `WorkoutPage.tsx:1098,2149` (this phase); Stage 2/4; persistent Resume affordance. Live phone feel still owed (§3). |
| 3 | Set recording | Pass (logic) | Stage 4 touched only `ActiveWorkoutScreen`, `SettingsView`, `WorkoutPage`, i18n, new `workout-mode.ts`, + tests (this phase, commit `68fac43` file list) — no set-logging engine lib changed. Behavioral proof on a real phone is §3's job. |
| 4 | Plan / weekly review | Pass | Stages 3/4; Coach section + notes content; plan Start lands directly on the perform surface. |
| 5 | Settings / personalization | Pass | Stage 6 tests 8/8; ThemePicker + accent wiring, density, CustomizeSheet (this phase: sheet reachable from `HomePage` + `SettingsView`, same component). |
| 6 | Progress / chart exploration | Pass | Stage 5 + Stage 10 chart re-verification (units via `userUnit`, real date windows, measured solid vs estimated dashed + "est." badge); spotlight pin persists, goal change clears pin + toast (`ProgressPage.tsx:804,863-868`, this phase). Volume-title phrasing nuance (descriptive, not a question) remains a confirm-or-convert item. |
| 7 | Nutrition scan / manual | Pass | Stage 5; scan/manual/barcode land on the same meal list with per-item exact/estimated chips. Voice meal path does not exist — recorded, not invented (Stage 10). |
| 8 | Cross-tab navigation | Pass | TabIds/routes unchanged (`navigation.tsx:8,61` — home/workout/progress/meals/prs/profile/settings, this phase); `/?tab=` deep links preserved (`:57`, URL tab wins, `:138`); last-tab restore unchanged. "You" is presentation-only (`page.tsx:61-63,340,348,415`, this phase). |
| 9 | Modal / error / empty / offline states | Pass (code) | New `Sheet`, `EmptyState` components exist in `src/components/ui/` (this phase); sync caption + offline banner per Stage 10. Modal-stack behavior: `use-modal-a11y` untouched (this phase). Live Escape/layering check is §3. |
| 10 | Keyboard + focus | Pass (code) | Global `:focus-visible` rule added (`globals.css:149+`, this phase); `use-modal-a11y` untouched (this phase). Live keyboard pass is §3. |
| 11 | Responsive widths | Partial | Stage 9 code checks (fluid `viewBox` charts, rem scaling, nav labels wrap); 390 px + xlarge visual checks owed to §3. Desktop = rail + centered `max-w-md` column, NOT the decided `max-w-3xl` wide grids (see P1). |
| 12 | Dark-mode consistency | Pass (code) | Contrast audit loops `light`/`dark` modes (`stage9` tests, this phase); 6 presets × 2 modes, zero failing rows (Stage 1/9). Live dark-mode eyes are §3. |
| 13 | Performance / bundle | Pass | Build passes; shared First Load JS 88.2 kB, unchanged from baseline (this phase). No new dependencies (package.json diff empty, this phase). |
| 14 | Data integrity / persistence | Pass | Store sanitize + persist-version bump + `migrate()` (new accounts Simple, existing Detailed); six new keys validated on read, invalid → defaults (store.ts, this phase); ranges local-only, SSR-guarded. |
| 15 | Multi-persona task re-verification | Pass (simulation) | Phase 11 doc: same 12 personas × same 36 tasks → **2.76 → 3.71 (+0.95)**; Fixed 12, Partial 19, Unchanged 3, Still failing 2 (the two P0s). Scores are simulated, not measured — labeled as such in that doc. Re-running personas on unchanged code would reproduce them. |
| 16 | Visual consistency | Partial | Tokens applied globally (Stage 1); zero `text-3xs` remaining, zero `animate-pulse`/`animate-ping` remaining (this phase). Full visual pass is §3 — this row cannot close on code alone. |
| 17 | Accessibility | Partial (code-level) | See §4. Whole-claim WCAG 2.2 AA is NOT made here. |
| 18 | Plan offer / guest path / summary screen | Pass | Covered under onboarding (Stage 7); summary screen + labeled guest + equal Skip verified in Stage 7 tests. |

**No task regressed against Stage 10. No task failed outright in code/test evidence.**
The two "Still failing" Phase 11 tasks are the P0s in §6 — pre-existing behavior defects
the redesign deliberately did not fix without approval, not regressions.

## 3. Visual acceptance — ⏳ PENDING (parent-run browser phase, NOT claimed)

This section is intentionally unfilled. The following MUST be done live against the running
branch app (guest test data only, no sign-in, localhost — never production, never mockups)
before the PR is finalized, and the results appended to this document:

- **Tap-throughs (highest-risk flows):** full workout in Beginner AND Advanced; finish +
  post-finish stack; rest-timer occlusion during a real set; keyboard covering the next set;
  logger → selector → active keyboard chain + Escape layering; Customize sheet hide / order /
  restore; density switch for an existing user; accent pick + custom accent including a
  near-background rejection (e.g. `#F5EFE0`); spotlight pin + goal change; onboarding
  end-to-end; scan → review → save with exact/estimated chips.
- **Screenshots of the running app:** Today fold in Simple AND Detailed; You tab + Settings;
  spotlight + pin; Fuel chips; onboarding summary; desktop rail at 1024 px and 1440 px.
- **Layout checks:** 390 px + xlarge text scale (clipping / overlap / scroll); desktop wide
  grids verdict — build them or explicitly accept rail + centered column (P1).
- **Typography check:** Barlow mixed-script coherence in Hindi mode (Inter-only fallback is
  reserved and reversible; sandbox font downloads may fall back — report font status honestly).
- **Motion feel:** low-end-phone feel, including the data-bar-transition judgment (kept as data).
- **Live sign-in observation:** Google consent-screen app name still unproven (needs a real
  sign-in observation; guest-only browser work cannot close it).
- **Copy reads:** "est." comprehension, set-type/RPE first use, streak tone, DataVault coverage
  wording (after its fix), volume inclusion rules (after its fix).
- **Native-speaker review:** ~94 new Hindi keys (listed by stage in the implementation summary).

Until those land, any claim of visual or whole-product accessibility acceptance would be
fabrication. This document does not make it.

## 4. Accessibility acceptance (code-level only)

- **Contrast audit — zero failing rows ship** (Stage 1/9): 6 presets × 2 modes ×
  (accent-text ≥4.5:1, accent-on ≥4.5:1, accent ≥3:1 UI use, focus ring ≥3:1, selected chip
  ≥4.5:1 on blended wash) + 5 custom cases × 2 modes. Real corrections, not threshold
  weakenings: chip text steps against the blended wash (vermilion 4.66 on chalk → 4.49 on
  its wash); near-background customs rejected at input (`isCustomAccentUsable` + inline
  error + blocked Apply); light-mode primary-button text is black on vermilion (white 4.07,
  graphite 4.34, black 5.15 — see `accent-themes.ts:244-245,278`, this phase).
- **Focus:** global `:focus-visible` rule (`globals.css:149+`, this phase); modal-stack
  semantics preserved (`use-modal-a11y` untouched, this phase).
- **Touch targets:** 44 px primaries (Stage 9); QA4-015 pins bumped 40→44 px (strengthening).
  **Known gap:** sub-44 px secondary chips/pills remain (section chips ~30 px, filter pills,
  heatmap tabs) — they pass the WCAG 2.2 AA 24×24 minimum but miss the spec's enhanced 44 px
  target; confirm by tap-through (§3) before resizing.
- **Text scale:** label floor 11 px — zero `text-3xs` remaining in `src/` (this phase).
- **Motion:** only 4 keyframes + press feedback + linear rest-timer; no animated counting,
  shimmer, reveals, or stagger; zero `animate-pulse`/`animate-ping` in `src/` (this phase);
  the global `prefers-reduced-motion` rule is the control and is preserved/extended.
- **Text alternatives:** heatmap counts + cell summaries are text; measured vs estimated is
  never color alone (solid vs dashed + "est." badge) — per Stage 10 chart re-verification.
- **⚠️ Explicit caveat: WCAG 2.2 AA as a whole is NOT claimed.** Code-level passes above do
  not substitute for the live checks in §3 (390 px + xlarge, keyboard pass, Barlow
  mixed-script, low-end motion feel, screen-reader behavior). The claim stays open until
  those land.

## 5. Preservation acceptance

Diff `2c6512d7..HEAD`: **116 files changed, +8,650 / −1,077** — exactly Stage 10's
115 files / +7,812 / −1,077 plus the 838-line Phase 11 doc. No other delta exists.

- **No data-logic, calculation, auth-logic, schema, or sync-behavior change.** Auth-adjacent
  diff = exactly 3 files (`AuthModal.tsx`, `onboarding/LoginScreen.tsx`,
  `RunSessionScreen.tsx`); spot-check shows class-only changes (e.g. `text-3xs` → `text-2xs`)
  per Stage 10's line-by-line diff (zero non-styling lines after filtering class strings).
  Settings sign-out removal is ownership-only (Profile's action untouched).
- **Sync serializer:** `src/lib/supabase/` is **untouched** in the diff (this phase), and
  sync code never references `uiPreferences` (no matches in `sync.ts`, `useSupabaseSync.ts`,
  or `reconcile.ts`, this phase). The profiles upsert carries profile fields only
  (`sync.ts:1014+`). The six new keys (`accentTheme`, `customAccentHex`, `density`,
  `todayLayout`, `workoutModeOverride`, `pinnedProgressChart`) are therefore local-only by
  construction — persisted via zustand-persist + validated on read — and UI copy must not
  promise cross-device sync for them. Honest nuance: `uiPreferences` already sat in the
  pre-existing Data Vault **backup** field list (`storage.ts` BACKUP_STATE_FIELDS), so the
  new keys ride inside local backups/exports as part of that blob; that is local backup,
  not cloud sync, and it predates the redesign.
- **Boundaries intact (this phase):** no `sw.js` change, no `public/ui-mockups.html` change,
  no form-check / pose-engine file created or modified (form-check does not exist on this
  branch), no new dependencies (package.json dependency diff empty), no capability added
  or removed, no second design system (built on `tailwind.config.js` + `globals.css`;
  `MASTER.md` superseded note is docs-only).
- **Set-recording logic:** see task 3 — Stage 4 file list contains no set-logging engine lib.

## 6. Remaining issues

### P0 — still-failing tasks; need the user's explicit approval; the redesign cannot close them

- **P0-1 — D1 BodyMetrics date lie (Phase 11 task 6.2).** Re-verified this phase:
  date input rendered (`BodyMetricsModal.tsx:515-516`, state `:174`) but
  `updateBodyMetrics(weightKg, heightCm, bodyFatPct, chestIn, waistIn, hipsIn)` is called
  with **no date argument** (`:294-302`), and the store function signature (`store.ts:2088`)
  takes no date — the entry is always stamped today. Fix = pass the date through (behavior
  fix, needs approval + scope) or remove the date control until fixed. Until then the
  control misleads the user on every backdated entry.
- **P0-2 — D6 stale shell (Phase 11 task 10.3).** `sw.js` is untouched in the diff;
  `ascend-v2.0.0-cache` + 3 s cache-fallback navigation race unchanged. Fix = versioned
  cache name + update prompt, or a Settings version indicator. Until then a returning tab
  can serve a stale shell after a deploy.

### P1 — priority order (from Phase 11, with Phase 12 verification notes)

1. Rest-timer docking not built (floating button kept — top mid-session risk, P3/P5).
2. Finish-flow summary-first not built (modal stack unchanged, P7).
3. Desktop wide grids not built — rail + centered `max-w-md` delivered instead of the
   decided `max-w-3xl` grids. Matches the decision's reversible fallback but was never built
   rather than fallen back to; §3 must explicitly accept it or schedule the build.
4. Modal-to-Sheet migration not done (~36 modals keep old chrome; stack semantics preserved
   — needs one-by-one sequencing with visual verification).
5. DataVault coverage copy unchanged (S4 verbatim — backup may silently exclude local-only
   data, P8/P10; note §5's backup nuance: `uiPreferences` IS in the backup blob, but other
   local-only data may not be — the copy must say exactly what is covered).
6. Schedule editing from Train not built (Settings-only, P9).
7. Plate calculator + meet planner still tools-menu-only (P3/P5).
8. Density toggle Settings-only — verified this phase: the density control lives in
   `SettingsView.tsx:667` only; an existing user reaching Simple needs a Settings trip.
9. Sub-44 px secondary chips/pills remain (see §4).
10. ~94 new Hindi keys need native-speaker review.
11. Last-tab restore unchanged (mitigated by Resume bar + fold, not fixed for fresh-day cold
    opens — needs his landing decision: Today-first vs last-tab restore).
12. Confirm-or-convert items: volume title phrasing (descriptive vs question), data-bar
    transitions kept as data, preset opaque subtles vs custom rgba washes (both
    audit-passing, not harmonized), translucent `bg-accent/85` contrast-audit limitation.

### Not fixed, shipped as known issues (unchanged from Stage 10/11)

D1, D6, D5 (removing `public/ui-mockups.html` from serving), Supabase custom domain
($25/mo Pro — only full OAuth-hop fix), 552/617 food names needing Hindi-speaker curation,
6-table sync reality (UI copy stays honest; new keys local-only).

## 7. Quality-gate readiness (Phase 14 input)

**Ready for the PR once §3 lands and its results are appended:** checks green with zero
deviation from Stage 10; preservation holds (no data/auth/schema/sync change, no new deps,
boundaries intact); simulation improved 2.76 → 3.71 with the two still-failing tasks honestly
attributed to pre-existing defects, not the redesign; all decision-doc deviations documented
in the implementation summary (Sheet migration, SetRow/SetTable, desktop grids, sub-44
chips, data-bar transitions, rest-timer placement, finish-flow order, subtle harmonization).

**Blocked on user decisions (NOT decidable by this program):** P0-1 D1, P0-2 D6,
D5 ui-mockups removal, Supabase custom domain ($25/mo Pro), in-Settings Apple/OTP/email
sign-in forms (new auth surface), landing decision (Today-first vs last-tab restore),
desktop wide grids (build or explicitly accept rail + centered column), any capability
removal (none proposed).

**Carried forward unchanged:** the #42 rebuild (when unparked) must adopt this design
system, carrying the D11 `analyzeUpload` timestamp-reset caveat, the temporary debug
readout's removal before any merge, and the unreviewed CSP change; the MASTER.md superseded
header note remains flagged for his awareness; progress sub-tab display-label reconciliation
is implemented display-only with `?sub=` params unchanged (deep links keep working).

**Phase 14 gate questions (product / brand / interaction / personalization / engineering /
honesty) are deferred to the parent** until §3's live results exist — answering them on code
evidence alone would repeat the exact fabrication this document refuses in §3.
