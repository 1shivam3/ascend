# ASCEND UX Redesign — Synthetic Personas, Round 1 (Phase 1)

> **Status:** Structured simulation, not real research. No interviews were conducted, no survey results exist, and no numbers below are measurements. Every rating is a qualitative simulated judgment (1–5) grounded in the Phase 0 baseline audit (`docs/ux-redesign/baseline-audit.md`) and the code it cites. Ratings explain *why*, and are never presented as usability rates, conversion, retention, or seconds saved.
> **Scope:** The master product on `feat/ux-redesign` (from `master` @ `2c6512d7`, post-merge of PRs #40/#41/#43). Form-check does not exist on this branch and is not simulated. The conversational coach chat UI, coach cloud sync, and MediaPipe CSP changes live only on unmerged branches and are not simulated either. Theme customization, Simple/Detailed mode, and dashboard card controls do not exist yet — personas evaluate them as *proposed* controls against the current toggle-only precedent.
> **Method note:** Tasks use actual features and file references from the baseline. Confidence marks whether the friction is code-confirmed or a hypothesis needing a live check (no browser tooling exists in the repo, so visual claims are code-level observations).

## How to read this document

Each persona has: profile (goal, context, level, digital pattern, density preference, most-needed information, friction points, customization tolerance), three tasks, each with all ten required items (objective; starting screen/state; expected sequence; confusing labels/choices; memory burden; unnecessary navigation/scrolling; error/abandonment point; suggested correction; implementation evidence; confidence + unresolved assumptions), a 1–5 rating table with explanations, a keep / simplify / access-less-often list, and abandonment reasons. Ratings: 5 = exemplary, 4 = good with minor friction, 3 = workable but flawed, 2 = seriously impaired, 1 = blocked.

---

## Persona 1 — Aarav, the New Gym Member

- **Goal:** Start training regularly without feeling stupid in front of the app.
- **Context:** 24, student, joined a gym two weeks ago, trains 2–3×/week with a friend's beginner plan. No tracking habit yet.
- **Level:** Beginner. Learning terms like "set", "RPE", "superset".
- **Digital pattern:** Phone-only, short sessions, taps what looks tappable, rarely reads help text.
- **Density preference:** Low. One next action, plain words, forgiving errors.
- **Most-needed information:** What to do today, what a set means, whether he did it right.
- **Friction points:** Jargon, the 14-section Today stack, hidden workout modes, implicit guest path.
- **Customization tolerance:** Near zero. Defaults must be right; he will not configure anything.

### Task 1.1 — Finish onboarding and find the first workout
1. **Objective:** Create a usable profile and reach a first workout without getting lost.
2. **Starting screen/state:** Fresh install, no profile → Splash → Welcome.
3. **Expected sequence:** Welcome → Create account (or guest via Goals) → Goals → Experience → Schedule (days + injury dropdown) → Details → Plan offer (skip or accept) → Today → Today's workout card → Start.
4. **Confusing labels/choices:** Guest access is implicit (via the Goals path), not a labeled "Continue as guest" choice — a beginner may believe sign-in is mandatory. "Plan offer" is unexplained: is accepting it a commitment?
5. **Memory burden:** Must remember goal/level/schedule choices across 9 screens; no summary screen restates them before tabs.
6. **Unnecessary navigation/scrolling:** 9 screens for a first workout; Schedule asks injuries of a user with none (mitigated by PR #43's "No injuries" default, but the step still exists).
7. **Error/abandonment point:** Bounces at Create account if the password rule (≥8 chars, letters+numbers) is discovered only after a failed submit; bounces at Plan offer if skip is not obvious.
8. **Suggested correction:** Label the guest path explicitly; add a one-line onboarding summary before tabs; make Plan-offer Skip visually equal to Accept.
9. **Implementation evidence:** Baseline §4.2 (9 screens, `Onboarding.tsx` state machine, `canContinueFromGoalStep`); password rule as hardcoded English string (`CreateAccountScreen.tsx:46`).
10. **Confidence + assumptions:** High (code-confirmed). Unresolved: whether the guest path is discoverable in practice needs a live tap-through (no browser tooling in repo).

### Task 1.2 — Log a first workout without knowing the modes
1. **Objective:** Complete a simple session and understand what was recorded.
2. **Starting screen/state:** Today → Today's workout card → Start (or Train → Plans → Start).
3. **Expected sequence:** Start → Active workout (mode defaults?) → complete sets with steppers → Finish → summary.
4. **Confusing labels/choices:** Beginner vs Advanced mode exists but the switch lives inside the workout tools menu (`ActiveWorkoutScreen.tsx:1962`) — Aarav never finds it, so he gets whichever mode is default without knowing an easier one exists. "Set type", "RPE/RIR" labels are unexplained.
5. **Memory burden:** Must remember what weight he used last time (previous performance exists but its placement is not guaranteed in his path).
6. **Unnecessary navigation/scrolling:** Logger (compose) vs Active workout (perform) are two surfaces; a beginner starting from Plans may compose, then perform, without understanding the difference.
7. **Error/abandonment point:** Enters a wrong weight, cannot find edit, or finishes without understanding the summary → does not return.
8. **Suggested correction:** Default new users to Beginner mode; surface the mode as a labeled choice at workout start ("Guided" vs "Full table"), not a tools-menu item; add one-line explanations for set type and RPE on first use.
9. **Implementation evidence:** Baseline §4.4 (Beginner one-set-at-a-time vs Advanced full table; mode switch location; 4,069-line screen).
10. **Confidence + assumptions:** High on mode location; medium on default-mode behavior (default mode value not traced — verify in implementation).

### Task 1.3 — Log a meal by searching
1. **Objective:** Record lunch without scanning or knowing food-database terms.
2. **Starting screen/state:** Fuel → Today → Add Manually → food search autocomplete.
3. **Expected sequence:** Search "dal" → pick entry → adjust portion → save → check "What you ate today".
4. **Confusing labels/choices:** Exact vs generic matches are not explained to a beginner; pinned-food macros are hardcoded defaults while portion memory silently overrides them — the number he sees may not be the number he expects, with no explanation.
5. **Memory burden:** Must remember his usual portion; the app remembers it (`userPortionPreferences`) but does not say so.
6. **Unnecessary navigation/scrolling:** Fuel's three segments (today/meals/macros) vs the two-tab mental model elsewhere; the form lives behind "Add Manually" while Scan is the visually dominant action.
7. **Error/abandonment point:** Picks a wrong entry (word-overlap match) and sees an "Estimated values" banner he does not understand; or finds no entry and abandons rather than using custom fields.
8. **Suggested correction:** Label portion-memory values ("your usual: 1 katori"); explain estimated values in plain words ("We guessed this food — check the numbers"); make custom-field entry a visible fallback, not a dead end.
9. **Implementation evidence:** Baseline §4.6 (autocomplete, portion memory, approximate-match banner, "Not found in offline database" + custom fields).
10. **Confidence + assumptions:** High. Unresolved: whether the estimated banner copy is understandable at a glance needs a live read.

### Persona 1 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 2 | The next action is buried: 9 onboarding screens, implicit guest path, hidden workout mode, two workout surfaces. |
| Information hierarchy | 2 | Today answers "everything" before "next action" (14 sections). |
| Interaction effort | 3 | Steppers and quick-adds are easy once found; finding them is the cost. |
| Visual comprehension | 3 | Chalk/vermilion system is calm and consistent; 10px labels hurt small-screen reading. |
| Accessibility | 3 | Focus-visible exists; icon-only header targets and unexplained jargon hurt. |
| Perceived polish | 3 | Consistent tokens, but empty first-week Today and unexplained controls feel unfinished. |

### Persona 1 keep / simplify / access less often
- **Keep:** Guest-first access, Beginner mode concept, quick-add habits, forgiving streaks (freeze auto-applies).
- **Simplify:** Onboarding (label guest, summarize choices), Today (one next action), workout start (labeled mode choice), meal search (plain-words estimates).
- **Access less often:** Charts, standards, plate calculator, meet planner, policy ledger, macro breakdowns.
- **Abandonment reasons:** Feels like an app for lifters, not for him; cannot find the first workout; jargon without explanation; a mistake feels unrecoverable.

---

## Persona 2 — Meera, the General Fitness User

- **Goal:** Stay consistent 3×/week with useful guidance, no statistics hobby.
- **Context:** 31, office job, home + gym mix, trains mornings, tracks meals loosely.
- **Level:** Intermediate generalist. Knows basic lifts, ignores advanced metrics.
- **Digital pattern:** Phone, 2–3 min check-ins, mostly mornings, skips configuration.
- **Density preference:** Low–medium. Today's priorities + one trend, nothing more.
- **Most-needed information:** What to do today, whether she is on track this week, simple nutrition totals.
- **Friction points:** Today overload, settings breadth, rest-day emptiness, streak messaging.
- **Customization tolerance:** Low. Will toggle 2–3 things if obvious; will not build a dashboard.

### Task 2.1 — Morning check: what is today's priority, then start
1. **Objective:** Open the app, know what to do, start in under a minute.
2. **Starting screen/state:** Returning user, last tab restored (may be Fuel or Progress, not Today).
3. **Expected sequence:** Open → (possibly wrong tab) → Today → Today's workout card → Start.
4. **Confusing labels/choices:** Last-tab restore means "open the app" does not reliably mean "see today". The workout card, nutrition strip, readiness, level, athlete model, and weekly review all compete for the first glance.
5. **Memory burden:** Must remember her plan day and whether a workout is already active (resume path exists but is one card among many).
6. **Unnecessary navigation/scrolling:** Must scroll past nutrition + coach cluster to reach quick actions; rest-day state still shows the full stack.
7. **Error/abandonment point:** Opens to the wrong tab, sees a wall of sections, closes the app and trains without logging.
8. **Suggested correction:** Today above the fold = workout card + next action + one supporting signal; make "open app → Today" the predictable path (or make the last-tab restore opt-in); collapse the coach cluster behind one section (already partially done by PR #41 — finish it).
9. **Implementation evidence:** Baseline §3 (lastActiveTab restore), §4.3 (section order), Top Problem #1 (14-section stack).
10. **Confidence + assumptions:** High. Unresolved: whether last-tab restore delights or annoys real users is a hypothesis — the redesign should test it by making Today the default landing with resume state preserved.

### Task 2.2 — Rest day: is the app still useful?
1. **Objective:** Check in on a rest day without feeling behind.
2. **Starting screen/state:** Today, no workout scheduled.
3. **Expected sequence:** Today → habit matrix → hydration quick-add → (optional) weekly review.
4. **Confusing labels/choices:** "No workout today" is not a designed state — the workout card slot, readiness, and coach blocks still render around an absence. Streak language risks implying failure (mitigated by forgiving freezes, but the copy must say so).
5. **Memory burden:** None significant.
6. **Unnecessary navigation/scrolling:** Full stack renders for a day with one meaningful action (habits).
7. **Error/abandonment point:** Rest day feels like an empty failure state → skips opening the app on rest days → habit loop breaks.
8. **Suggested correction:** Design an explicit rest-day state: recovery note, habit matrix, weekly progress summary — no workout card pretending otherwise.
9. **Implementation evidence:** Baseline §4.3 (conditional sections, empty states are per-screen conditionals, not a pattern).
10. **Confidence + assumptions:** Medium — rest-day rendering is inferred from section structure, not observed live.

### Task 2.3 — Change the weekly target from Auto to 3 days
1. **Objective:** Set a realistic weekly training target.
2. **Starting screen/state:** Today → Settings gear → Customization section (weekly target Auto/Off/2–6).
3. **Expected sequence:** Gear → scroll to Customization → weekly target → pick 3 → back.
4. **Confusing labels/choices:** "Weekly target" vs "weekly schedule" (days picker) are two nearby controls for overlapping concepts; "Auto" is unexplained (auto from what?).
5. **Memory burden:** Must remember where Customization lives (Settings §3, behind sticky chips).
6. **Unnecessary navigation/scrolling:** Settings is a long page; the gear is a small icon; the target control is not reachable from Today or Train.
7. **Error/abandonment point:** Gives up and leaves Auto on, then feels the app's expectations don't match her life.
8. **Suggested correction:** Explain Auto in one line ("Auto follows your plan"); surface weekly target in Profile/You as well as Settings (one canonical control, one shortcut — same field, not a copy).
9. **Implementation evidence:** Baseline §4.7 (Settings §3, sticky chips from PR #41, `weeklyTargetDays` in uiPreferences).
10. **Confidence + assumptions:** High on location; medium on Auto semantics (derivation not traced — verify in implementation).

### Persona 2 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Core tasks exist and work, but the next action competes with 13 other sections. |
| Information hierarchy | 2 | Today has no designed fold; rest days have no designed state. |
| Interaction effort | 3 | Quick-adds are good; settings journeys are long. |
| Visual comprehension | 4 | Calm palette, consistent cards; only density hurts. |
| Accessibility | 3 | Same icon-target and label-size issues as P1, plus settings scrolling. |
| Perceived polish | 3 | Solid but generic — the "statistics wall" impression dominates. |

### Persona 2 keep / simplify / access less often
- **Keep:** Today's workout card, nutrition strip, habit matrix, forgiving streaks, quick-adds.
- **Simplify:** Today fold, rest-day state, weekly target explanation, settings grouping.
- **Access less often:** Standards, meet planner, plate calculator, policy ledger, macro tab, PR deep-dives.
- **Abandonment reasons:** Opens to a wall of numbers; rest days feel like failure; configuration takes longer than training.

---

## Persona 3 — Rohan, the Bodybuilding Lifter

- **Goal:** Run a multi-exercise hypertrophy program with fast, accurate logging.
- **Context:** 27, training 4 years, push/pull/legs, 5–6 sessions/week, tracks volume and exercise history.
- **Level:** Advanced.
- **Digital pattern:** Phone in the gym, one hand, between sets, low patience for taps.
- **Density preference:** High in the workout, low elsewhere. Wants the table, not a tour.
- **Most-needed information:** Current exercise + set + previous performance + volume, at a glance.
- **Friction points:** Logger/perform split, modal nesting, table density on 390px, rest-timer placement.
- **Customization tolerance:** Medium. Will set up plans and preferences once, then expects zero friction.

### Task 3.1 — Start a push session and log it in Advanced mode
1. **Objective:** Execute a 6-exercise session with minimal taps per set.
2. **Starting screen/state:** Train → Plans → Start plan (pre-fills logger) → Active workout (Advanced full table).
3. **Expected sequence:** Start → per-exercise table → weight/rep steppers → complete set → auto-advance → next exercise → Finish → summary.
4. **Confusing labels/choices:** "Plans" vs "History" sub-tabs; logger (compose) vs active (perform) distinction; set-type and RPE/RIR labels unexplained in-table.
5. **Memory burden:** Must remember which mode he is in (mode switch is in the tools menu, not visible in-table).
6. **Unnecessary navigation/scrolling:** Plan → logger → active is two hops to start; the full table on 390px requires horizontal attention per row (verify live).
7. **Error/abandonment point:** Taps the wrong set row, edits the wrong set, or loses the rest timer behind controls → logs on paper instead.
8. **Suggested correction:** One-tap "Start" from the plan card straight into the perform surface (logger remains for building, not starting); persistent mode indicator; larger set-row targets; rest timer docked, never covering set controls.
9. **Implementation evidence:** Baseline §4.4 (plans pre-fill, Advanced table, rest-timer floating button, mode switch location).
10. **Confidence + assumptions:** High on structure; medium on 390px table behavior (needs live check — no browser tooling in repo).

### Task 3.2 — Find last week's performance for incline dumbbell press
1. **Objective:** Compare today's working weight against history before the first set.
2. **Starting screen/state:** Inside the active workout, on that exercise.
3. **Expected sequence:** Exercise row → previous performance display → (or exit workout → Train → History → detail → find exercise).
4. **Confusing labels/choices:** Previous performance is shown in-workout (good) but its scope (last session? best set? per-exercise history?) is not labeled; the full history path goes through a modal detail, not a route.
5. **Memory burden:** Must remember which session contained the lift; history is sorted by session, not by exercise.
6. **Unnecessary navigation/scrolling:** Leaving the workout to check history risks draft state (draft recovery exists, but the round trip is still friction mid-session).
7. **Error/abandonment point:** Cannot find the comparison quickly → guesses the weight → trains suboptimally → trusts the app less.
8. **Suggested correction:** In-workout exercise history expander (last 3 sessions for that lift, best set highlighted); keep the full history path as the archive, not the lookup.
9. **Implementation evidence:** Baseline §4.4 (previous performance in active workout; history modal detail; `history-records-executed-sets` regression test).
10. **Confidence + assumptions:** High on paths; medium on previous-performance scope labeling (verify in implementation).

### Task 3.3 — Calculate plates for a 140 kg barbell load
1. **Objective:** Load the bar correctly without mental math.
2. **Starting screen/state:** Train → workout tools menu → Plate calculator.
3. **Expected sequence:** Open calculator → enter target → read plate breakdown → back to workout.
4. **Confusing labels/choices:** Tool lives in a tools menu whose contents are not visible from the workout screen's primary hierarchy.
5. **Memory burden:** Must remember bar weight and available plates (calculator presumably defaults them — verify).
6. **Unnecessary navigation/scrolling:** Leaving the active workout for a tool, then returning (draft must survive — it does via auto-save, but the trip is avoidable).
7. **Error/abandonment point:** Cannot find the calculator mid-session → does mental math or skips it.
8. **Suggested correction:** Surface the plate calculator as a contextual action on barbell exercises inside the workout (one tap, sheet, return to same set).
9. **Implementation evidence:** Baseline §4.4 (PlateCalculatorModal in tools menu).
10. **Confidence + assumptions:** Medium — tools-menu membership and defaults need a live check.

### Persona 3 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | The workout itself is capable, but start paths and tool locations are indirect. |
| Information hierarchy | 3 | Advanced table is information-rich; the surrounding navigation dilutes it. |
| Interaction effort | 2 | Between-set speed is the product's job; modal hops and small targets fight it. |
| Visual comprehension | 4 | Tables read well; density is a feature here, not a bug. |
| Accessibility | 3 | Stepper targets and table rows at 390px are the risk; focus order through modals is stack-managed. |
| Perceived polish | 3 | Powerful but utilitarian — the logger/perform split feels like two apps. |

### Persona 3 keep / simplify / access less often
- **Keep:** Advanced table, previous performance, plan pre-fill, plate calculator, volume, exercise history, draft auto-save.
- **Simplify:** Start path (plan card → perform), mode visibility, tool access from inside the workout.
- **Access less often:** Coach notes, challenges, quotes, macro tab, standards.
- **Abandonment reasons:** Logging is slower than paper between sets; wrong-set edits; rest timer hides controls.

---

## Persona 4 — Vikram, the Strength-Focused Lifter

- **Goal:** Progressive overload with trustworthy numbers: prior performance, trends, estimated vs measured clarity.
- **Context:** 34, barbell training 6 years, tracks top sets and e1RM, reviews weekly.
- **Level:** Advanced.
- **Digital pattern:** Phone in gym + desktop-ish review at home (but the app is a mobile column — see P4 friction).
- **Density preference:** High for trends, medium for daily use. Wants comparisons, not decoration.
- **Most-needed information:** Last top set, e1RM trend, PRs, volume trend — each labeled as measured or estimated.
- **Friction points:** e1RM distinction, chart label fragility, sub-tab naming drift, desktop stretch.
- **Customization tolerance:** Medium-high. Will configure ranges and filters if they persist.

### Task 4.1 — Compare today's top set with last session before lifting
1. **Objective:** Know the number to beat, with its provenance.
2. **Starting screen/state:** Active workout, on the lift, Advanced mode.
3. **Expected sequence:** Exercise → previous performance → lift → log → compare in summary.
4. **Confusing labels/choices:** Is "previous" the last session, the best set, or the last same-plan day? Is a displayed e1RM measured or estimated? The distinction exists in data but its visual treatment is not guaranteed.
5. **Memory burden:** Must remember which prior session is the comparison (plan day vs calendar recency).
6. **Unnecessary navigation/scrolling:** None in-workout if previous performance is present; high if he must detour to Progress.
7. **Error/abandonment point:** Mistakes an estimated e1RM for a measured PR → misloads → distrusts the app's numbers.
8. **Suggested correction:** Label every derived number ("est." badge + formula note on tap); label previous performance scope ("Last session · 12 May"); keep measured PRs visually distinct from estimates everywhere.
9. **Implementation evidence:** Baseline §4.5 (e1RM, PR derivation, measured-vs-estimated requirement), §4.4 (previous performance).
10. **Confidence + assumptions:** High on the requirement; medium on current labeling (verify live — hand-rolled charts make this fragile).

### Task 4.2 — Inspect the e1RM trend for squat over 12 weeks
1. **Objective:** Answer "am I getting stronger?" with a readable trend.
2. **Starting screen/state:** Progress → Strength sub-tab → chart → range/filter.
3. **Expected sequence:** Progress → Strength → select lift → set range → read trend.
4. **Confusing labels/choices:** Sub-tab code names (`strength|prs|bodyweight|training`) vs UI copy (Strength/Body/Consistency/Records) — the map is not 1:1, and deep links use code values. Chart axes/units are hand-rendered (no chart library).
5. **Memory burden:** Must remember which sub-tab holds which metric; filters may not persist across visits (verify).
6. **Unnecessary navigation/scrolling:** Progress is a separate tab from Train; trend review is disconnected from the workout where the data was created.
7. **Error/abandonment point:** Misreads an axis (units/dates unclear) or finds the trend chart missing for his lift → exports data mentally and stops trusting charts.
8. **Suggested correction:** Reconcile sub-tab names (display labels = code map, documented); every chart gets a title stating its question, labeled axes with units, and an explicit measured/estimated legend; persist range/filter per chart.
9. **Implementation evidence:** Baseline §4.5 (hand-rolled ProgressChart, naming drift, derivation-from-store re-render note).
10. **Confidence + assumptions:** High on naming drift (code-read); medium on axis clarity (needs live chart inspection).

### Task 4.3 — Verify a new PR after a session
1. **Objective:** Confirm the PR is genuine and see it in Records.
2. **Starting screen/state:** Post-workout summary → PR display → Progress → Records.
3. **Expected sequence:** Finish → summary PRs → Records view → confirm lift + value + date.
4. **Confusing labels/choices:** PRs live in two places (Progress sub-tab + TabId `prs`) — same source, two entries. Summary PRs vs Records PRs must use one derivation (verify no duplicate logic).
5. **Memory burden:** Must remember to check Records; the summary may show a PR the Records view derives differently (flagged fragility).
6. **Unnecessary navigation/scrolling:** Summary → tab switch → sub-tab → record row.
7. **Error/abandonment point:** Summary claims a PR that Records does not show (or vice versa) → trust collapse.
8. **Suggested correction:** Single PR derivation surfaced identically in summary and Records; Records rows link back to the session that set them.
9. **Implementation evidence:** Baseline §4.4/§4.5 (PR derivation, dual entry, finish-time fragility note).
10. **Confidence + assumptions:** High on dual entry; medium on derivation duplication (verify in implementation — do not change calculation logic in redesign).

### Persona 4 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Capabilities exist; labeling and naming drift undermine trust. |
| Information hierarchy | 3 | Strength content is present but scattered across tabs and modals. |
| Interaction effort | 3 | In-workout comparison is fast; trend review requires tab-hopping. |
| Visual comprehension | 2 | Hand-rolled charts + naming drift + estimated/measured ambiguity is the weakest visual area. |
| Accessibility | 3 | Charts need non-color distinction and labeled values (not verified). |
| Perceived polish | 3 | Numbers feel powerful but not yet trustworthy in presentation. |

### Persona 4 keep / simplify / access less often
- **Keep:** Previous performance, e1RM, PRs + Records, volume, standards, history detail.
- **Simplify:** Sub-tab naming, chart titles/axes/legends, estimated badges, PR derivation display.
- **Access less often:** Challenges, quotes, social/share features, macro tab.
- **Abandonment reasons:** A number he cannot trust; a chart he cannot read; desktop review feeling like a stretched phone.

---

## Persona 5 — Arjun, the Powerlifter

- **Goal:** Log SBD sessions fast, plan meet attempts, track records and standards.
- **Context:** 29, competitive powerlifter, trains 4–5×/week, peaking cycles, uses RPE and percentages.
- **Level:** Expert.
- **Digital pattern:** Phone between sets, sweaty hands, one thumb, zero tolerance for lag or extra taps.
- **Density preference:** Maximum in the workout; everything else minimal.
- **Most-needed information:** Bar weight, set × reps × RPE, rest time, next set — instantly.
- **Friction points:** Interaction speed, rest-timer occlusion, keyboard occlusion, set-type inputs, attempt planner access.
- **Customization tolerance:** High for training setup, zero for mid-workout configuration.

### Task 5.1 — Log a 5×5 squat session between sets
1. **Objective:** Five work sets logged with no more than ~3 taps per set.
2. **Starting screen/state:** Active workout, Advanced mode, squat first exercise.
3. **Expected sequence:** Set values → complete → rest timer → next set → repeat → next exercise.
4. **Confusing labels/choices:** Set types (warm-up/working/AMRAP/drop) and RPE/RIR inputs compete with the primary weight/reps fields for attention and taps.
5. **Memory burden:** Must remember set count and rest duration (timer helps, but its placement matters).
6. **Unnecessary navigation/scrolling:** Any modal, confirmation, or tools-menu trip mid-session is a failure; keyboard popping over the next set's fields is a failure.
7. **Error/abandonment point:** Rest timer covers the next set's controls; a mis-tap completes the wrong set; editing requires too many taps → paper log wins.
8. **Suggested correction:** Rest timer docked to a non-covering zone (bottom bar above nav, collapsible); set rows with large targets; one-tap "same as last set" for weight/reps; keyboard-aware layout that keeps the current set visible.
9. **Implementation evidence:** Baseline §4.4 (floating rest-timer button, steppers, set-complete transition state, 4,069-line screen).
10. **Confidence + assumptions:** High on structure; medium on occlusion behavior (needs live gym-condition check — no browser tooling in repo).

### Task 5.2 — Plan third attempts for a mock meet
1. **Objective:** Get attempt selections from current strength data.
2. **Starting screen/state:** Train → tools menu → Meet attempt planner.
3. **Expected sequence:** Open planner → review suggested attempts → adjust → (apply or note).
4. **Confusing labels/choices:** Planner lives in a tools menu, disconnected from the SBD sessions that feed it; its relationship to PRs/standards is unstated.
5. **Memory burden:** Must remember current maxes; planner should pull them (verify it does).
6. **Unnecessary navigation/scrolling:** Tools-menu hunt + return trip to training.
7. **Error/abandonment point:** Cannot find the planner, or its suggestions lack provenance (which max? which date?) → uses a spreadsheet instead.
8. **Suggested correction:** Surface the planner contextually from Records/SBD history ("Plan attempts from these maxes") with provenance lines; keep the tools-menu entry as a shortcut.
9. **Implementation evidence:** Baseline §4.4 (MeetAttemptPlannerModal).
10. **Confidence + assumptions:** Medium — planner inputs/provenance not fully traced; verify in implementation.

### Task 5.3 — Check records and strength standards for deadlift
1. **Objective:** See best deadlift + where it sits against standards.
2. **Starting screen/state:** Progress → Records (or TabId `prs`).
3. **Expected sequence:** Records → deadlift → value + date + standards context.
4. **Confusing labels/choices:** Two entries to Records (sub-tab + TabId) with no stated difference; standards presentation (which standard? which bodyweight class?) is unclear.
5. **Memory burden:** Must remember bodyweight context for standards relevance.
6. **Unnecessary navigation/scrolling:** Tab + sub-tab + row; standards may live on a different sub-tab than records.
7. **Error/abandonment point:** Standards shown without bodyweight context mislead → ignores standards entirely.
8. **Suggested correction:** One Records destination; standards shown with the bodyweight and date they were computed from; link each record to its session.
9. **Implementation evidence:** Baseline §4.5 (PRsPage, standards, dual entry).
10. **Confidence + assumptions:** Medium on standards context (not fully traced).

### Persona 5 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | SBD logging works, but speed-critical details (timer, targets, planner access) fight the user. |
| Information hierarchy | 3 | The set row is the hierarchy; everything around it competes. |
| Interaction effort | 2 | Between-set speed is the job, and the current screen taxes it most. |
| Visual comprehension | 3 | Dense tables read OK; timer and modal layers clutter the critical moment. |
| Accessibility | 2 | Sweaty-hand, one-thumb use is the harshest target test; small steppers and occlusion hurt most here. |
| Perceived polish | 3 | Capable, not yet fast-feeling. |

### Persona 5 keep / simplify / access less often
- **Keep:** Advanced table, steppers, rest timer (docked), set types, RPE/RIR, attempt planner, records, standards, draft recovery.
- **Simplify:** Rest-timer placement, same-as-last-set, planner entry from Records, set-row targets.
- **Access less often:** Coach notes, challenges, nutrition detail, social features.
- **Abandonment reasons:** Too slow between sets; timer hides controls; planner unfound; a mis-tap corrupts a session.

---

## Persona 6 — Priya, the Fat-Loss User

- **Goal:** Lose fat steadily with honest nutrition totals, weight trend, and no judgmental messaging.
- **Context:** 28, desk job, tracks meals most days, weighs 3×/week, walks daily.
- **Level:** Intermediate tracker, beginner lifter.
- **Digital pattern:** Phone, several short logs/day, corrects mistakes often.
- **Density preference:** Low-medium. Totals vs targets + trend, not every micronutrient.
- **Most-needed information:** Calories + protein vs target, weight trend (not single readings), habit consistency.
- **Friction points:** Scan honesty boundary, portion-memory opacity, backdating impossibility (D1), unmatched foods, judgmental copy risk.
- **Customization tolerance:** Low-medium. Will set targets once; will not configure dashboards.

### Task 6.1 — Scan lunch, review, save, and understand what is estimated
1. **Objective:** Log a thali photo accurately, knowing which numbers are exact and which are estimated.
2. **Starting screen/state:** Fuel → Scan Meal (or Today quick action) → camera → LLM loading → review → save.
3. **Expected sequence:** Scan → review list → edit items/portions → save → "What you ate today" updates.
4. **Confusing labels/choices:** Exact vs generic resolution is the honesty boundary: the review must show which items matched exactly and which are estimated ("Estimated values — based on {entry}"). A beginner may not grasp the difference from a banner alone.
5. **Memory burden:** Must remember to review before saving; must hold the photo's contents in mind while editing the parsed list.
6. **Unnecessary navigation/scrolling:** Scan → review → save is three stages (necessary), but error correction inside review (portion edits, item swaps) must not require restarting the scan.
7. **Error/abandonment point:** Saves an estimated total as if exact → later distrusts totals; or abandons on an unmatched item instead of using custom fields.
8. **Suggested correction:** Per-item exact/estimated chips (not only a banner); one-tap portion correction inline; unmatched items offer custom fields immediately with the same form as manual entry.
9. **Implementation evidence:** Baseline §4.6 (Groq→Gemini chain, exact-only bridge, approximate banner, "Not found in offline database" + custom fields); scan is cloud-LLM today — the UI must not claim offline scan.
10. **Confidence + assumptions:** High. Unresolved: banner comprehension needs a live read.

### Task 6.2 — Backfill yesterday's missed weight entry
1. **Objective:** Record yesterday's weight so the trend stays truthful.
2. **Starting screen/state:** Progress (or Today log-weight action) → BodyMetricsModal → date input + weight → Save.
3. **Expected sequence:** Open modal → set date to yesterday → enter weight → save → trend updates.
4. **Confusing labels/choices:** The modal renders a date input — but `handleSave` never passes it and the store always stamps today (confirmed defect D1). The control lies: she believes she backdated, but the entry is dated today.
5. **Memory burden:** Must remember yesterday's reading (she does — she wrote it down).
6. **Unnecessary navigation/scrolling:** None, until she discovers the date was ignored — then the recovery path is unclear (edit? delete + re-add? neither fixes the date).
7. **Error/abandonment point:** Discovers the trend is wrong (two readings "today") → distrusts the weight trend entirely. This is a data-truth failure, not a cosmetic one.
8. **Suggested correction:** Do not redesign around this bug — fix the plumbing (pass the date through `updateBodyMetrics`) as an explicitly approved behavior fix, or remove the date control until the fix lands. The redesign must not ship the lying control in a prettier modal.
9. **Implementation evidence:** Baseline §4.5 + §6 D1 (`BodyMetricsModal.tsx:174,514-516` vs `:294-302` vs `store.ts:1985-1988`).
10. **Confidence + assumptions:** High (code-read, confirmed). This is the single most trust-damaging defect in the fat-loss flow.

### Task 6.3 — Correct a meal entry mistake (wrong portion saved)
1. **Objective:** Fix yesterday's dinner portion without deleting the day.
2. **Starting screen/state:** Fuel → Meals history → entry → edit.
3. **Expected sequence:** Find entry → edit portion → save → totals recalculate → confirm in "What you ate today" (for today) or history (for past days).
4. **Confusing labels/choices:** Whether editing recalculates from the food's macros vs the saved snapshot; whether portion memory learns from the correction (it should, and should say so).
5. **Memory burden:** Must remember which entry was wrong and what the right portion was.
6. **Unnecessary navigation/scrolling:** History lives on a separate Fuel segment from Today; correction requires segment-switching.
7. **Error/abandonment point:** Cannot find edit, or edits without totals updating → keeps two sources of truth in her head.
8. **Suggested correction:** Edit inline from history with immediate total recalculation shown; state whether the correction updated her usual portion.
9. **Implementation evidence:** Baseline §4.6 (Meals tab history, portion memory, goals form).
10. **Confidence + assumptions:** Medium — edit-path details not fully traced; verify in implementation.

### Persona 6 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Logging works; the honesty boundary and the date lie undermine it. |
| Information hierarchy | 3 | Totals vs targets are clear; history/edit paths are secondary and scattered. |
| Interaction effort | 3 | Scan + quick-add are fast; correction is the tax. |
| Visual comprehension | 4 | Nutrition strip + targets read well; banners need plain words. |
| Accessibility | 3 | Copy tone matters here (no judgment, no pressure); status colors (success==muted) blur feedback. |
| Perceived polish | 2 | D1 (lying date control) alone drops this: a truth defect feels unpolished regardless of visuals. |

### Persona 6 keep / simplify / access less often
- **Keep:** Scan + review, pinned foods, targets, weight trend, habit quick-adds, forgiving tone, estimated labels.
- **Simplify:** Per-item exact/estimated chips, inline correction, portion-memory transparency, date fix (behavior, flagged).
- **Access less often:** Macro deep-dives, standards, plate calculator, coach prescription detail.
- **Abandonment reasons:** A total she cannot trust; a trend corrupted by a lying date control; judgmental or pressuring copy; unmatched foods with no graceful fallback.

---

## Persona 7 — Karan, the Time-Constrained Lifter

- **Goal:** Train in 30 minutes: open, start, log, leave. Zero configuration.
- **Context:** 36, parent, lunch-break lifter, 3×/week, follows a fixed plan.
- **Level:** Intermediate.
- **Digital pattern:** Phone, rushed, one hand, often poor gym Wi-Fi.
- **Density preference:** Minimal during the session; everything else later or never.
- **Most-needed information:** Start button, current set, finish button. Nothing else mid-session.
- **Friction points:** Last-tab restore landing him on History, confirmations, navigation obstructing the workout, slow start path.
- **Customization tolerance:** Zero mid-session; will accept a one-time setup.

### Task 7.1 — Start today's workout in under a minute from app open
1. **Objective:** From cold open to first set with no detours.
2. **Starting screen/state:** App closed, last tab = History (from yesterday's review).
3. **Expected sequence:** Open → (History, wrong tab) → Today → workout card → Start → first set.
4. **Confusing labels/choices:** Last-tab restore optimizes for review, not for today's training — the most time-sensitive task pays for yesterday's browsing.
5. **Memory burden:** Must remember which tab holds today's workout (Today, not Train, for the plan-synced card).
6. **Unnecessary navigation/scrolling:** Tab correction + scroll past non-workout sections to reach the card (if it is not above the fold after the header).
7. **Error/abandonment point:** Spends the first minute navigating instead of warming up → trains without logging.
8. **Suggested correction:** Make Today the predictable landing for training days (or surface a persistent "Resume/Start today" action reachable from any tab); guarantee the workout card above the fold.
9. **Implementation evidence:** Baseline §3 (lastActiveTab restore), §4.3 (workout card position §2).
10. **Confidence + assumptions:** High on mechanics; medium on whether last-tab restore is net-positive (hypothesis — test by making Today default with a resume affordance elsewhere).

### Task 7.2 — Log sets fast with no confirmations mid-session
1. **Objective:** Complete sets with steppers only; no dialogs between sets.
2. **Starting screen/state:** Active workout, Advanced mode (or Beginner — whichever is faster for him).
3. **Expected sequence:** Set values → complete → next set (auto-advance where supported) → finish.
4. **Confusing labels/choices:** Discard requires confirmation (correct) but Finish vs Discard proximity risks a mis-tap; set-complete transition state timing may feel like lag.
5. **Memory burden:** Minimal — the screen holds state; draft auto-save covers interruption.
6. **Unnecessary navigation/scrolling:** Tools-menu trips, exercise-change flows, and any modal between sets.
7. **Error/abandonment point:** A confirmation dialog between sets, or a keyboard covering the next set, breaks flow → stops logging mid-session.
8. **Suggested correction:** Confirmations only for destructive actions (discard, delete); never for set completion or navigation; keyboard-aware layout keeps the current set visible.
9. **Implementation evidence:** Baseline §4.4 (discard confirm, set-complete transition state, draft auto-save).
10. **Confidence + assumptions:** High. Unresolved: exact keyboard behavior needs a live check.

### Task 7.3 — Finish and leave in two taps
1. **Objective:** End the session, glance at the summary, exit.
2. **Starting screen/state:** Last exercise done, active workout open.
3. **Expected sequence:** Finish → summary → back to Today/Train.
4. **Confusing labels/choices:** Post-workout modals ("Vs your block", plan-vs-actual, debrief) may stack after Finish — each is valuable, but together they delay exit.
5. **Memory burden:** None.
6. **Unnecessary navigation/scrolling:** Modal stack after Finish (summary → take → review → debrief) for a user who wants one glance.
7. **Error/abandonment point:** Taps through modals blindly, missing genuine feedback — or force-closes, unsure whether the workout saved (it did — finish persists before modals, verify).
8. **Suggested correction:** Summary first, always; coaching modals as one optional "Coach's take" expansion, not a forced stack; make saved-state obvious at Finish ("Saved ✓" is currently sage-muted — see D2).
9. **Implementation evidence:** Baseline §4.4 (finish → summary → PostWorkoutTakeModal → PlanVsActualReview → debrief).
10. **Confidence + assumptions:** Medium — modal order and save-before-modal ordering need implementation verification.

### Persona 7 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Start/finish exist, but landing and post-finish paths add minutes. |
| Information hierarchy | 2 | Time-critical actions compete with review content on every screen. |
| Interaction effort | 3 | Set logging is efficient; navigation to and from the session is not. |
| Visual comprehension | 3 | Clear enough; the cost is steps, not looks. |
| Accessibility | 3 | Large targets matter most here; steppers and finish proximity are the risks. |
| Perceived polish | 3 | Feels capable but not fast — speed is polish for this user. |

### Persona 7 keep / simplify / access less often
- **Keep:** Plan-synced workout card, draft auto-save, steppers, finish summary, forgiving streaks.
- **Simplify:** Landing (Today-first on training days), post-finish modal stack, set completion flow.
- **Access less often:** Everything not on the start→set→finish path.
- **Abandonment reasons:** A minute lost to navigation; a dialog between sets; uncertainty whether the workout saved.

---

## Persona 8 — Sana, the Detail-Oriented Athlete

- **Goal:** Understand training deeply: volume, muscle balance, trends, records, and her own data.
- **Context:** 30, trains 5×/week, reviews analytics weekly, exports data occasionally.
- **Level:** Advanced.
- **Digital pattern:** Phone + longer review sessions; uses filters, ranges, history.
- **Density preference:** High. Wants detail — but organized, labeled, and filterable, not a wall.
- **Most-needed information:** Volume trends, muscle-volume balance, e1RM, PRs, body metrics, history — each with provenance.
- **Friction points:** Hand-rolled chart labels, filter persistence, derivation transparency, no dedicated Detailed mode (currently one density for all).
- **Customization tolerance:** High. Will configure views, ranges, and dashboard cards if controls are good.

### Task 8.1 — Review weekly volume and muscle balance
1. **Objective:** See whether pushing volume is balanced across muscle groups.
2. **Starting screen/state:** Progress → Strength (or training sub-tab) → volume + MuscleVolumeSection.
3. **Expected sequence:** Progress → sub-tab → volume chart → muscle-volume breakdown → interpret.
4. **Confusing labels/choices:** Which sub-tab holds volume vs muscle volume is not obvious from names (code `training` vs UI "Consistency"?); volume derivation (sets × reps × weight, presumably) is unstated.
5. **Memory burden:** Must remember filter/range choices; if they reset per visit, comparisons fail.
6. **Unnecessary navigation/scrolling:** Sub-tab hopping between volume, muscle volume, and PRs for one review question.
7. **Error/abandonment point:** Cannot tell what a volume number includes (warm-ups? all sets?) → distrusts the chart.
8. **Suggested correction:** Chart titles stating the question + inclusion rules ("Volume = working sets × reps × weight"); persistent filters; muscle-volume section adjacent to volume, not scattered.
9. **Implementation evidence:** Baseline §4.5 (MuscleVolumeSection, hand-rolled charts, derivation-from-store).
10. **Confidence + assumptions:** Medium — volume derivation and filter persistence need implementation verification (do not change calculations).

### Task 8.2 — Filter Progress charts to the last 12 weeks for one lift
1. **Objective:** Isolate a trend window for a single lift.
2. **Starting screen/state:** Progress → Strength → chart → range/filter controls.
3. **Expected sequence:** Select lift → set 12-week range → read trend → (optionally) compare with PRs.
4. **Confusing labels/choices:** Range/filter affordances are per-chart and hand-built; their labels and persistence are not standardized.
5. **Memory burden:** Must re-apply filters each visit if they do not persist.
6. **Unnecessary navigation/scrolling:** Leaving the chart to check the PR that explains a spike.
7. **Error/abandonment point:** Filter resets silently → reads the wrong window → wrong conclusion.
8. **Suggested correction:** Standard filter component (lift + range + metric) with persistence; PR markers on trend charts linking to sessions.
9. **Implementation evidence:** Baseline §4.5 (ProgressChart, per-chart filters implied by sub-tab structure).
10. **Confidence + assumptions:** Medium — filter existence/persistence not fully traced; verify in implementation.

### Task 8.3 — Back up data via DataVault before switching phones
1. **Objective:** Export everything, safely, and confirm it worked.
2. **Starting screen/state:** Settings → Data, Privacy & Legal → DataVault backup (export).
3. **Expected sequence:** DataVault → export → confirm file → (later) import on the new phone.
4. **Confusing labels/choices:** DataVault vs sync vs delete-account vs purge are four nearby destructive-adjacent concepts; export format and completeness (which tables? coach data? photos?) must be stated, especially given 6-table sync reality.
5. **Memory burden:** Must remember where DataVault lives (Settings §4) and what it covers.
6. **Unnecessary navigation/scrolling:** Settings long page + section hunt; backup buried under Data & Privacy rather than Account.
7. **Error/abandonment point:** Exports believing it covers everything, then discovers coach/challenge/photo data was local-only (D10) → data loss on switch.
8. **Suggested correction:** DataVault screen states exactly what is included/excluded (tables + local-only items) before export; keep purge/delete as separate, clearly confirmed flows.
9. **Implementation evidence:** Baseline §4.7 (DataVaultModal, §4 Data), §6 D10 (6-table sync vs local-only data).
10. **Confidence + assumptions:** High on the sync gap; medium on DataVault coverage copy (verify in implementation).

### Persona 8 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Depth exists; discovery and labeling lag behind it. |
| Information hierarchy | 3 | Detail is present but scattered; no Detailed mode organizes it. |
| Interaction effort | 3 | Filters and exports work but require hunting. |
| Visual comprehension | 2 | Hand-rolled charts without standard titles/legends are the weakest visual system. |
| Accessibility | 3 | Charts need data tables or labeled values as non-visual alternatives (unverified). |
| Perceived polish | 3 | Powerful engine, unpolished presentation layer. |

### Persona 8 keep / simplify / access less often
- **Keep:** Volume, muscle volume, e1RM, PRs, standards, history detail, DataVault, filters.
- **Simplify:** Chart titles/legends/inclusion rules, filter persistence, DataVault coverage copy.
- **Access less often:** Challenges, quotes, quick-adds, social features.
- **Abandonment reasons:** A chart she cannot trust; filters that reset; a backup that silently excludes data.

---

## Persona 9 — Dev, the Returning User

- **Goal:** Come back after two inconsistent months without guilt and without relearning the app.
- **Context:** 26, trained regularly, then stopped; wants to resume the old plan at reduced loads.
- **Level:** Intermediate (returning).
- **Digital pattern:** Phone, tentative, checks history before committing.
- **Density preference:** Low at first. Reassurance + one next step, not a backlog of guilt metrics.
- **Most-needed information:** What he last did, what plan he was on, a sane next workout.
- **Friction points:** Cold-start Today (empty coach blocks), plan-sync confusion, streak messaging, schedule staleness.
- **Customization tolerance:** Low now; may grow later.

### Task 9.1 — Understand what he last completed
1. **Objective:** See his last session and how long ago it was, without judgment.
2. **Starting screen/state:** Today (returning, last tab restored) or Train → History.
3. **Expected sequence:** History → most recent session → detail → note the date + lifts.
4. **Confusing labels/choices:** "Last workout" vs "Today's workout" (plan-synced card may show a plan day, not his actual last session) — the distinction matters after a gap.
5. **Memory burden:** Must reconstruct his old plan from history rows (plan association may not be shown per session).
6. **Unnecessary navigation/scrolling:** Today → Train → History → detail modal for a basic question.
7. **Error/abandonment point:** Sees a stale plan or an empty coach section and feels the app forgot him → does not resume.
8. **Suggested correction:** Returning-user state on Today: "Welcome back — your last session was X (date), your plan is Y. Start light?" with a deload-aware suggestion (no new programming logic — presentation of existing plan + history only).
9. **Implementation evidence:** Baseline §4.3/§4.4 (plan-synced card, history modal, cold-start tiers).
10. **Confidence + assumptions:** Medium — returning-user rendering inferred from section structure; deload suggestion is a presentation proposal, not new programming.

### Task 9.2 — Adjust the schedule to fewer days before resuming
1. **Objective:** Change training days from 5 to 3 without breaking the plan.
2. **Starting screen/state:** Settings → Customization → weekly schedule editor (or Onboarding schedule — duplicate surface).
3. **Expected sequence:** Schedule editor → unpick days → save → plan adjusts (verify how plan-sync responds).
4. **Confusing labels/choices:** Schedule (days picker) vs weekly target (Auto/Off/2–6) overlap; plan-sync contract behavior on schedule change is unstated in UI.
5. **Memory burden:** Must remember the schedule lives in Settings, not on Train.
6. **Unnecessary navigation/scrolling:** Settings hunt for a training decision.
7. **Error/abandonment point:** Changes days, plan does not visibly adjust (or adjusts opaquely) → confusion about what he is supposed to do next.
8. **Suggested correction:** Schedule editing reachable from Train (plan context) as well as Settings, one canonical editor; after a change, show what changed in the plan ("Next sessions now Mon/Wed/Fri").
9. **Implementation evidence:** Baseline §4.2/§4.7 (schedule in Onboarding + Settings editor; plan-sync contract).
10. **Confidence + assumptions:** Medium — plan-sync response to schedule edits needs implementation verification.

### Task 9.3 — Resume without streak punishment
1. **Objective:** Train again without the app shaming a two-month gap.
2. **Starting screen/state:** Today → habit matrix / streak display.
3. **Expected sequence:** Open → see streak state → train → matrix updates.
4. **Confusing labels/choices:** Streak display must communicate the freeze rule ("freezes auto-applied") rather than showing a zeroed streak as failure.
5. **Memory burden:** None.
6. **Unnecessary navigation/scrolling:** None.
7. **Error/abandonment point:** A zeroed streak or guilt-toned copy ("You missed 60 days!") → closes the app for another two months. This is the highest-abandonment-risk moment in the product.
8. **Suggested correction:** Forgiving copy by default ("Welcome back — consistency counts, perfection doesn't"); streak display shows freezes applied; never show a guilt count.
9. **Implementation evidence:** Baseline §4.3 (streaks forgiving, freeze auto-applies — standing rule), §9 preservation checklist (no punishing streaks).
10. **Confidence + assumptions:** High on the rule; medium on current copy tone (verify strings in implementation).

### Persona 9 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | History and plans exist; the "welcome back" path does not. |
| Information hierarchy | 2 | Cold-start Today shows absence, not guidance. |
| Interaction effort | 3 | Schedule editing works but lives far from training. |
| Visual comprehension | 3 | Same calm system; tone and empty states decide this persona. |
| Accessibility | 3 | No persona-specific blockers beyond the shared ones. |
| Perceived polish | 2 | Returning feels like an edge case the product forgot. |

### Persona 9 keep / simplify / access less often
- **Keep:** History detail, plan-sync, forgiving streaks, draft recovery, schedule editor.
- **Simplify:** Returning-user Today state, schedule editing from Train, streak copy.
- **Access less often:** Standards, macro tab, challenges, policy ledger.
- **Abandonment reasons:** Guilt copy; a stale plan presented as today's truth; an empty coach section where guidance should be.

---

## Persona 10 — Nikhil, the Interrupted User

- **Goal:** Never lose work to a refresh, tab switch, offline stretch, or app update.
- **Context:** 33, patchy gym Wi-Fi, switches apps mid-workout, closes tabs accidentally.
- **Level:** Intermediate.
- **Digital pattern:** Phone, chaotic sessions, relies on autosave and sync.
- **Density preference:** Medium. Wants state honesty: what is saved, what is local, what failed.
- **Most-needed information:** Draft status, sync status, offline state, error recovery — in plain words.
- **Friction points:** Draft-restore coverage, sync-scope honesty (6 tables), multi-tab coordination, stale shell after deploys.
- **Customization tolerance:** Low. Wants the system to handle it.

### Task 10.1 — Survive a refresh mid-workout
1. **Objective:** Refresh the page during a session and resume exactly where he left off.
2. **Starting screen/state:** Active workout, 3 exercises done → refresh.
3. **Expected sequence:** Reload → hydration splash → active draft restored → continue (or explicit resume prompt).
4. **Confusing labels/choices:** Is the restored state a draft or the saved workout? The UI must say ("Draft restored — nothing lost") rather than silently showing values.
5. **Memory burden:** Must trust the restore; any doubt makes him re-enter sets (duplication risk).
6. **Unnecessary navigation/scrolling:** Re-finding the workout if restore drops him on Today instead of the active session.
7. **Error/abandonment point:** Restore fails or restores stale values → re-enters sets → duplicates or quits logging.
8. **Suggested correction:** Explicit restore affordance ("Resume draft" banner on Today + in Train) with timestamp; draft contents preview before resuming; never silently merge a stale draft over newer work.
9. **Implementation evidence:** Baseline §4.4 (draft auto-save to localStorage, pause-and-save-draft), §5 flow 4 (draft-recovery fragility note).
10. **Confidence + assumptions:** Medium — restore coverage (which states restore: logger draft? active draft? both?) needs implementation verification.

### Task 10.2 — Train offline, then sync on reconnect without duplicates
1. **Objective:** Log a full session offline; have it appear in history and cloud after reconnect, once.
2. **Starting screen/state:** Offline (airplane mode / dead Wi-Fi) → active workout → Finish → reconnect.
3. **Expected sequence:** Offline banner → log → finish (local save) → reconnect → sync engine reconciles → sync status shows synced.
4. **Confusing labels/choices:** "Offline Gym Mode" vs sync status (synced/syncing/idle/local-only) vs DataVault backup — three different "safety" concepts. The UI must not imply cloud backup for local-only data (coach, challenges, habits, photos are not in the 6-table sync).
5. **Memory burden:** Must remember what was logged offline until sync confirms (status indicator carries this — if visible).
6. **Unnecessary navigation/scrolling:** Checking sync status requires Settings (§1) — far from the workout that created the data.
7. **Error/abandonment point:** A sync conflict duplicates a workout, or a silent failure loses it → stops trusting offline mode.
8. **Suggested correction:** Sync status visible from Today header (near the bell) + per-workout sync state in History ("Synced" / "Pending"); sync copy states exactly which data syncs (6 tables) and what stays local.
9. **Implementation evidence:** Baseline §5 flow 9 (sync engine, tombstones, 6 tables), §6 D10, §4.7 (sync status in Settings).
10. **Confidence + assumptions:** High on the 6-table gap; medium on duplicate-guard behavior (reconcile idempotency — verify in implementation).

### Task 10.3 — Survive an app update mid-week (stale shell)
1. **Objective:** Open the app after a deploy and get the new version, not last week's UI.
2. **Starting screen/state:** Returning browser, new deployment live.
3. **Expected sequence:** Open → fresh shell → normal use.
4. **Confusing labels/choices:** There is no version indicator, so a stale shell is indistinguishable from the current app — the user reports bugs that are already fixed (this already happened in the form-check saga).
5. **Memory burden:** None (the failure is invisible).
6. **Unnecessary navigation/scrolling:** Workarounds (incognito, cache-clear) are not user tasks at all.
7. **Error/abandonment point:** Reports a fixed bug, gets told "update", cannot tell whether he updated → distrusts the product's reliability.
8. **Suggested correction:** Fix the SW cache strategy as an approved behavior fix (versioned cache name + update prompt, e.g. "New version available — refresh"), or at minimum surface a build/version indicator in Settings for support. Do not "redesign around" a stale shell.
9. **Implementation evidence:** Baseline §3 (SW `ascend-v2.0.0-cache`, 3s race, cache fallback), §6 D6.
10. **Confidence + assumptions:** High (already observed in production use). This is a behavior fix, flagged — not a redesign task.

### Persona 10 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Offline mode exists and mostly works; its honesty and visibility lag. |
| Information hierarchy | 2 | Sync status is buried in Settings; draft state is implicit. |
| Interaction effort | 3 | Recovery works when it works; verification costs the user effort. |
| Visual comprehension | 3 | Banner exists; status vocabulary (synced/idle/local-only) is not explained. |
| Accessibility | 3 | Status must not rely on color or icon alone (sync states need text). |
| Perceived polish | 2 | Invisible failures (stale shell, silent sync gaps) feel unpolished no matter how clean the UI looks. |

### Persona 10 keep / simplify / access less often
- **Keep:** Draft auto-save, offline mode, tombstone reconcile, tab-leader coordination, sync status, DataVault.
- **Simplify:** Sync status visibility (Today header), draft-restore affordance, sync-scope copy, SW update behavior (flagged fix).
- **Access less often:** Everything else during an interruption.
- **Abandonment reasons:** Lost sets; duplicated workouts; a "fixed" bug that reappears (stale shell); backup that doesn't cover what he assumed.

---

## Persona 11 — Ananya, the Minimalist

- **Goal:** A calm app showing only what she needs: today's workout, food totals, habits.
- **Context:** 24, trains 3×/week, dislikes dashboards, hides everything she can.
- **Level:** Intermediate.
- **Digital pattern:** Phone, quick glances, deletes apps that feel noisy.
- **Density preference:** Minimal. Fewer cards, larger type, more air.
- **Most-needed information:** Today's workout, calories, habit checks. Nothing else by default.
- **Friction points:** No card controls exist; settings breadth; avatar-only profile entry; restore path unknown.
- **Customization tolerance:** Medium for hiding things (that's the point), zero for complex editors.

### Task 11.1 — Hide secondary Today cards
1. **Objective:** Reduce Today to workout + nutrition + habits.
2. **Starting screen/state:** Today (14 sections) → seeks card controls.
3. **Expected sequence:** Find customization → toggle off readiness, level, athlete model, review, steps, challenge, quote → Today shrinks → confirm.
4. **Confusing labels/choices:** No such controls exist today — only gamification/coach/habit-matrix/muscle-volume toggles in Settings §3, which hide some blocks but not cards generally, and there is no per-card control or ordering.
5. **Memory burden:** Must remember which toggles map to which cards (names don't match section titles).
6. **Unnecessary navigation/scrolling:** Settings hunt for a Today-layout desire; no in-place customization.
7. **Error/abandonment point:** Cannot hide the noise → deletes the app for a simpler tracker.
8. **Suggested correction:** "Customize Today" sheet reachable from Today (not only Settings): checkboxes per section + up/down order + restore defaults; essential workout card cannot be hidden; toggle names match section titles exactly.
9. **Implementation evidence:** Baseline §2.2 (uiPreferences toggles only), §4.3 (section list), brief §6.2 (dashboard personalization, greenfield).
10. **Confidence + assumptions:** High (controls absent — code-confirmed). This task is currently impossible; it evaluates the proposed control.

### Task 11.2 — Restore the default layout after over-hiding
1. **Objective:** Undo customization in one tap.
2. **Starting screen/state:** Today, over-hidden (e.g. hid the workout-adjacent cards she actually wanted).
3. **Expected sequence:** Customize → Restore defaults → confirm layout → back.
4. **Confusing labels/choices:** "Restore defaults" must state what it restores (layout only? density? theme?) — a combined reset that also resets her theme would be a nasty surprise.
5. **Memory burden:** Must remember the default layout to judge the restore (she can't — that's why restore must be exact, not approximate).
6. **Unnecessary navigation/scrolling:** None if restore lives in the same sheet as the toggles.
7. **Error/abandonment point:** Restore also resets theme/density → she re-hides everything and stops customizing.
8. **Suggested correction:** Separate resets: layout reset, theme reset, density reset — each scoped, each one tap, each with a toast confirming what changed.
9. **Implementation evidence:** No restore mechanism exists for layout (greenfield); `resetThemeToSystem` exists for theme only (store).
10. **Confidence + assumptions:** High (greenfield). Scoped resets are a design decision, not a current behavior.

### Task 11.3 — Find Settings without studying the app
1. **Objective:** Reach Settings from anywhere, first try.
2. **Starting screen/state:** Any tab, new-ish user.
3. **Expected sequence:** See a labeled entry → Settings.
4. **Confusing labels/choices:** Today has a gear icon (PR #41) and an unlabeled avatar; other tabs have neither. A gear icon is learnable, but an unlabeled avatar as the Profile entry is not discoverable.
5. **Memory burden:** Must remember "gear on Today" or "avatar = profile" — neither is labeled.
6. **Unnecessary navigation/scrolling:** Tab-switch to Today just to reach the gear.
7. **Error/abandonment point:** Concludes the app has no settings (or no profile) → never personalizes → churns on noise she could have hidden.
8. **Suggested correction:** Labeled "You" destination in the bottom nav (Profile + Settings as sections) — one persistent, labeled entry from every tab; avatar continues to open the same destination.
9. **Implementation evidence:** Baseline §3 (4 tabs, avatar→Profile→gear chain), §4.7, Top Problem #2.
10. **Confidence + assumptions:** High. The "You" tab is the IA decision debated in Phase 2.

### Persona 11 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 2 | The core minimalist tasks are currently impossible or undiscoverable. |
| Information hierarchy | 2 | No density control means the hierarchy is fixed at "everything". |
| Interaction effort | 2 | Hiding things requires a Settings hunt that may not even achieve it. |
| Visual comprehension | 4 | The underlying visual system is calm; it is the quantity, not the style, that fails her. |
| Accessibility | 3 | Fewer elements would help focus order, but she cannot get there. |
| Perceived polish | 2 | An app that cannot be quieted feels unfinished to this user. |

### Persona 11 keep / simplify / access less often
- **Keep:** Workout card, nutrition strip, habit matrix, forgiving streaks.
- **Simplify:** Everything else into hideable, reorderable, restorable sections.
- **Access less often:** By definition, everything she hides — but it must remain findable, not deleted.
- **Abandonment reasons:** Cannot hide noise; restore surprises; settings undiscoverable.

---

## Persona 12 — Rahul, the Accessibility-Conscious User

- **Goal:** Use the app reliably with large text, keyboard navigation, and reduced motion.
- **Context:** 40, trains 4×/week, uses xlarge text scale, sometimes keyboard, sensitive to motion.
- **Level:** Intermediate.
- **Digital pattern:** Phone + occasional keyboard; increases font size system-wide; notices focus and contrast.
- **Density preference:** Medium. Clarity over compactness; no tiny labels.
- **Most-needed information:** Same as general users, but reachable without precise taps or color-only cues.
- **Friction points:** 10px labels at xlarge, icon-only targets, success==muted ambiguity, modal-stack keyboard behavior, reduced-motion coverage, stepper targets.
- **Customization tolerance:** Medium. Will set text scale and motion preferences if they work.

### Task 12.1 — Use the app at xlarge text scale on a 390px phone
1. **Objective:** Read and tap everything with xlarge text, no clipped or overlapping UI.
2. **Starting screen/state:** Settings → textScale xlarge → Today + active workout.
3. **Expected sequence:** Set xlarge → navigate Today → start workout → log sets.
4. **Confusing labels/choices:** `text-3xs` (10px) labels exist in 100+ places; at xlarge they scale the whole UI (root font size) — whether cards, tables, and steppers survive is unverified at 390px.
5. **Memory burden:** None.
6. **Unnecessary navigation/scrolling:** Overflow-induced horizontal scroll or wrapped controls that push actions below the fold.
7. **Error/abandonment point:** A clipped set value, an overlapping rest timer, or a broken table at xlarge → cannot train with the app.
8. **Suggested correction:** Raise the label floor (remove 10px from the scale; minimum 11px), audit Today + active workout + modals at xlarge/390px as an implementation acceptance test, and keep steppers at ≥44px targets at all scales.
9. **Implementation evidence:** Baseline §2.2 (textScale, 10px labels, xlarge unverified), Top Problem #9.
10. **Confidence + assumptions:** Medium — breakage is hypothesized, not observed (no browser tooling); the audit is a required implementation test, not a claim.

### Task 12.2 — Navigate by keyboard, including modal stacks
1. **Objective:** Complete a workout-logging flow without a pointer, including opening and closing modals.
2. **Starting screen/state:** Train → Plans → logger → exercise selector modal → active workout.
3. **Expected sequence:** Tab through controls → open selector → choose → Escape/back → continue → finish.
4. **Confusing labels/choices:** Icon-only buttons (header gear/bell, steppers, modal closes) need accessible names; nested modals (selector inside logger, detail inside history) need a correct focus trap and return-focus behavior.
5. **Memory burden:** Must remember focus position across modal open/close (the system should restore it, not the user).
6. **Unnecessary navigation/scrolling:** Focus traps that cycle through hidden background content, or modals that drop focus to the page top on close.
7. **Error/abandonment point:** Focus lost inside a modal stack, or Escape closing the wrong layer (workout instead of selector) → data-loss fear → abandons keyboard use.
8. **Suggested correction:** Preserve the stack-aware trap semantics (`use-modal-a11y`) through the redesign; every icon button gets an accessible name; Escape closes one layer; focus returns to the opener; test the logger→selector→active chain by keyboard in implementation.
9. **Implementation evidence:** Baseline §4.9 (stack-aware trap documented in the hook), §2.2 (focus-visible rules).
10. **Confidence + assumptions:** Medium — trap semantics are documented, not live-tested here.

### Task 12.3 — Train with reduced motion and non-color status cues
1. **Objective:** Log sets with motion off and understand success/failure without color.
2. **Starting screen/state:** Reduced-motion preference on → active workout → complete sets, view summaries.
3. **Expected sequence:** Complete set → feedback (no bounce/flash) → summary states (completed vs missed vs PR).
4. **Confusing labels/choices:** Success color IS muted sage (`#858076`) in both themes — success is indistinguishable from inactive content by color alone. Reduced-motion coverage today is one globals block + ExerciseDemo freeze; set-complete transitions and tab-enter animations are not explicitly covered.
5. **Memory burden:** Must infer state from position/context when color fails.
6. **Unnecessary navigation/scrolling:** None.
7. **Error/abandonment point:** Cannot tell a completed set from a skipped one, or a PR from a normal set → misreads his own session.
8. **Suggested correction:** Separate success from muted in the token system (new success green, distinct in both themes, verified by contrast audit); every status gets a non-color cue (check icon, label, weight); extend reduced-motion rules to all keyframe animations + transitions globally.
9. **Implementation evidence:** Baseline §2.1 (success == sage), §2.2 (reduced-motion block, ExerciseDemo), §6 D2.
10. **Confidence + assumptions:** High on the color defect (code-confirmed); medium on motion coverage gaps (needs implementation audit).

### Persona 12 ratings
| Dimension | Score | Why |
|---|---|---|
| Task clarity | 3 | Tasks are possible in principle; the details (labels, targets, cues) decide them. |
| Information hierarchy | 3 | Hierarchy survives scaling better than the components do. |
| Interaction effort | 2 | Keyboard + modal-stack + small-target risks compound. |
| Visual comprehension | 2 | Success==muted is a comprehension failure, not a style preference. |
| Accessibility | 2 | The lowest score in the panel — the baseline is the honest starting point, and the redesign must earn a higher one. |
| Perceived polish | 3 | Focus-visible rules and reduced-motion awareness exist; coverage is incomplete. |

### Persona 12 keep / simplify / access less often
- **Keep:** Focus-visible rings, text-scale preference, reduced-motion awareness, ExerciseDemo freeze, modal-stack trap.
- **Simplify:** Label floor, target sizes, status cues (icon + label, never color alone), motion coverage.
- **Access less often:** Decorative animation, dense tables at small scales.
- **Abandonment reasons:** A clipped control at xlarge; focus lost in a modal; success he cannot distinguish from inactive.

---

## Cross-persona synthesis (what Round 1 actually proves)

These are simulated judgments, not findings. Patterns that recur across ≥4 personas are treated as decision inputs for Phase 2, not as evidence of real-user demand.

1. **Today has no designed fold (P1, P2, P7, P9, P11).** The highest-leverage IA decision is the above-fold set + a designed rest-day and returning-user state. Everything else is downstream.
2. **The workout is capable but its access paths and mid-session details fight the user (P3, P4, P5, P7, P12).** Mode discoverability, rest-timer placement, target sizes, and start-path length recur independently of persona skill.
3. **Settings/Profile/auth are three surfaces for overlapping concerns (P2, P9, P11).** The "You" unification proposal emerges from P11's task 11.3, P2's settings hunt, and P9's schedule hunt — not from any single persona.
4. **Honesty boundaries are trust boundaries (P4, P6, P8, P10).** Estimated vs exact, measured vs estimated, synced vs local-only, and the D1 date lie are the same class of problem: the UI must never state (or imply) something the data does not support.
5. **Greenfield controls are the highest-risk, highest-value build (P11, P2, P8).** Card visibility/ordering, Simple/Detailed, and accent themes have no existing implementation to evaluate — Round 2 must constrain them hard (essential-action protection, scoped resets, contrast safeguards) or they will recreate the clutter they are meant to fix.
6. **Accessibility is a baseline deficit, not a polish item (P12, P5, P7).** Success==muted, 10px labels, small targets, and unverified xlarge/390px behavior must be fixed in tokens and acceptance tests, not documented away.
7. **No persona asks for a new capability.** Every task is completable (or completable-after-fix) with existing features. The redesign's job is placement, hierarchy, labeling, and feedback — not features. The two behavior fixes that keep recurring (D1 date plumbing, D6 SW cache) are flagged for explicit scope approval, not smuggled into the redesign.
