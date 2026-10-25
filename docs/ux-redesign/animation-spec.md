# ASCEND UX Redesign — Animation Spec (Phase 4)

> **Status:** Decision document. No app code changes in this phase. Implements the
> motion decision from `design-team-debate.md` (topic 14) on top of the existing
> Tailwind keyframes (`tailwind.config.js`: `fade-in`, `tab-enter`, `slide-up`,
> `scale-in`, all `ease-out`) and the existing global reduced-motion rule
> (`src/app/globals.css`: `prefers-reduced-motion: reduce` collapses every
> animation/transition to ~0ms).
> **Posture:** premium here means responsive + honest, not decorated. Motion
> explains a state change that already happened; it never delays one, never
> decorates an idle screen, and never runs during a set except the two
> workout-legal animations in §3. No new animation library. No animation may
> gate interaction.

## 1. Constraints (apply to every row in §3)

| Constraint | Rule |
|---|---|
| Feedback durations | ~120–220ms (press feedback, set-complete, toggles). |
| Transition durations | ~180–320ms (tab switches, sheets, expanders, toasts). Validate in context: a duration inside the range that feels sluggish on a low-end phone is shortened, not justified. |
| Easing | `ease-out` everywhere (matches the four existing keyframes). No bounce, no elastic, no custom curves — a new curve needs a reason, not a taste. |
| Properties | `transform` and `opacity` ONLY — except the single allowed layout animation (expander grid-rows, §3.6) and the rest-timer width/progress transition (§3.5), which is data, not decoration. Never animate width, height, margin, padding, or font-size. |
| Interruption | A new trigger cancels the running animation and starts the new state immediately. Animations never queue. Closing a sheet mid-open unmounts immediately — no reverse animation that delays interaction. |
| Blocking | No animation may delay a tap response, a navigation, or a save. State updates FIRST (store, UI text, counts), animation AFTER — the user must never wait for motion to learn what happened. If a transition is running, input still registers. |
| Counting | NO animated counting. Numbers (reps, weight, calories, XP, streaks) update instantly to their true value. A count-up would present intermediate values the user never had — a misrepresentation, not polish. |
| Continuous motion | NO continuous, idle, looping, or ambient animation anywhere: no pulsing badges, no shimmer skeletons, no rotating loaders over content, no drifting decoration. The one repeating element allowed is the rest-timer progress (§3.5), which is a countdown, not decoration, and it stops at zero. |
| Workouts | During an active set, only §3.4 (set-complete) and §3.5 (rest timer) may animate. Tab-enter, sheet, and toast animations do not fire inside the perform surface's set flow (the surface does not remount per set, so this is structural, not a special case). |
| Reduced motion | The existing global rule already collapses ALL animations/transitions to ~0ms under `prefers-reduced-motion: reduce` (universal selector, `!important`). This spec REQUIRES that rule to be preserved and extended to every new transition added in implementation — new CSS automatically falls under it; the forbidden thing is JS-driven animation (rAF loops, timers stepping styles), which the rule cannot collapse. Feedback under reduced motion is retained as instant state change: colors, checkmarks, numbers, and text update immediately; nothing is lost, only the motion is. There is NO in-app motion toggle — the OS setting is the control (nothing unnecessary). |

## 2. What already exists (kept verbatim, not re-specified)

From `tailwind.config.js` (verified values — implementation does not re-tune
these without a reason recorded in the QA doc):

| Utility | Keyframes | Duration / easing |
|---|---|---|
| `animate-fade-in` | `fadeIn`: opacity 0 → 1 | 0.25s ease-out |
| `animate-tab-enter` | `tabEnter`: opacity 0 + translateY(6px) scale(0.995) → identity | 0.22s ease-out |
| `animate-slide-up` | `slideUp`: opacity 0 + translateY(8px) → identity | 0.25s ease-out |
| `animate-scale-in` | `scaleIn`: opacity 0 + scale(0.96) → identity | 0.2s ease-out |

Existing usages preserved: modal overlay uses `animate-fade-in`, modal content
uses `animate-slide-up`, tab switches use `animate-tab-enter` (keyed by
`activeTab`). The segmented control already uses `active:scale-[0.97]` press
feedback; primary buttons use `active:scale-[0.98]`. These are the press
patterns §3.3 standardizes.

## 3. Per-animation specification

Each row: trigger → target → purpose → duration/easing → interruption →
reduced motion → performance note → acceptance test.

### 3.1 Tab switch — `animate-tab-enter` (existing, kept)

- **Trigger:** bottom-nav / rail destination change (including `?tab=` deep
  links and back-handler tab restores).
- **Target:** the incoming tab's content container (keyed by `activeTab`).
- **Purpose:** signal "you are somewhere new" without a flash of the old tab's
  layout. The 6px rise + 0.995 scale is deliberately subtle: the tab bar itself
  does not animate (it is persistent chrome).
- **Duration/easing:** 0.22s ease-out (existing value, inside the transition
  range).
- **Interruption:** tapping another tab mid-animation remounts with the new
  tab's enter animation; no queue, no waiting for the old one to finish.
- **Reduced motion:** collapses to instant (global rule); the tab content still
  swaps, only the rise is gone.
- **Performance:** transform + opacity only; the outgoing tab unmounts (no
  cross-fade of two full tabs — cheaper on low-end phones, and the existing
  code-split + TabSkeleton fallback already covers the loading beat).
- **Acceptance test:** rapid tab taps (5 taps in <2s) land on the last-tapped
  tab with no stuck half-animated state and no skeleton flash on already-loaded
  tabs.

### 3.2 Sheet / modal open — `animate-slide-up` + `animate-fade-in` (existing, kept)

- **Trigger:** any of the ~36 modals opening (Sheet wrapper, see
  `design-system.md` §6).
- **Target:** overlay fades (`animate-fade-in`, 0.25s), sheet content rises
  (`animate-slide-up`, 0.25s, 8px).
- **Purpose:** establish the sheet as a layer above the page and draw focus to
  it. The overlay fade is the backdrop; the rise is the sheet.
- **Duration/easing:** 0.25s ease-out, both.
- **Interruption:** closing mid-open unmounts immediately — there is NO exit
  animation that delays dismissal. Escape / back-handler / backdrop tap all
  dismiss instantly. (An exit fade would make every dismissal feel 250ms late;
  entry motion earns its time by orienting the user, exit motion does not.)
- **Reduced motion:** collapses to instant; focus management is unchanged
  (focus trap + initial focus still apply — motion off must never mean focus
  off).
- **Performance:** transform + opacity only; backdrop uses `backdrop-blur-sm`
  as today (kept — it is existing, not newly introduced; if implementation
  profiling shows blur cost on low-end phones, the fallback is a plain dim
  overlay, decided by measurement, not taste).
- **Acceptance test:** open + Escape within 100ms closes cleanly with focus
  returned to the opener; nested sheets (selector inside logger, detail inside
  history) open/close in stack order with no orphaned overlay.

### 3.3 Press feedback — `active:scale` (CSS only, no keyframe)

- **Trigger:** pointer down on any button, chip, stepper, segmented item, or
  list row that acts as a button.
- **Target:** the pressed element itself.
- **Purpose:** confirm "your tap registered" in the ~100ms before the action's
  result renders. This is the highest-value animation in the app: it is the
  difference between "did it tap?" and "tapped."
- **Duration/easing:** scale to 0.97–0.98 while pressed, spring back on release
  via the existing `transition-all duration-150` (150ms, inside the feedback
  range). No keyframe, no JS.
- **Values (standardized from existing usage):** buttons `active:scale-[0.98]`,
  segmented items `active:scale-[0.97]`, steppers/circle buttons
  `active:scale-95` (existing `.stepper-btn` / `.btn-circle` values kept).
  New interactive elements pick one of these three — no per-component freelancing.
- **Interruption:** releasing early cancels the press state instantly; a tap
  that navigates away needs no completion of the press animation.
- **Reduced motion:** the global rule collapses the 150ms transition; the
  pressed state still shows via background/border change (state feedback
  retained, motion removed).
- **Performance:** transform only, compositor-friendly, zero JS.
- **Acceptance test:** every new interactive element in implementation shows a
  visible pressed state on tap (checked by the component audit, not by feel);
  no button relies on color change alone for press feedback.

### 3.4 Set complete — `animate-scale-in` (existing, kept; state first)

- **Trigger:** completing a set in the perform surface (Beginner or Advanced).
- **Target:** the completed set row (and, in Beginner mode, the advancing set
  indicator).
- **Purpose:** mark the set as DONE — the row's completed state (checkmark,
  muted/struck presentation per the design system) is the information; the
  200ms scale-in is the emphasis.
- **Duration/easing:** 0.2s ease-out (existing value, inside the feedback
  range).
- **Ordering rule (hard):** the set's completed STATE updates immediately
  (store + row presentation + next-action availability); the animation runs
  after, on top of the already-true state. If the animation were to fail or be
  disabled, the set is still complete. Never the reverse.
- **Interruption:** completing the next set while the previous scale-in is
  running starts the new row's animation independently; rows do not share an
  animation queue.
- **Reduced motion:** collapses to instant; the completed checkmark + state
  change still show immediately.
- **Performance:** transform + opacity on one row only; never re-animates the
  whole exercise list (that would be a per-set full-list repaint for decoration).
- **Acceptance test:** complete 3 sets rapidly — all 3 rows show completed
  state with correct values, next action available after the first completion
  without waiting for any animation; with reduced motion on, identical states,
  zero motion.

### 3.5 Rest timer — linear progress (data transition, not decoration)

- **Trigger:** rest timer running between sets (floating/docked timer).
- **Target:** the timer's progress bar + numeric countdown.
- **Purpose:** show time remaining. The bar is a clock, not an effect.
- **Duration/easing:** LINEAR, ticking with the timer (existing progress bar
  uses a 500ms ease-out transition — implementation changes it to linear, since
  an eased bar misrepresents elapsed time: ease-out makes the bar appear to
  slow as it fills). The numeric countdown updates per second and is the
  authoritative display; the bar is secondary.
- **Interruption:** pausing, skipping, or finishing the rest stops the bar
  instantly at its true position; resuming continues from the true remaining
  time (never restarts the bar from zero).
- **Reduced motion:** the bar jumps per second (or holds static with the
  numeric countdown only) — the countdown text is the accessible truth in all
  modes; the bar must never be the only carrier of remaining time.
- **Performance:** width transition on one thin bar; no JS animation loop
  beyond the existing timer tick.
- **Acceptance test:** a 90s rest shows 45s remaining at the bar's midpoint
  (linear, not eased); pause/resume preserves remaining time exactly; with
  reduced motion, the numeric countdown is correct with the bar static.

### 3.6 Expander expand / collapse — grid-rows transition (the one layout animation)

- **Trigger:** opening/closing any expander: Set options, coach-section
  expanders, athlete top-2, FilterBar details, "More" sections, policy-ledger
  detail.
- **Target:** the expander's content region.
- **Purpose:** reveal supporting context without a page change or a layout
  jump that disorients scroll position.
- **Duration/easing:** ~200–250ms ease-out (inside the transition range).
- **Technique:** CSS `grid-template-rows: 0fr → 1fr` with overflow hidden —
  the standard accessible approach (content stays in the DOM, screen readers
  and focus order unaffected by the animation itself). No JS height measuring,
  no rAF loop. Content inside the expander does not animate its own height.
- **Interruption:** toggling mid-transition reverses from the current position;
  no queue. Content is interactive as soon as it is visible (focusable
  elements inside a collapsing region are removed from tab order only once
  fully collapsed — implementation verifies this, since a half-collapsed
  region with focusable children is a keyboard trap).
- **Reduced motion:** collapses to instant open/close (global rule covers the
  transition); the expander's expanded/collapsed state is still announced
  (aria-expanded, unchanged).
- **Performance:** one region at a time; expanding a long region (e.g. full
  policy ledger) animates the container only, not each child.
- **Acceptance test:** toggle each expander type twice rapidly — final state
  matches the last toggle, no stuck half-height region, no focusable element
  trapped in a collapsed region; primary-action audit still passes (no primary
  action lives inside an expander — see personalization-spec §3.1).

### 3.7 Toast in / out — fade + rise (existing provider, bounded)

- **Trigger:** toast shown (save confirmations, reset-scope confirmations,
  sync status, errors with retry).
- **Target:** the toast element.
- **Purpose:** confirm a completed action without stealing focus or blocking
  content.
- **Duration/easing:** in: fade + 6px rise, ~200ms ease-out (mirrors tab-enter
  at the small end of the transition range); out: fade only, ~150ms, or
  instant on manual dismiss. Auto-dismiss timer per the existing provider
  (kept); manual dismiss is always instant.
- **Interruption:** a new toast replaces (or stacks per existing provider
  behavior — kept, not redesigned here); dismissing one toast never dismisses
  another; toasts never queue behind an animation.
- **Reduced motion:** instant appear/disappear; the message + action (if any)
  are fully present.
- **Performance:** transform + opacity on one small element; toasts never
  animate content beneath them.
- **Acceptance test:** fire 3 toasts in succession — all messages readable, none
  stuck, manual dismiss instant; toasts never cover a primary action for
  longer than their display duration (existing placement kept).

### 3.8 Content reveal — `animate-fade-in` (existing, sparing use only)

- **Trigger:** first paint of a tab's content after its skeleton, and
  EmptyState appearance after an empty result resolves.
- **Target:** the revealed content block.
- **Purpose:** soften the skeleton → content swap so it does not flash.
- **Duration/easing:** 0.25s ease-out (existing value).
- **Restriction:** fade-in is for skeleton-to-content swaps ONLY. It is NOT a
  general "animate everything in on scroll" effect: no scroll-triggered
  reveals, no staggered list entrances, no per-card fade cascades. A list of
  20 history rows fading in one by one is decoration with a real cost (delayed
  readability + motion for no information).
- **Interruption:** navigating away mid-fade unmounts immediately.
- **Reduced motion:** collapses to instant; content appears, no flash issue
  since there is no motion to miss.
- **Performance:** opacity only.
- **Acceptance test:** tab loads show skeleton → content with no flash and no
  per-row stagger; scrolling a long list triggers no animation whatsoever.

### 3.9 Skeletons — static placeholders (explicitly NOT animated)

- **Trigger:** loading state for a tab, chart, or section (TabSkeleton and
  per-component skeletons).
- **Target:** placeholder blocks.
- **Purpose:** reserve layout space so content does not jump when it loads.
- **Duration/easing:** NONE. Skeletons are static muted blocks. A shimmer or
  pulse is continuous animation, forbidden by §1, and it would run during the
  exact moments (loading) when the user is waiting — the worst time for
  decoration.
- **Reduced motion:** moot (nothing moves); the rule is stated so a future
  "add shimmer" suggestion has a recorded rejection, not an open question.
- **Acceptance test:** no keyframe, transition, or JS loop targets a skeleton
  element (grep-able in implementation review).

## 4. Explicitly rejected (recorded so they are not re-proposed)

| Idea | Why rejected |
|---|---|
| New animation library (Framer Motion, etc.) | Bundle + complexity for four keyframes and CSS press feedback. The existing Tailwind keyframes + CSS cover every row in §3. Revisit only if a future interaction genuinely cannot be expressed in CSS. |
| Animated counting (calories, XP, reps counting up) | Presents false intermediate values; the number IS the information. |
| Scroll-triggered reveals / staggered entrances | Decoration that delays readability; hostile on long lists and during workouts. |
| Exit animations on sheets/modals | Every dismissal would feel 150–250ms late; entry motion orients, exit motion only delays. |
| Shimmer/pulse skeletons, pulsing badges, ambient motion | Continuous animation, forbidden; worst during loading/waiting. |
| Bounce/elastic easing | Inconsistent with the app's calm, confident posture; ease-out everywhere. |
| In-app motion toggle | Redundant with the OS setting (nothing unnecessary); the global reduced-motion rule IS the control. |
| Page-transition choreography (shared-element, slide-between-tabs) | Tab-enter's subtle rise is the whole transition language; anything grander fights the one-hand, mid-gym use case. |

## 5. Acceptance tests (motion, whole system)

1. Every animation in the shipped app appears as a row in §3 (or is removed).
   A grep for `animate-` / `transition` / `active:scale` outside the rows in
   §3 is a review failure.
2. Reduced-motion audit: with `prefers-reduced-motion: reduce` on, every row
   in §3 collapses to instant state change with zero lost information
   (numbers, checkmarks, focus, toasts all still correct).
3. Workout audit: during an active set, the only animations that can fire are
   §3.4 and §3.5; completing sets rapidly never queues or drops a completed
   state.
4. Interruption audit: rapid tab taps, rapid expander toggles, and
   open-then-Escape within 100ms all land in the correct final state with no
   stuck half-animated UI.
5. No-blocking audit: every primary action (start workout, complete set,
   finish, save meal, apply theme, toggle section) is responsive during any
   running animation — no input is swallowed by motion.
6. Low-end check (parent-run, never faked): tab-enter, sheet open, and
   set-complete feel instant on a 2GB-class phone; if any feels sluggish, its
   duration is shortened within its §1 range and the change recorded — the
   range is a ceiling, not a target.
