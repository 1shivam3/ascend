# COACH_DESIGN.md — The Real Coach program

Mandate (user, 2026-10-22): build a coach that **suggests and builds workout
plans like a real coach** — assessment → block proposal with reasoning → daily
management → weekly revision → test/debrief → next block — **not a generic
workout generator**. Test it, iterate on it, and do not stop at "good enough".
Delivery: three stacked PRs (A athlete model → B coach-built plans → C weekly
review + debriefs). The user reviews and merges; nothing auto-merges.

Positioning (from PERSONA_REPORT.md): *"the coach on top of your data"* is the
differentiated thing in this app. This program makes that literally true:
every coaching decision is derived from the user's own logged data, carries
its evidence, and is reversible by the user.

---

## 1. What the audit found (2026-10-22, master 56b9345)

### 1.1 Assets we build on (do not rebuild)

| Asset | File | What it gives us |
|---|---|---|
| Evidence layer | `src/lib/workout-outcome-evidence.ts` | Decision-free prescribed-vs-actual comparison per set/exercise/session. Warmups isolated. The only honest basis for progression claims. |
| Policy v0 | `src/lib/training-decision-policy.ts` | Evidence-gated decision records with rule IDs (`LOAD-PROG-01`, `SAFETY-01`, …), sufficiency tiers, a ledger, and guarded application to plans (`validatePolicyDecisionApplication`). |
| Stall detection | `coach-engine.ts: detectStalls` | ≥4 sessions, ≥3 stalled, e1RM-based, with a diagnosed suggestion (variation / rep_scheme / deload / technique). This **is** the plateau detector. |
| Readiness | `coach-engine.ts: calculateReadiness` | Score 1–100 from ACWR, RPE trend, consecutive days, manual check-in (independent weights sleep ±8, soreness ±8, energy ±6), health signals. Plain-English `factors[]` are the "Why?". |
| Injury machinery | `workout-engine.ts` | `getInjuryBannedFamilies(limitations)`, `findFamilySafeAlternative`, `adaptSplitForEquipment`, `getFilteredSubstitutes` (pain swaps exclude the whole movement family), `exerciseHadPain` (correct pain attribution via `painfulExerciseName`). |
| Split skeletons | `workout-engine.ts` | `getGoalAdaptiveSplitTemplates`, `scaleSplitTemplatesForAthlete`, `prepareGeneratedPlans`. Raw material for block generation — templates the coach *reasons over*, not output it parrots. |
| e1RM / %1RM | `percent-1rm.ts`, `strength-standards.ts` | `estimateE1rmKg`, `roundToLoadable`, canonical `normalizeExerciseName`, `calculateOneRepMax`. |
| Progression (display) | `use-coach-digest.ts` | Home wiring: readiness, next-session adjustments, stalls, nutrition. The digest is where coach output reaches the user today. |
| Muscle volume | `muscle-volume.ts` | Per-muscle weekly volume/recovery view (Progress). Weak-point signal source. |
| Persistence pattern | `store.ts` + `storage.ts` | Derived-data slices (`lifterProfile`, `coach`, `dailyCheckins`) persist via zustand partialize + `BACKUP_STATE_FIELDS` + `importAllData`, recompute on rehydrate. **No new SQL migration is needed or wanted.** |
| Plan extras | `supabase/reconcile.ts` | `PlanExtras` whitelist rides `planned_workouts.extras` JSONB; degrades to local-only until the user runs the one-line migration. |

### 1.2 The gaps this program closes (verified absent)

1. **No per-user learned parameters.** Every threshold is a global constant
   (stall 2%, ACWR 1.3/1.5, check-in weights, calorie steps). Nothing learns
   an individual's baselines, progression response, or recovery. → **PR-A**
2. **No block / mesocycle / phase concept anywhere.** No block intent, no
   build/deload/test weeks, no exercise-selection rationale. → **PR-B**
3. **The coach never authors a plan.** Plans are user- or template-made;
   Policy v0 can only edit an existing plan exercise after manual accept. → **PR-B**
4. **Policy v0 cannot fire load progression in production.** `store.ts`
   calls it with `repRange = {min: targetReps, max: targetReps}` and never
   passes increment config, so every clean session lands on
   `HOLD-RPE-UNRECORDED` / `REV-INCREMENT`. → **PR-B fixes this for
   coach-managed lifts only** (real rep ranges + coach-approved increments).
5. **Readiness never changes a workout.** Score is display + prose; the one
   executable adaptation (`adaptWorkoutForConstraints`) is manual. → PR-B
   wires block week-type (build/deload/test) into managed-lift decisions.
6. **Weekly review is prose that revises nothing.** `generateCoachWeeklyReview`
   returns 3 strings; `WeeklyRecapModal` is a share-card generator. → **PR-C**
   structured review with approvable revision proposals.
7. **Pain has no memory.** Pain is last-session-only; readiness ignores it;
   a user can report pain and still score "primed". No recurring-pain
   escalation. → PR-A pain episodes; PR-B/C escalation surfaces.
8. **Three progression engines disagree** (`adjustNextTargets` %,
   `getNextSessionTarget` fixed-step, Policy v0) with no arbiter. → §2
   decision D2 names the arbiter per surface; this program adds **no fourth
   engine**.

### 1.3 Landmines (binding on all three PRs)

- **Exercise-name keys differ per layer.** Evidence/policy layer:
  `canonicalizeExerciseName` (trim+lowercase). Display/library:
  `normalizeExerciseName`. New code states which key it uses, per value.
- **Dates are local `YYYY-MM-DD` strings.** Today = `getLocalTodayStr()`,
  never `toISOString().slice(0,10)`. Week math via `formatters`
  (`getWeekRange`, `getMondayOfWeek`, `parseLocalDate`). **Mon–Sun always.**
- **Store writes have side effects.** `addPlannedWorkout` rewires today's
  schedule; bulk install precedent is `setPlannedWorkouts` +
  `setWeeklySchedule` (SuggestedWorkoutModal's apply-split). New plan
  writers use the bulk path or the existing actions — never raw `setState`.
- **Persisted slices must land in four places** (`AppState` + action,
  `partializeAppState`, `BACKUP_STATE_FIELDS`, `importAllData`) or they
  silently drop. Keep blobs small/capped (precedents: history ≤90, ledgers
  ≤50). Nested slices need null-guards at consumers.
- **Sync is union-merge, local-wins, 6 collections.** `weeklySchedule` and
  all coach state are local + backup only today; block metadata follows the
  same rule (plans themselves sync; if they land on a new device without
  block state they are simply ordinary user plans — graceful by design).
- **WorkoutPage has two render branches** (list + detail early-return);
  any modal reachable from both must be mounted in both, with a
  `registerBackHandler` per modal. Modals from the detail view need the
  `relative z-[70]` wrapper.
- **Coach prose has a tone contract**: plain English, names the exercise and
  the numbers, **no shame/guilt words** (tests regex-forbid them). New
  strings go to `i18n/en.ts` + `hi.ts`.
- **Gates**: coach surfaces respect `uiPreferences.coachEnabled`;
  advanced analytics stay behind `userMode === 'advanced'` where existing.
- Coach state must never infer pain from free-text notes (existing rule:
  structured booleans only).

---

## 2. Architecture decisions

- **D1 — Pure engines, thin wiring.** Every new computation is a pure,
  deterministic function in `src/lib/` taking plain data + an injected
  `todayStr`. The store only persists results and routes user decisions.
  This matches `coach-engine.ts` / Policy v0 and makes everything unit-
  testable without a store.
- **D2 — One arbiter per surface.** For **coach-managed** lifts (block or
  adopted plans), Policy v0 — properly fed (real rep ranges, coach-approved
  increments, block week-type) — is the single progression authority, and
  its ledger is the record. Unmanaged surfaces keep today's behaviour
  byte-for-byte. The digest's "Next session — coach's calls" reads managed
  decisions from the ledger for managed lifts.
- **D3 — Proposals, never edits.** The coach proposes: blocks, plan
  revisions, plateau changes, next-block. Materializing anything requires
  an explicit user approval in a preview→confirm flow (the
  `ImportProgramModal` / onboarding `plan_offer` precedent: generated plans
  are held as *pending* and applied only on accept). Applied changes are
  undoable where the app already has an undo pattern (toast action /
  `restorePlannedWorkout`).
- **D4 — Evidence is a data structure, not a vibe.** Every derived value
  and every proposal carries `{ value, n, tier, evidence }` where
  `evidence` is a plain-English sentence containing the actual numbers
  ("Bench e1RM rose ≈0.6 kg/week across 8 sessions since Sep 3"). UI shows
  the evidence inline or under the sanctioned `CollapsibleDetails "Why?"`.
- **D5 — Cold start is honest.** Tiers: `prior` (population default — UI
  must label it a default), `emerging`, `established`. Below threshold the
  coach says "still learning you" and falls back to the existing global
  constants. Faking personalization is a defect.
- **D6 — Safety outranks progress.** Pain episodes (correctly attributed
  via the `painfulExerciseName` rule) accumulate in the athlete model.
  ≥2 episodes in one movement family within 28 days ⇒ the family is
  excluded from new block proposals, managed progression for it is held,
  and reviews carry a plain "get it checked" line. We never diagnose,
  never name conditions. Sharp-pain/dizziness are not captured by current
  data; the assessment asks about *limitations* (existing machinery), and
  this program does not invent symptom capture it cannot support.
- **D7 — No LLM, no paywall, no chat UI, no redesign.** Local rules +
  statistics only. The removed 'Ask Coach' drawer stays removed. UI is
  built from existing components/tokens only (`Card`, `Badge`, `Button`,
  `.modal-*`, `CollapsibleDetails`, section-header pattern).
- **D8 — Mon–Sun everywhere; week identity is the Monday date string.**

---

## 3. PR-A — Athlete model (engine-first)

**New module `src/lib/athlete-model.ts`** — `buildAthleteModel(input, todayStr) => AthleteModel`.
Inputs: `workouts`, `dailyCheckins`, `bodyMetrics`, `prs`, `profile`,
`weeklySchedule` + `plannedWorkouts` (adherence denominator), existing
`coach.readinessHistory`. Deterministic; O(workouts).

### 3.1 Derived parameters (each: `{ value, n, tier, evidence }`)

1. **Check-in baselines** (`sleep`, `soreness`, `energy`): personal mean +
   spread over the last 56 days of check-ins. Tiers: n<5 `prior` (anchor
   3.0, labelled default), 5–13 `emerging`, ≥14 `established`. Purpose:
   "low *for you*" — a sleep score of 3 is normal for one athlete, a red
   flag for another. Readiness scoring itself is **not** changed in PR-A.
2. **Per-lift progression response** (keyed by evidence-layer canonical
   name; display name preserved): exposures; best-e1RM series; least-squares
   e1RM slope (kg/week, needs ≥4 sessions spanning ≥14 days); median
   sessions-between-progress (progress = session best e1RM >1% over prior
   best); sessions since last progress; last-progress date. Feeds PR-B
   progression schemes and PR-C focus picking.
3. **Recovery profile**: per muscle group (library muscle of the lift),
   performance-vs-rest-days curve — sessions bucketed by days since that
   muscle was last trained (1/2/3/4+), mean best-e1RM ratio vs the lift's
   personal best; `recoveryDays` = smallest bucket with mean ratio ≥0.97
   (needs ≥8 points, else `prior` = 2 days, labelled). Plus
   `lowReadinessShare` from readiness history (last 28 scored days).
4. **Adherence profile**: last 8 complete Mon–Sun weeks — planned sessions
   (current schedule as proxy; the evidence string says so), completed
   sessions, adherence rate, most-skipped weekday, most-trained weekday.
5. **Pain episodes**: per exercise + per movement family (`getMovementFamily`),
   attributed with `exerciseHadPain` semantics. Episode dates (last 90
   days), count in last 28 days, `flaggedFamilies` per D6.

### 3.2 Persistence (pattern (a), §1.1)

Store slice `athleteModel: AthleteModel | null`, refreshed wherever
`lifterProfile` refreshes (after `addWorkout`, on rehydrate when null,
after check-in/metric writes that feed it). Lands in `partializeAppState`,
`BACKUP_STATE_FIELDS`, `importAllData`. Size-capped: lifts with ≥2
exposures only, ≤40 lifts by recency; episodes ≤90 days, ≤60 kept.
Post-review amendment: the model is NOT exported in backups
(`BACKUP_STATE_FIELDS`) — it is fully derived and recomputed on import
from the restored inputs, so the exported blob would be dead bytes;
it persists locally via partialize only.

### 3.3 UI (minimal, engine-first)

Home, inside the existing coach area: a `CollapsibleDetails`
"What your coach has learned" listing up to 5 highest-value facts with
tier badges (`Default` / `Learning` / `Personal`). Copy contract: when
most facts are `prior`, the card says the coach is still learning the
user and shows what will unlock it ("after ~4 more sessions"). Gated by
`coachEnabled`. Keys `coachModel.*` (en + hi).

### 3.4 Tests (`tests/athlete-model.test.ts`)

Baseline math (means/spreads on known check-in sets); slope estimation on
synthetic e1RM series (rising/flat/noisy); cold start (empty history →
all `prior`, no NaN, no crash); sparse data (1 workout, 1 check-in);
pain attribution (swap-renamed entries credit the original lift, not the
substitute); adherence across a Mon–Sun boundary (Sunday workout counts
to the week ending that Sunday); lbs inputs normalized to kg.

---

## 4. PR-B — Coach-built plans (the centerpiece)

### 4.1 Assessment (`block-intake.ts` pure helpers + `CoachBlockModal`)

Three short steps inside one modal, following onboarding/modal
conventions (hand-rolled `.modal-*`, `useModalA11y`, back-handler):
1. **Your week** — goal (prefilled from profile goals), days/week
   (prefilled), session length (30/45/60/75/90 — the one genuinely new
   input), confirm equipment (prefilled from profile).
2. **Your body** — limitation chips (shoulder/knee/low back/elbow/wrist/
   hip/ankle/other/none) feeding `getInjuryBannedFamilies`; flagged pain
   families from PR-A shown as pre-ticked, explainable chips.
3. **Your numbers** — top-lift estimates prefilled from PRs/e1RM
   (editable, skippable → conservative defaults labelled as estimates).
Ask only what's missing; everything prefilled is confirmable in one tap.

### 4.2 Block generator (`block-engine.ts`, pure + deterministic)

Inputs: intake, `AthleteModel`, exercise library, PRs, existing plans
(name-collision avoidance), unit.

- **Structure**: 6-week block (4 build + 1 deload + 1 test) default;
  5-week (3 + 1 + 1) for beginners or ≤2 days/week. Focus from goal +
  nutrition phase: strength / hypertrophy / fat-loss (strength-maintain)
  / maintenance.
- **Split**: days 2 → full-body ×2; 3 → full + upper/lower rotation;
  4 → upper/lower ×2; 5 → upper/lower + weak-point day; 6 → PPL ×2.
  Skeleton from existing split machinery, then coach modifications:
  banned-family filtering (`getInjuryBannedFamilies` +
  `findFamilySafeAlternative`), equipment adaptation
  (`adaptSplitForEquipment`), weak-point accessories (lowest-progress /
  lowest-volume muscles from PR-A + `muscle-volume` data get the
  accessory slots, with the reason recorded).
- **Prescriptions**: real rep ranges (main lifts 4×4–6 RPE 7–8 build /
  9 test; secondary 3×6–10; accessories 2–3×10–15 RPE 8). Starting loads
  from e1RM percentages (week 1 ≈72–78% main lifts) via `roundToLoadable`;
  no e1RM → rep-based start with an honest "calibrate week 1" note.
- **Progression scheme per lift** (stored in block state, D2):
  `double_progression` over the rep range; increment = athlete's observed
  typical increment (PR-A) or equipment default (barbell 2.5 kg upper /
  2.5 kg lower... recorded explicitly; dumbbell = smallest per-hand step);
  the scheme text shows its assumption ("you've added ≈0.8 kg/wk on
  squats; this assumes half that — revised weekly").
- **Rationale**: block-level summary + per-exercise `why` (evidence
  sentence each). A proposal with an unexplained exercise is a defect.
- **Output** `BlockProposal` held in the `coachBlocks` slice as *pending*
  (D3) — nothing touches Train until approval.

### 4.3 Approval → materialization

Preview→confirm (ImportProgramModal pattern): shows exactly which plans
will be added and which schedule days change. On confirm, one handler:
create one `PlannedWorkout` per block day (name `<Block> · <Day>`),
`setPlannedWorkouts([...existing, ...new])`, `setWeeklySchedule` mapping
block weekdays, record `activeBlock { proposalId, planIds, startMonday,
intake, schemes }`. Plan origin rides `PlanExtras.coachBlockId`
(reconcile whitelist extension — same graceful degradation as existing
fields) so a subtle "Coach block" badge can render on the PlanCard.
Deleting a block plan mid-block: block state tolerates missing planIds
(review notes it; no crash, no resurrection).

### 4.4 Adoption

"Coach this plan" on an existing user plan creates
`adoptedPlans[planId]` with derived per-exercise schemes (rep range
around the plan's target reps; main-lift detection via `percent-1rm`'s
`mainCompoundKey`). From then on the plan is coach-managed (D2 applies)
without changing a single prescribed number until the user approves a
proposal.

### 4.5 Daily management (scoped Policy v0 repair)

In `store.addWorkout`'s policy evaluation, **only for coach-managed
exercises**: pass the scheme's real `repRange`, `incrementConfig` with
`approvalSource: 'coach_approved'`, and `blockContext.weekType`:
- build week → normal evidence-gated progression;
- deload week → progression locked; high-RPE sessions propose −10%
  (existing deload semantics) as a decision, never an auto-edit;
- test week → no auto changes; top-set outcomes feed PR-C debrief.
Unmanaged behaviour is byte-identical (guarded by existing tests +
new regression tests asserting unmanaged calls pass no new options).

### 4.6 Plateau proposals

`detectStalls` output for managed lifts becomes a proposal card (Train
coach section + PR-C review): stall evidence (sessions, e1RM flatness),
the diagnosed change (variation swap / rep scheme / deload week for that
lift), **Apply** → guarded plan edit (identity resolution + stale-check
in the spirit of `validatePolicyDecisionApplication`), or **Dismiss**
(uses the existing `coach.stallFlags` acknowledgement). One proposal per
lift until acknowledged.

### 4.7 Tests (`tests/block-engine.test.ts`, `tests/block-adoption.test.ts`)

Determinism (same inputs → identical proposal); constraint invariants
(never programs a banned family; respects days/session-length budget —
exercise count scales with minutes; equipment filter); deload + test
weeks present and positioned; progression schemes sane at extremes
(very weak / very strong / bodyweight-only / no-history athlete);
adoption derives schemes without mutating the plan; plateau proposal
fires at exactly the detectStalls threshold and not before; unmanaged
policy calls unchanged.

---

## 5. PR-C — Weekly review + debriefs

### 5.1 Review engine (`weekly-review.ts`, pure)

For a Mon–Sun week: adherence (completed ÷ planned, schedule-labelled),
tonnage + Δ vs prior week (profile bodyweight — never the 75 kg fallback
when a profile exists), PRs set, per-muscle volume highlights, recovery
trend (readiness-history mean + check-in means **vs PR-A personal
baselines**), coach activity (decisions accepted/applied, proposals
dismissed), pain flags (D6 escalations), and **one focus** picked by rule
priority: safety (pain) → adherence (most-skipped day) → stall (main
lift) → progression opportunity. Then **revision proposals** for next
week: next block week's type, stall changes (§4.6), a schedule-realism
proposal when a day is repeatedly skipped (move, don't nag). Each
proposal: evidence + apply path (D3).

### 5.2 Review surface

New `CoachWeeklyReviewModal` (store-self-sufficient, like
`WeeklyRecapModal` which stays untouched as the share card). Entry: a
Home card when an unseen review exists + a row in the Train coach
section. Reviews persist in a `weeklyReviews` slice (pattern (a),
≤12 weeks). Sections: headline numbers, what the coach changed and why,
recovery vs your baselines, proposals (Accept/Dismiss), one focus.
Generated for the just-ended week; an empty week produces an honest
short review ("no sessions logged — nothing to review"), never filler.

### 5.3 Post-workout debrief (extends `PostWorkoutTakeModal`)

When the finished workout belongs to a managed plan/block day, a compact
"Vs your block" block (2–3 lines, dismissible, never blocking): what
changed vs the prescription (from `workout-adherence` comparisons) and
why (deload week / readiness adaptation / progression applied), plus one
cue (the weakest evidence point). Pure helper `buildSessionDebrief`.
Non-managed workouts: modal unchanged.

### 5.4 Block debrief + test week

At block end (test week complete or block expired): the review becomes a
block debrief — sessions completed vs planned, per-main-lift e1RM change
(start vs test week, from PR-A series + PRs), adherence, what the coach
learned (updated response rates), and **Propose next block** → §4.2
prefilled with the new weak points. Block marked `completed` in the
slice; its plans remain ordinary user plans.

### 5.5 Tests (`tests/weekly-review.test.ts`)

Aggregation over a Mon–Sun week (Sunday/Monday boundary workouts land in
the right weeks); empty week; lbs; focus priority order; revision
proposal generation from a stalled managed lift; debrief line correctness
for a deload-week session vs a build-week session.

---

## 6. Honesty + safety rules (acceptance criteria for every PR)

1. Every number the coach shows traces to logged data or is labelled a
   default/estimate. No invented precision (slopes show ≈ and n).
2. Every suggestion carries its evidence sentence with real numbers.
3. Cold start says so. `prior`-tier values render as defaults.
4. Pain: structured signals only; recurring-pain escalation per D6;
   "get it checked" language mirrors existing copy; never a diagnosis.
5. No shame/guilt vocabulary anywhere (test-enforced word list).
6. The user can dismiss/override everything; dismissal is remembered
   (existing acknowledgement patterns) — the coach never re-nags the same
   proposal.
7. All new strings in `en.ts` + `hi.ts`; all dates local Mon–Sun.

## 7. Benchmark — honest comparison (claims limited to what the code does)

| Capability | Generic template generator | Fitbod (paid) | JuggernautAI (paid) | Strong / Hevy | ASCEND coach (this program) |
|---|---|---|---|---|---|
| Assessment beyond goal | ✗ | partial (days, length, equipment) | ✓ (powerlifting intake) | ✗ | ✓ intake: week, body, numbers — prefilled from your data |
| Block periodization (build/deload/test) | ✗ | ✗ (per-workout generation) | ✓ | ✗ | ✓ 5–6 week blocks with deload + test weeks |
| Plan from *your* logged response | ✗ | partial (proprietary, opaque) | partial | ✗ | ✓ per-lift response rates learned from your history (PR-A) |
| Evidence shown per decision | ✗ | ✗ | partial | n/a | ✓ every proposal carries its numbers |
| Weekly revision of the plan | ✗ | n/a (regenerates) | ✓ | ✗ | ✓ review + approvable revisions (PR-C) |
| Adopts & manages *your own* plan | ✗ | ✗ | ✗ | n/a | ✓ adoption without replacing it |
| Pain-aware, family-safe swaps | ✗ | partial (exclusions) | partial | ✗ | ✓ family exclusion + recurring-pain escalation |
| Price / data | varies | subscription | subscription | free/paid logging | free; local rules+statistics; no account data leaves the device for coaching |

Honest limits of this program: no video/form coaching; readiness uses
global (not per-muscle) soreness; e1RM is an estimate, not a measured
max; adherence denominators use the *current* schedule as the plan proxy
for past weeks and say so.

## 8. Process per PR

Audit (done) → implement → `npm test` (baseline: 1357 passed / 20 failed,
all 20 in `tests/security-integration-gate.test.ts`, Docker-infra) →
adversarial self-review (cold start, injured, missed weeks, override-
everything, Mon–Sun edges, plan deleted mid-block, lbs) → fix → open PR
(stacked: B on A, C on B) → verify Vercel preview READY + touched flows
load → report. Program log:
`~/workspace/goals/ascend-webapp-to-android-app/hidden_files/COACH_PROGRAM_LOG.md`.
