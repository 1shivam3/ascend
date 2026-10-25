# ASCEND UX Redesign — Design Team Debate (Phase 2)

> **Status:** Structured simulation, not real research. The eight experts below are fictional roles created to force disagreement and evidence-checking. No expert said any of this in reality; no user data, survey, or statistic is cited. Every decision is grounded in the Phase 0 baseline audit and the Phase 1 personas, and every decision records its trade-off and verification method.
> **Scope:** The master product on `feat/ux-redesign` (from `master` @ `2c6512d7`). Form-check, conversational coach chat, and coach cloud sync are out of scope (unmerged branches). Theme/density/dashboard controls are greenfield proposals, not existing features.

## Round 1 — Independent critiques

### Expert A — Principal Product Designer
- **Top problems:** (1) Today has no designed fold — the product's most-visited screen answers "everything" before "next action". (2) Profile/Settings/auth are three surfaces for overlapping concerns. (3) The workout start path (plan → logger → perform) treats composing and performing as equals, but performing is the job.
- **Worst hierarchy:** Today (§4.3 order: header, workout, nutrition, readiness, level, athlete model, review, quick actions, hydration, coach notes, steps, matrix, challenge, quote). The quote is last by accident, not by decision; the coach cluster sits above the actions.
- **Confusing paths:** Avatar → Profile → gear → Settings; last-tab restore landing on History; PRs via sub-tab and via TabId.
- **Inconsistent components:** Modal system has no shared manager (36 components, per-page booleans); settings rows, section headers, and chart frames each vary.
- **Over-promoted:** Coach cluster (4 consecutive blocks), monthly challenge, daily quote placement, macro tab.
- **Hard to find:** Settings, profile, schedule editor, plate calculator, meet planner, DataVault, sync status.
- **Preserve:** Guest-first access, draft auto-save, plan-sync contract, forgiving streaks, exact/estimated scan honesty, the Beginner/Advanced mode concept, hand-rolled chart data (not its frames).

### Expert B — Senior Visual Designer
- **Top problems:** (1) No typographic hierarchy: display size (32px) exists but headings do not use the loaded display face; 10px labels carry real meaning. (2) Success==muted sage destroys status legibility. (3) Desktop is a stretched mobile column — the system has no ≥1024px composition at all.
- **Worst hierarchy:** Progress charts: hand-rolled frames with fragile axes, no standard title/legend, and sub-tab names that disagree with code.
- **Confusing paths:** Visual only: the Today header packs bell + gear + avatar as three small icon targets with no labels.
- **Inconsistent components:** `.card` is used for everything (metric, coach note, habit, challenge, quote) — a generic card repeated regardless of content, exactly what the brief forbids.
- **Over-promoted:** Cards themselves. Surfaces should vary: rules, rows, and grouped lists, not boxes for every section.
- **Hard to find:** Selected states that rely on vermilion alone (accent == selection == brand — overloaded).
- **Preserve:** The vermilion/graphite/chalk identity (exact values verified), the calm surface system, the bottom-sheet modal pattern on mobile.

### Expert C — Senior Interaction Designer
- **Top problems:** (1) Mode switch hidden in the workout tools menu. (2) Rest timer as a floating button that can cover controls. (3) Post-finish modal stack (summary → take → review → debrief) delays exit.
- **Worst hierarchy:** Active workout: steppers, RPE/RIR, set types, crowded-gym, form cues, timer, and navigation compete in one 4,069-line screen.
- **Confusing paths:** Logger vs perform; modal-in-modal (selector in logger, detail in history) with a stack trap that must survive redesign.
- **Inconsistent components:** Confirmation patterns vary (discard confirmed, deletes confirmed, but some destructive-adjacent actions are one tap); toast vs inline error usage is per-modal.
- **Over-promoted:** Set-complete transition state and gamification flourishes during the session — feedback should be instant and then silent.
- **Hard to find:** Exercise history from inside a workout; plate calculator mid-session; schedule editor.
- **Preserve:** Draft auto-save, discard confirmation, back-handler stack semantics, keyboard/focus-visible rules.

### Expert D — Fitness Product Specialist
- **Top problems:** (1) Previous performance scope is unlabeled (last session? best set?). (2) Estimated vs measured values are not visually distinct. (3) Plan-sync contract is invisible to the user (what happens when the schedule changes?).
- **Worst hierarchy:** Fuel: scan dominates visually while manual entry (the correction path) is secondary; pinned-food defaults vs portion memory is opaque.
- **Confusing paths:** Plans vs History sub-tabs; run program card collapsed for non-enrolled (good) but its enrollment model is unexplained.
- **Inconsistent components:** PR displays (summary vs Records) must share one derivation; currently flagged as a verification item, not a proven fact.
- **Over-promoted:** Challenges and quotes in the daily training path; gamification (XP/level) above training content on Today.
- **Hard to find:** Attempt planner, standards context, muscle-volume breakdown.
- **Preserve:** User-plans-only rule, executed-sets history, volume/e1RM/standards calculations (presentation only — never touch the math), plate math, meet attempts.

### Expert E — Accessibility Specialist
- **Top problems:** (1) Success==muted sage (both themes) — status by color alone, and the color is wrong. (2) 10px labels in 100+ places, unverified at xlarge/390px. (3) Reduced-motion coverage is one globals block + ExerciseDemo — set-complete and tab-enter animations are not explicitly covered.
- **Worst hierarchy:** Today header: three icon-only targets (bell, gear, avatar) with no text labels and small hit areas.
- **Confusing paths:** Keyboard through modal stacks (documented trap, untested live); focus return on modal close.
- **Inconsistent components:** Touch targets vary (steppers vs icon buttons vs chips); disabled states are opacity-only in places (verify per component in implementation).
- **Over-promoted:** Motion as decoration (tab-enter on every switch is fine at 220ms; anything continuous is not).
- **Hard to find:** Anything reachable only by an icon (settings, profile, notifications).
- **Preserve:** Focus-visible rules, 16px inputs (no auto-zoom), modal-stack trap, text-scale preference, ExerciseDemo reduced-motion freeze.

### Expert F — Frontend Architecture Engineer
- **Top problems:** (1) 4,069-line ActiveWorkoutScreen + 3,748-line MealsPage + 4,023-line store: the redesign must not add a second state system or a parallel component library. (2) No chart library — every chart change re-verifies axes by hand. (3) Code-split tabs (dynamic + ssr:false) constrain desktop two-pane ideas: detail-as-modal is load-bearing for the 2GB-phone parse budget.
- **Worst hierarchy:** The modal layer (36 components, per-page booleans) — a shared Sheet wrapper must preserve stack/Escape/back semantics or regressions land in logger/history/scan.
- **Confusing paths:** URL deep links use code sub-tab values (`?sub=bodyweight`) while UI copy says "Body" — renaming display labels is safe; renaming URL params is not.
- **Inconsistent components:** 12 ui/ primitives exist but pages also hand-roll buttons/rows; the redesign must converge on the primitives, not add a second set.
- **Over-promoted:** Any proposal requiring a new dependency (chart lib, animation lib, drag-drop lib) — justify against bundle (88.2kB shared, 228kB main chunk) or reject.
- **Hard to find:** Sync-field coverage (which uiPreferences sync vs local-only) — implementation must audit before promising.
- **Preserve:** Zustand-persist + sync architecture, tab code-splitting, `TabId`/`?tab=` deep links, `useModalA11y` stack, existing API routes, CSP as-is (no new hosts).

### Expert G — Skeptical Product Reviewer
- **Top problems:** (1) The app shows everything it can compute, not what the user needs — Today is the symptom. (2) Gamification (XP/level/challenge/quote) occupies prime space on a training tool. (3) Proposed customization (themes, dashboard, density) risks recreating the clutter it claims to fix.
- **Worst hierarchy:** Today: quote last, challenge mid-stack, coach cluster above actions — prominence follows implementation ease, not user need.
- **Confusing paths:** Duplicated surfaces (schedule ×2, habits ×2, scan ×2, auth ×2, PRs ×2) — each pair needs a canonical-vs-shortcut ruling, not a redesign pass that preserves both silently.
- **Inconsistent components:** Settings chips mitigate a long page instead of fixing its breadth.
- **Over-promoted:** Monthly challenge, daily quote, XP/level, steps section (conditional — layout shift when it appears).
- **Hard to find:** Nothing is truly hidden — the problem is the opposite: everything is visible, so nothing is findable.
- **Preserve:** The refusal to add features. Every proposal below was checked against "does this remove a capability?" — none does.

### Expert H — Research Moderator
- **Top problems (method):** (1) No live observation exists — all findings are code-level; visual claims carry Hypothesis confidence until a live pass. (2) Persona ratings are simulated judgments, not measurements — Round 2 decisions must cite code evidence, not scores. (3) The brief's "~27 screens" understates the ~70-surface inventory — scoping by the old number would strand the modal layer.
- **Worst hierarchy (method):** Any decision justified by "users want" without a persona task + code reference behind it.
- **Confusing paths (method):** Auth surface fragmentation (AuthModal Google-only vs 5-method engine) — the Login screen method list itself is a Hypothesis (not visually verified).
- **Inconsistent components (method):** Chart and modal claims need live verification in implementation; docs must not overclaim.
- **Over-promoted (method):** Dissent itself — disagreement is recorded, not resolved by vote; decisions need named owners (the decision tables below name the deciding expert).
- **Hard to find (method):** Filter persistence, PR derivation duplication, portion-memory display, Auto-target semantics — all flagged as implementation verifications, not assumed.
- **Preserve:** The honesty rules (no invented history, no fake PRs, no offline-scan claims, no machine-translated Hindi names, no punishing streaks) as decision constraints, not preferences.

## Round 2 — Direct disagreement (all 16 topics)

Format per topic: competing proposals → user needs → app evidence → strongest objection → **final decision** → trade-off → verification method. Decisions marked † need the user's explicit approval where noted; none removes a product capability.

### 1. Should the current navigation remain, or should the main destinations change?
- **Proposals:** (A) Keep 4 tabs + labeled header entries (B) Add a 5th "You" tab unifying Profile + Settings (C) Sidebar-first navigation.
- **Needs:** P11/P2 discoverability (settings/profile found first try); P7 speed (no tab-hunt); existing users' muscle memory.
- **Evidence:** 4 tabs in `page.tsx:386`; Profile/Settings invisible from nav (Top Problem #2); `TabId` already includes `profile`/`settings`, so a 5th tab is presentational, not architectural.
- **Strongest objection (G):** A 5th tab spends a permanent slot on meta-content; header entries already exist.
- **Final decision (A, deciding): Adopt (B) — five tabs: Today / Train / Progress / Fuel / You.** "You" lands on Profile with a Profile | Settings segmented control; avatar continues to open the same destination; the Today header gear becomes a shortcut to You → Settings (not removed, redirected). Desktop adds a left rail with the same five destinations.
- **Trade-off:** One more tab slot; existing users relearn one entry point (mitigated: avatar behavior unchanged).
- **Verification:** Live pass: settings reachable first-try from every tab; avatar still opens Profile; deep links `?tab=profile|settings` still resolve.

### 2. Is the home screen an actionable daily starting point or an overloaded statistics dashboard?
- **Proposals:** (A) Action-first fold (workout card + next action + one signal) (B) Keep the stack, reorder only (C) Dashboard with collapsible sections.
- **Needs:** P1/P2/P7/P9: one next action; P11: quiet; P8: detail reachable, not imposed.
- **Evidence:** 14 sections (§4.3); PR #41 already collapsed the coach cluster — further collapse is IA, not styling.
- **Strongest objection (D):** Hiding readiness/athlete/review behind expanders could bury coaching value for users who rely on it.
- **Final decision (A, deciding): Action-first fold.** Above the fold: header (bell + avatar) + Today's workout card (start/resume, never contradictory) + nutrition strip (calories + protein, tap → Fuel). Below: one "Coach" section (notes + weekly-review summary + athlete top-2 behind expanders), then habit matrix, then user-ordered supporting sections. Rest-day and returning-user states are designed explicitly (see IA doc).
- **Trade-off:** Coaching content moves below the fold in Simple mode; Detailed mode restores more of it above (see topic 9).
- **Verification:** Live pass at 390px: workout card + next action visible without scrolling, in Simple and Detailed, on training/rest/returning states.

### 3. Where should workouts, workout plans, exercise history, and the active workout live?
- **Proposals:** (A) Keep Train = Plans | History + fullscreen active (B) Merge logger into active (one surface) (C) History as a route.
- **Needs:** P3/P5 speed; P7 start-in-a-minute; P9 history-first return.
- **Evidence:** Plans pre-fill logger; logger and active are distinct surfaces sharing a draft; history detail is a modal (back-handler stack).
- **Strongest objection (F):** Merging logger + active risks the draft contract (the most fragile state transition in the app).
- **Final decision (A, deciding): Keep the structure; fix the paths.** Train keeps Plans | History. Plan card "Start" goes straight to the perform surface (logger remains for building/editing, not starting). History stays modal detail (code-split + back-stack preserved); add in-workout exercise-history expanders (last 3 sessions for the lift) so lookup does not require leaving the session.
- **Trade-off:** Two workout surfaces remain — terminology must be consistent ("Build" vs "Train" labels) to prevent the current confusion.
- **Verification:** Task pass: plan → first set in minimal taps; history lookup from inside a workout without leaving it; draft survives both paths.

### 4. What belongs directly in the workout logging interface?
- **Proposals:** (A) Minimal: exercise + set + values + previous + next action (B) Everything including RPE/types/crowded-gym (C) Progressive: core now, advanced behind one expander per exercise.
- **Needs:** P5/P7 speed; P3 completeness; P1 guidance.
- **Evidence:** 4,069-line screen; steppers, RPE/RIR, set types, crowded-gym, form cues, timer all present.
- **Strongest objection (D):** Hiding RPE/types hurts advanced users who use them every set.
- **Final decision (C, deciding): Core always visible (exercise, set, weight/reps steppers, previous performance, complete, next action); RPE/RIR + set type + crowded-gym in one "Set options" expander per exercise, with the user's last-used options remembered.** In Detailed/Advanced mode the expander defaults open.
- **Trade-off:** One extra tap for advanced inputs in Simple mode; repaid by a cleaner critical path.
- **Verification:** Between-set tap count measured in live pass (simulated task, not a claimed metric); no advanced input removed.

### 5. Which details should be immediately visible and which belong in an expanded or advanced view?
- **Proposals:** (A) Strict: only next action + status visible; all else expanded (B) Contextual: visibility follows the screen's job (C) Density-keyed: Simple hides, Detailed shows.
- **Needs:** All personas; the tension is P11/P1 (hide) vs P8/P4 (show).
- **Evidence:** No density key exists; the only precedent is Beginner/Advanced + PR #41's collapses.
- **Strongest objection (G):** Expanders everywhere recreate the hunt — hidden is not the same as organized.
- **Final decision (C + guardrails, deciding): Density-keyed visibility (Simple/Detailed, see topic 9) + a hard rule: anything required to complete the screen's primary action is never behind an expander.** Expanders hold supporting context only (coach reasoning, history, chart filters, advanced inputs).
- **Trade-off:** Two layouts to maintain; mitigated by one density key + shared components.
- **Verification:** Primary-action audit per screen (can the main action complete with zero expander opens?); live pass in both modes.

### 6. Which charts and metrics deserve prominence?
- **Proposals:** (A) Strength trend + PRs first (B) Volume + consistency first (C) Goal-aware spotlight (one prominent chart chosen by goal, rest reachable).
- **Needs:** P4/P8 trends; P6 weight trend; P2 weekly consistency.
- **Evidence:** Hand-rolled charts; volume, e1RM, PRs, standards, body metrics, heatmap all exist; no chart library.
- **Strongest objection (B):** Goal-aware prominence risks hiding the metric a user actually checks.
- **Final decision (C with manual override, deciding): Progress opens on a "spotlight" chart chosen by profile goal (strength → e1RM trend; bodybuilding → volume; fat-loss → weight trend; general → consistency heatmap), with all other charts one tap away and the spotlight pinnable to any chart.** Every chart gets a title stating its question, labeled axes with units, and a measured/estimated legend.
- **Trade-off:** One more preference (spotlight pin) — but it is a single control, and the default is goal-derived, not random.
- **Verification:** Chart audit: title + axes + units + legend on every chart; spotlight override persists; no calculation changed (diff review).

### 7. How should nutrition be integrated into the overall application?
- **Proposals:** (A) Fuel stays a full tab; Today keeps a nutrition strip (B) Fold nutrition into Today only (C) Nutrition as a sheet from anywhere.
- **Needs:** P6 daily totals; P2 quick totals; P1 simple logging.
- **Evidence:** Fuel is the largest view file (3,748 lines); Today nutrition strip already exists; quick actions duplicate Fuel entries by design (fast path vs full path).
- **Strongest objection (G):** A full tab + a strip + quick actions is three doors to one room.
- **Final decision (A, deciding): Fuel stays a tab (it earns it: scan, library, history, macros, goals); Today keeps the strip; quick actions remain as the fast path with labels identical to their Fuel counterparts.** Rule: fast path and full path land on the same form — no divergent forms.
- **Trade-off:** Duplication retained deliberately; the cost is label discipline (one shared form, identical copy).
- **Verification:** Label audit: quick-action labels == Fuel labels; scan/manual/barcode/voice all land on the same meal list; no offline-scan claim anywhere.

### 8. Which items belong in Profile versus Settings?
- **Proposals:** (A) Keep split, clarify labels (B) Unify under "You" with Profile | Settings sections (C) Move everything account-related to Settings, leave Profile as read-only identity.
- **Needs:** P11/P2 discoverability; P9 schedule hunting; D's account-surface coherence.
- **Evidence:** Account rows live in both Profile menu and Settings §1 (duplication, Top Problem #4); AuthModal Google-only vs 5-method engine.
- **Strongest objection (F):** Unification touches auth flows (sign-out semantics, delete-account) — high-risk surface for a presentation change.
- **Final decision (B, deciding): "You" tab with Profile | Settings segments.** Profile = identity hero, quick metrics, sharing/community, log out. Settings = Account & Security (single canonical account surface, all 5 auth methods shown consistently), Appearance & Personalization (theme, density, dashboard), Training Preferences (schedule, target, experience, units, language), Data & Privacy (backup, purge, delete, legal, telemetry). No account row lives in both places afterward; sign-out/delete semantics untouched.
- **Trade-off:** Auth surface unification is the riskiest part — it changes where methods are shown, not which methods exist or how sign-out works. Implementation must diff auth flows line by line.
- **Verification:** Account-row audit (each row in exactly one place); auth method parity check (all 5 shown consistently); sign-out/delete flows task-tested unchanged.

### 9. What should happen in Simple mode versus Detailed mode?
- **Proposals:** (A) Simple = beginner UI, Detailed = everything (B) Simple = fewer sections, Detailed = all sections + advanced inputs (C) No modes; per-section customization only.
- **Needs:** P1/P11 (simple) vs P8/P4 (detailed); P7 speed in both.
- **Evidence:** Only precedent: Beginner/Advanced workout modes + PR #41 collapses. No density key exists.
- **Strongest objection (C):** Modes duplicate the customization system — why both a mode and card toggles?
- **Final decision (B, deciding): One `density` key (simple | detailed).** Simple = next action + status + clear labels + summaries; hides advanced inputs (workout Set options collapsed), chart filters (defaults shown), coach detail (expanders), steps/challenge/quote sections (hideable, default hidden in Simple for new users). Detailed = all sections + advanced inputs open + filters + full tables. Same data, same logic, presentation only. Workout mode follows density by default with a persistent in-workout override (`workoutModeOverride`, null = follow density). New users default Simple; existing users default Detailed (migration rule: no stored density key → Detailed for pre-redesign accounts, Simple for new accounts — preserves existing users' current experience).
- **Trade-off:** Two layouts to verify per screen; migration rule adds one branch. The alternative (Simple for everyone) was rejected: it would hide sections existing users rely on.
- **Verification:** Both-modes live pass on Today, Train, Progress, Fuel; primary-action audit in Simple (nothing critical hidden); migration test (old account → Detailed, new account → Simple).

### 10. How much customization is valuable before settings become overwhelming?
- **Proposals:** (A) Everything configurable (B) Three controls only: theme, density, dashboard (C) Theme + density only; dashboard fixed.
- **Needs:** P11 (hide noise) vs G (settings bloat) vs P8 (configure views).
- **Evidence:** Current toggles (gamification/coach/habit-matrix/muscle-volume) are the only precedent; settings breadth is already the complaint.
- **Strongest objection (G):** Dashboard ordering + theme + density + existing toggles = a second settings problem.
- **Final decision (B, deciding): Exactly three personalization controls, all in Appearance & Personalization:** (1) accent theme (presets + custom, see topic 11), (2) density (Simple/Detailed), (3) dashboard cards (visibility + up/down order via a "Customize Today" sheet). Existing toggles stay where they are (Training Preferences / gamification) — they are not folded into personalization. No drag editor (up/down buttons suffice — drag is unwarranted complexity). Essential-action protection: the Today's workout card cannot be hidden.
- **Trade-off:** Users who want per-screen customization beyond Today do not get it in this program — flagged as a future consideration, not a silent omission.
- **Verification:** Customize sheet task pass (hide, reorder, restore); essential card unhideable; no new settings screens created.

### 11. What is the right way to let users change accent color without breaking the brand or accessibility?
- **Proposals:** (A) Presets only (B) Presets + custom hex with contrast auto-correction (C) Full color system (backgrounds, text, borders configurable).
- **Needs:** Brief requirement (user-changeable accent); P12 contrast; brand identity (vermilion default).
- **Evidence:** `--accent`/`--accent-dim`/`--accent-glow` tokens + `accent.*` aliases already exist; no preset/custom UI, persistence key, or safeguard exists. Success==muted is a separate defect the new system must fix, not inherit.
- **Strongest objection (G):** Custom hex invites incoherent, unreadable themes — presets-only is safer.
- **Final decision (B, deciding): Curated presets (ASCEND Vermilion default + 5 others: Cobalt, Forest, Plum, Teal, Rose — final hexes in the design-system doc) + optional custom accent via hex input with live preview and automatic correction to the nearest shade meeting 3:1 (large/UI) and 4.5:1 (accent text) thresholds; failing combinations are corrected, never silently accepted for text use.** Semantic colors (success/warning/danger) are FIXED tokens, never derived from the accent. Reset-to-default is one tap. Accent changes only accent tokens — never backgrounds, text, borders, or status colors wholesale.
- **Trade-off:** Auto-correction may surprise a user who picked an exact hex (mitigated: preview shows the corrected shade + a note before applying).
- **Verification:** Contrast audit per preset + custom-correction cases (accent, accent-text, focus, selected, chart series) in both light and dark; theme-switch task pass; reset task pass.

### 12. Which onboarding steps are necessary, and which create needless friction?
- **Proposals:** (A) Keep all 9, polish copy (B) Cut to 5 (welcome, account, goals, schedule, details) (C) Keep 9 but make plan offer + injuries skippable-by-default.
- **Needs:** P1 first-run success; P9 returning (returning users should not re-onboard); data the coach/plan engines need (goal, level, schedule, injuries, diet).
- **Evidence:** 9 screens; goal gates progress (`canContinueFromGoalStep`); injury dropdown already optional-by-default (PR #43); plan offer skip must stay obvious.
- **Strongest objection (D):** Cutting goal/level/schedule/diet removes inputs the plan/coach logic consumes — presentation cuts must not become data cuts.
- **Final decision (A + targeted fixes, deciding): Keep all 9 steps (each feeds a real engine input); fix the friction inside them:** labeled guest path (not implicit); one-line explanations for goal/level choices; injury step stays optional-by-default; plan offer with Skip visually equal to Accept; a summary screen before tabs restating choices (editable via You → Training Preferences afterward). No step removed, no data shape changed.
- **Trade-off:** 9 screens remain long — repaid by clarity and by the summary screen (users see what the app learned).
- **Verification:** Onboarding task pass (guest + account paths); summary accuracy check; skip-path check (plan offer skipped → tabs work fully).

### 13. Which screens need a new layout rather than incremental styling changes?
- **Proposals:** (A) New layouts: Today, Settings/You, Progress, desktop composition (B) New layout for Today only (C) Restyle everywhere, no layout changes.
- **Needs:** Brief: "do not stop at tweaking radius/colors if structure is poor."
- **Evidence:** Today (14-section stack), Settings/You (split + breadth), Progress (sub-tab naming + chart frames), desktop (no composition), active workout (density, not structure — its hierarchy is sound).
- **Strongest objection (F):** Layout changes to the active workout and modal system carry the highest regression risk.
- **Final decision (A, deciding): New layouts for Today (fold + sections + states), You (Profile | Settings unification), Progress (spotlight + reconciled sub-tabs + chart frames), and desktop (left rail + content grid). Incremental styling only for: active workout (hierarchy preserved; mode visibility, timer docking, target sizes), Fuel (segments kept; strip/form consistency), modals (Sheet wrapper standardizes chrome, not flows), onboarding (copy + summary, same 9 steps).**
- **Trade-off:** Four layout projects + careful preservation elsewhere; active-workout restraint is deliberate (its structure works; its details don't).
- **Verification:** Layout inventory check (each screen tagged layout-new vs style-only); regression task list (flows §5 of baseline) re-run after each stage.

### 14. Which animations provide useful feedback?
- **Proposals:** (A) Keep existing 4 keyframes only (B) Add press/set-complete/timer/progress animations (C) Rich motion system.
- **Needs:** P5/P7 speed (feedback must not delay); P12 reduced motion; brief (purposeful, premium motion).
- **Evidence:** 4 Tailwind keyframes (fadeIn 0.25s, tabEnter 0.22s, slideUp 0.25s, scaleIn 0.2s); one reduced-motion block + ExerciseDemo freeze.
- **Strongest objection (G):** Animation is the easiest place to fake polish — most proposals are decoration.
- **Final decision (A + one rule, deciding): Keep the 4 keyframes; no new animation library; add only CSS press feedback (active:scale, no keyframe) and a linear rest-timer progress transition.** Set completion reuses scaleIn (200ms) with state updated immediately, animation after. No animated counting (misrepresents data). No continuous/idle animation. Reduced-motion coverage extended globally (all keyframes + transitions off). Full spec in `animation-spec.md`.
- **Trade-off:** Less "delight" than a motion-rich proposal — accepted: speed and honesty beat decoration in a workout tool.
- **Verification:** Motion audit (every animation has trigger/purpose/duration in the spec); reduced-motion pass (all motion off, feedback retained via state change).

### 15. Which proposed features should be simplified instead of removed?
- **Proposals:** (A) Simplify: challenges, quotes, gamification, policy ledger, macro tab, standards (B) Remove low-value items from the interface (C) Keep everything as-is.
- **Needs:** Brief: "do not confuse redesigning with deleting"; G: "what contributes least?"
- **Evidence:** Challenges (opt-in, dismissible), quote (always last), XP/level, policy ledger (auditable prescription), macro tab (layout untraced).
- **Strongest objection (D):** The policy ledger is coach transparency — simplifying it into a tooltip would hide reasoning the user is entitled to see.
- **Final decision (A with one protection, deciding): Simplify by placement, not removal:** challenges → opt-in section below the fold (already opt-in; keep dismissible); quote → moves into the Coach section footer or off in Simple mode (never a standalone section); XP/level → compact row inside Profile/You, not a Today block; policy ledger → stays fully accessible from the coach decision card (expandable detail, same content); macro tab → kept, with its layout verified in implementation (currently Hypothesis). NOTHING is removed from the product; interface-removal candidates (none approved) would need the user's explicit approval — see the IA doc's removal-candidate list (empty except flagged items: `public/ui-mockups.html` serving, MASTER.md supersede — neither is a product capability).
- **Trade-off:** More expanders in coach/progress areas — bounded by the topic-5 rule (primary actions never behind expanders).
- **Verification:** Capability inventory check (every baseline capability reachable after redesign); removal-candidate list reviewed by the user.

### 16. Which current elements are visible only because the implementation makes them easy to display?
- **Proposals:** (A) Audit each section for user need (B) Assume all displayed data is wanted (C) Remove implementation-easy elements.
- **Needs:** G's core challenge; P11's noise complaint.
- **Evidence:** Today renders everything the store holds (readiness, level, athlete facts, review, steps-if-synced, challenge, quote) because each is one section render away. Steps appears only with synced data (conditional layout shift). The quote is last because it was appended last.
- **Strongest objection (D):** Some "easy" elements are genuinely useful (readiness, weekly review) — ease of implementation is not evidence of uselessness.
- **Final decision (A, deciding): The IA doc classifies every Today section by user need, not render cost.** Outcome: workout card + nutrition strip stay (need); readiness/level/athlete/review become one Coach section (need, consolidated); habit matrix stays (need); steps stays but only as a stable slot (no layout shift — reserve space or place it in the supporting grid); challenge stays opt-in below the fold; quote leaves the section stack (Coach footer or off in Simple). No element is kept "because it's easy" — each has a named need or it moves.
- **Trade-off:** Steps as a stable slot costs vertical space when empty — accepted to kill layout shift.
- **Verification:** Section-need table in the IA doc (every section has a need or moves); layout-shift check (steps appearing must not move other sections).

## Round 3 — Decision review (moderator challenges)

The moderator (H) challenged every Round 2 decision against the baseline code and inventory. Decisions that would have failed are listed with their fix; decisions that survived are confirmed.

| Decision | Challenge | Outcome |
|---|---|---|
| 5th "You" tab | Does it break deep links or tab persistence? | Survives: `TabId` already has `profile`/`settings`; `?tab=` mapping unchanged; avatar behavior unchanged. Implementation must keep `lastActiveTab` semantics. |
| Action-first Today fold | Does hiding coach content below the fold hide functionality without replacement? | Survives with guardrail: Coach section remains one tap away in both modes; Detailed mode restores more above the fold; no capability removed. |
| Plan card → perform directly | Does bypassing the logger break draft recovery or plan pre-fill? | Survives: logger remains for building; pre-fill still feeds the perform surface; draft contract untouched. Implementation must task-test both entries. |
| Set options expander | Does collapsing RPE/types hide required inputs? | Survives: topic-5 rule — primary action (weight/reps/complete) never behind an expander; Set options holds secondary inputs only; Detailed defaults it open. |
| Density-keyed visibility | Does Simple hide critical controls? | Survives with the primary-action audit as a gate: any screen failing "main action with zero expander opens" fails verification. |
| Goal-aware spotlight | Does it lock users into a goal view? | Survives with manual pin override + all charts one tap away. Goal is a default, not a lock. |
| Fuel stays a tab | Is three-doors-to-one-room wasteful? | Survives: fast path and full path share one form; labels identical. The duplication is deliberate and labeled as such. |
| You unification (Profile \| Settings) | Does it change sign-out/delete semantics? | Survives ONLY with the auth-flow diff constraint: methods shown consistently, semantics untouched. Any semantic change fails review. |
| Migration rule (existing → Detailed) | Does it strand new users in Simple while existing users keep density? | Survives: it preserves existing users' experience; new users get the designed default. Documented as a deliberate asymmetry, not an oversight. |
| Three personalization controls | Is dashboard ordering without drag a cop-out? | Survives: up/down buttons meet the need (reorder + restore) without a new dependency. Drag would add bundle + a11y cost for no task benefit. |
| Custom accent with auto-correction | Does auto-correction violate user choice? | Survives with preview + note before applying: the user sees the corrected shade and can pick another. Never silently accept a failing combination for text. |
| Keep all 9 onboarding steps | Is 9 screens defensible? | Survives: each step feeds a real engine input (goal/level/schedule/injuries/diet); friction is fixed inside steps (guest label, summary, equal Skip), not by cutting data. |
| Layout-new vs style-only split | Does restyling the active workout dodge its density problem? | Survives: active workout's hierarchy is sound; its problems are visibility/placement/targets — styling + component work, not layout. The distinction is documented per screen. |
| 4 keyframes only | Is motion too restrained to feel premium? | Survives: premium here means responsive + honest, not decorated. Press feedback + timer progress + existing keyframes cover every purposeful case in the spec. |
| Simplify-don't-remove | Does moving the quote/gamification hide value? | Survives: quote stays reachable (Coach footer / Detailed); XP/level move to You (still visible); ledger stays fully accessible. Nothing leaves the product. |
| Section-need audit | Is "steps as a stable slot" wasteful? | Survives: the space cost is accepted to eliminate layout shift, a real interaction defect. |

### Dissent retained (not resolved by vote)

1. **Expert G dissents on the 5th tab.** Position: header entries + avatar already reach Profile/Settings; a permanent tab slot for meta-content is wasteful, and the "You" tab will accumulate junk over time. Response recorded, not adopted: discoverability evidence (P11 task 11.3, Top Problem #2) outweighs the slot cost, and the tab's scope is fenced (Profile | Settings only, no new destinations inside it without a new IA decision).
2. **Expert B dissents on Barlow Condensed for display headings (Phase 4).** Position: condensed faces hurt readability and Devanagari fallback will render mixed-script headings inconsistently; Inter-only with tight tracking is safer. Response: adopted with a constraint — Barlow Condensed only at ≥28px display sizes with the documented fallback stack, verified live in implementation; if the live check shows mixed-script inconsistency, the fallback is Inter-only (decision reversible without layout change).
3. **Expert F dissents on the desktop left rail.** Position: the rail + content grid rework touches code-split boundaries and modal widths (520px cap) that exist for the 2GB-phone budget; desktop users are a minority for this product. Response: adopted with a constraint — the rail is CSS/layout only (no route or split changes); modals keep their 520px cap; the rail collapses below 1024px. If implementation shows split regressions, desktop falls back to the centered column (reversible).
4. **Expert C dissents on up/down ordering (vs drag).** Position: up/down is tedious for moving a card several slots. Response: accepted as a known limitation — reordering is expected to be rare (set once), and drag's bundle + keyboard + screen-reader cost is disproportionate. Revisit only if live testing shows repeated reordering.
5. **Expert D dissents on the goal-aware spotlight default.** Position: a strength user on a fat-loss phase (or vice versa) gets the wrong spotlight until they discover the pin. Response: the pin is surfaced on the spotlight itself ("Pin a different chart"), not buried in Settings — discoverability is part of the control, not an afterthought.
6. **Expert A dissents on the existing→Detailed migration rule.** Position: two defaults fracture the product's first impression (screenshots/docs will show Simple; existing users see Detailed). Response: accepted as a real cost — mitigated by documenting both modes in the design system and by making the density toggle prominent in Appearance & Personalization. The alternative (forcing Simple on existing users) was judged worse: it hides sections they rely on without consent.

### Decisions needing the user's explicit approval (not decided here)

1. **Removing `public/ui-mockups.html` from serving** (D5) — not a product capability, but a public URL change. Flagged, not done.
2. **Marking `design-system/ascend/MASTER.md` superseded** (D4) — documentation only, but it changes the repo's stated source of truth. Done in this program as a header note (small, reversible), flagged here for awareness.
3. **Behavior fixes that are NOT part of the redesign** (require separate approval + scope): D1 BodyMetrics date plumbing, D6 SW cache strategy (versioned name + update prompt). The redesign must not ship the lying date control in a prettier modal — if the fix is not approved, the control's presentation must at minimum stop implying backdating works (copy change, still needs approval as a behavior-adjacent edit).
4. **Supabase custom domain ($25/mo Pro)** — the only full fix for the OAuth URL hop. Not a redesign item; stays the user's decision.
5. **Any product-capability removal** — none proposed in this program. If implementation finds one is needed, it returns here for approval first.
