# ASCEND — Final Certification: Bug-Fix Ledger

Every Round-1 finding, its severity, and its disposition after Rounds 2–3.
Statuses: **FIXED** (PR + verification), **FIXED-PARTIALLY**, **RESIDUAL-ACCEPTED**
(deliberately out of the fix scope; reason stated), **NOT TESTED**, **OPEN**
(new in Round 3). Verification marked *(stack)* was re-driven on the composed
stack in Round 3 (see `regression-results.md`); *(PR)* was verified inside
its own PR only.

## Design consistency (`design-consistency-audit.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| F-01 | P2 | A complete second token scheme is defined, themed, and never read; its dark values disagree with the live scheme | **RESIDUAL-ACCEPTED** — the design-system unification program item; removing a dead-but-themed scheme is its own reviewed change, deliberately not folded into the certification fixes |
| F-02 | P2 | Form Coach styled with utility classes that do not exist | **FIXED** — PR #95 (plus an app-wide regression guard that fails the build on nonexistent design classes); *(stack)* S1 |
| F-03 | P2 | Default Tailwind palette classes bypass the semantic tokens at scale (725 uses) | **RESIDUAL-ACCEPTED** — population migration is the unification program, not a certification fix; one instance (share WhatsApp) was tokenized by PR #100, see UI-1b-08 |
| F-04 | P3 | Text below the system's own 11px floor | **FIXED-PARTIALLY** — PR #95 eliminated the nonexistent `text-4xs` (×3) and `text-3xs` (×4) sizes; the arbitrary `text-[0.625rem]` (×86) / `text-[0.5625rem]` (×22) population remains (see A11Y-03) |
| F-05 | P3 | Two button systems with different geometry and meanings | **RESIDUAL-ACCEPTED** — unification program |
| F-06 | P3 | Three coexisting modal constructions | **RESIDUAL-ACCEPTED** — unification program |
| F-07 | P3 | Card: one dominant class, one parallel component | **RESIDUAL-ACCEPTED** — unification program |
| F-08 | P3 | Hardcoded hex/rgba literals in data-display components (197) | **RESIDUAL-ACCEPTED** — unification program |
| F-09 | P3 | Semantic type scale defined and almost entirely unused | **RESIDUAL-ACCEPTED** — unification program |
| F-10 | P3 | Radius usage broader than the two-value component spec | **FIXED-PARTIALLY** — the worst offender (Form Coach `rounded-3xl`) conformed by PR #95 (16px measured, *(stack)* S1); the app-wide `rounded-lg` population stands as the de-facto standard |
| F-11 | P3 | Metric-label layer is an unwritten convention | **RESIDUAL-ACCEPTED** — documentation task in the unification program |

## Screen-by-screen UI (`screen-by-screen-ui-audit.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| UI-1b-01 | P2 | Form Coach modal: transparent root below 640px, ignores accent themes | **FIXED** — PR #95; *(stack)* S1: panel rgb(255,255,255), follows Cobalt, zero vermilion remnants |
| UI-1b-02 | P2 | Pre-account periods presented as the user's own missed history | **FIXED** — PR #97 fixed the weekly-review modal, the check-in missed-session surface, and the athlete-model facts at generator level (*(stack)* S3: predates framing, PLANNED 0/0, no missed-yesterday card, no "0 of 32"). The one residual surface (R3-01, below) was fixed by PR #101; #97 and #101 both merged 2026-11-04. |
| UI-1b-03 | P3 | Weekly review contradicts itself ("the revision below can move it" + "No changes proposed") | **FIXED** — PR #97 (the promise line renders only when a revision exists); *(stack)* S3 modal shows no contradictory pair |
| UI-1b-04 | P3 | Training Tools sheet close button has no accessible name | **FIXED** — PR #100; *(stack)* S7: name is "Close", all sheet buttons named |
| UI-1b-05 | P3 | First-run tip says "Tap the big Done button"; the button is "Complete Set" | **FIXED** — PR #100; also observed corrected during the *(stack)* S2 drive |
| UI-1b-06 | P3 | Today: DOM order ≠ visual order (flex `order`) | **FIXED** — PR #100 (works for default and user-customized orders); *(stack)* S7: DOM == visual |
| UI-1b-07 | P3 | Form Coach modal radius `rounded-3xl` vs system `rounded-2xl` | **FIXED** — PR #95; *(stack)* S1: 16px measured |
| UI-1b-08 | P3 | Share modal's WhatsApp button filled with off-token green | **FIXED** — PR #100 (`--brand-whatsapp` tokens, documented brand exception, zero visual delta by design) |

## Functional (`functional-test-results.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| F1 | P3 | Onboarding back-nav (offer → details) loses the typed name; non-default gender resets the same way | **FIXED** — PR #98; *(stack)* S5 |
| F2 | P3 | Custom "name required" error unreachable (native `required` pre-empts the handler) | **FIXED** — PR #98; *(stack)* S5: designed error renders, form `noValidate` |
| F3 | P2 | No edit path for a completed set (mis-logged set uncorrectable) | **FIXED** — PR #96: History editing + labelled in-session editing + the pre-fill propagation guard the fix work itself discovered + PR re-evaluation; *(stack)* S2, twice (Pass A + Pass B), 11/11 checks |
| F4 | P3 | CURRENT SPLIT counter denominator changes 4 → 5 while a draft is in progress | **RESIDUAL-ACCEPTED** — cosmetic; not addressed by any fix PR |
| F5 | P3 | Resume-banner Discard deletes the draft in one click, no confirmation | **FIXED** — PR #98 (ConfirmationModal before destroying; keep/undo flow preserved); *(PR)* browser-verified; not re-driven in Round 3 |
| F6 | P3 | Save Meal silently blocked without a meal name — toast only, requirement undiscoverable | **FIXED** — PR #98; *(stack)* S4 in the finding's exact state: hint visible + Save disabled |
| F7 | P3 | Meal builder's blank template row takes the quantity; total can price two blocks for one visible item | **FIXED** — PR #98; *(stack)* S4: blank qty → 0 kcal, quick-add fills the row, 265 kcal |
| F8 | P3 | Share card "NEW PRS" count and highlights diverge from the PR store | **FIXED** — PR #98 (root causes: baselines filtered on a flag the finish flow never sets; headline count taken from an already-truncated list); *(PR)* logic extracted to a pure module + fixture tests; not re-driven in Round 3 |
| F9 | P3 | Offline reload yields a browser error page instead of the app shell (local build only) | **NOT TESTED** — production service-worker behavior unverified (production unreachable from the audit sandbox; local SW has a different cache identity by construction) |

## Security (`security-audit.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| SEC-1c-01 | Info | Header/CSP posture complete and consistent (page + API) | Verified pass — no action |
| SEC-1c-02 | Pass | Production dependency tree: 0 known vulnerabilities (OSV) | Verified pass — no action |
| SEC-1c-03 | Pass | No secret material in the repository; service-role key confined to server-only modules | Verified pass — no action |
| SEC-1c-04 | P3 | Several API routes return redacted internal/provider error text in 500 bodies | **RESIDUAL-ACCEPTED** — cosmetic hardening (no credential leakage; redaction verified); a fixed generic message is a follow-up |
| SEC-1c-05 | Pass | Prompt-injection posture + meal-photo provider rule implemented in code | Verified pass — no action |
| SEC-1c-06 | Pass | No injection sinks in application source | Verified pass — no action |
| SEC-1c-07 | P3 | Clarity session-replay is code-supported; enabling without masking would expose health-data screens | **RESIDUAL-ACCEPTED** — keep disabled (per project records it is not enabled in production); mask before any future enablement |
| SEC-1c-08 | P3 | Sentry browser loader has no app-level `beforeSend` PII scrubber | **RESIDUAL-ACCEPTED** — add a scrubber if Sentry use widens |

## Database integrity (`database-integrity.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| DB-01 | P3 | Create path asymmetry: `addWorkout` coerces set weights but does not range-clamp them (update paths clamp 0–500 kg) | **RESIDUAL-ACCEPTED** — defense-in-depth only; UI inputs constrain in practice. Note: PR #96 hardened the *update* boundary (`sanitizeWorkoutUpdate`); the create path is unchanged |
| DB-02 | P3 | `DEFAULT_CREATINE_SUPPLY.lastUpdated` uses a UTC day key, violating the codebase's own date rule | **FIXED** — PR #98 (uses `getLocalTodayStr`) |
| DB-03 | Info | Dual weight storage (`weight_kg` + `weight_lbs`) with no DB CHECK; consistency is client-maintained | Recorded — no action |
| — | Info | Set/food detail lives in JSONB; DB cannot enforce set-level constraints; integrity rests on client sanitizers | Recorded — no action |

## Device compatibility (`device-compatibility.md`) — all results viewport *emulation*

| ID | Sev | Finding | Status |
|---|---|---|---|
| DEV-1 | P3 | "Gym packed?" explainer ellipsized at every phone width | **FIXED** — PR #100 (truncate removed; the same explainer already wrapped in WorkoutDetailsView); *(PR)* verified |
| DEV-2 | P3 | Workout header title squeezed at 320px | **RESIDUAL-ACCEPTED** — full name remains in the `title` attribute; all controls intact |
| DEV-3 | P3 | No `safe-area-inset-top` anywhere in `src/` (bottom inset handled) | **NOT TESTED** — notched-hardware behavior requires a physical device |

## Accessibility (`accessibility-audit.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| A11Y-01 | P3 | Light theme's active bottom-nav label: raw vermilion at 12px = 3.57:1 | **FIXED** — PR #100; *(stack)* S7: measured **4.66:1** (dark theme unchanged at 5.00:1) |
| A11Y-02 | P3 | Sub-44px targets cluster in secondary patterns (text-links 14–16px, chips, habit cells) | **RESIDUAL-ACCEPTED** — all primary CTAs ≥44px; secondary-pattern pass is a follow-up |
| A11Y-03 | P3 | Sub-floor text persists (9–10px) | **FIXED-PARTIALLY** — see F-04 |
| A11Y-04 | P3 | Focus passes through `document.body` for one stop per modal Tab cycle | **RESIDUAL-ACCEPTED** — focus trap itself verified working |
| A11Y-05 | P3 | Today's `h1` is the user's first name | **RESIDUAL-ACCEPTED** — semantics nit |
| A11Y-06 | P3 | Rest countdown has no `aria-live` / `role="timer"` | **FIXED** — PR #100 (`role="timer"` on the readouts + a polite completion announcement); *(PR)* verified; rest-end remains carried by chime + notification (audibility NOT VERIFIED on hardware) |

## Performance (`performance-audit.md`)

| ID | Sev | Finding | Status |
|---|---|---|---|
| PERF-2 | P3 | Inactive Hindi dictionary (~64 KB gzip, ≈11% of cold script payload) loads in every English session | **FIXED** — PR #99 (−64,399 B gzip / −10.3% on first load; out of the SW precache, 27 → 26 assets); *(stack)* S6: chunk absent from English cold load, fetched on switch, Hindi cold start flash-free |

## Round-3 findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| R3-01 | P2 | Coach tab "This week" adherence card scores pre-plan days as missed for a mid-week plan start ("0 of 4 sessions done so far / More than half the week was missed" on day one) — residual of UI-1b-02 on a surface PR #97 did not cover (`CoachChatTab.tsx` `weekAdherence` + `coach-session.ts` `weeklySuggestion` lack the plan-start anchor) | **FIXED** — PR #101 (stacked on PR #97, merged immediately after it on 2026-11-04): `weekAdherenceSummary()` in `coach-session.ts` takes the shared `earliestDataDate()` anchor; browser-verified before/after ("0 of 4… more than half the week was missed — fewer training days next week" → "0 of 2… steady week — keep the plan"); 7 new persona tests; mid-history behavior pinned identical |

## Merge-sequence summary

Merging the six PRs in number order produces exactly **one** conflict:
#95 × #100 in `GoalSelectorModal.tsx` and `FormSessionSummaryModal.tsx`,
both mechanical class-string compositions. Full map in
`regression-results.md` §2.

**Outcome (2026-11-04):** the owner ordered the merge. All seven PRs
merged in the recorded order (#95, #96, #97, #101, #98, #99, #100). The
single predicted conflict occurred exactly as mapped and was resolved by
composition (both token changes kept; fix-branch commit `1384b4f`;
design-token guard + a11y tests 12/12 and tsc clean on the resolved
tree) before #100 merged. New master: `37c00f41`. Production verified
serving `ascend-37c00f4-cache`. All seven fix branches deleted after
merge.
