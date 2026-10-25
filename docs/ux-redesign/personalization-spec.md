# ASCEND UX Redesign — Personalization Spec (Phase 4)

> **Status:** Decision document. No app code changes in this phase. Implements the
> decisions from `design-team-debate.md` (topics 9, 10, 11) and
> `information-architecture.md` (§4 preferences flow, §5 Today architecture) on top of
> the token mechanism in `design-system.md` (§3.3, §6).
> **Scope rule:** exactly THREE personalization controls live in Appearance &
> Personalization — (1) accent theme, (2) density, (3) dashboard cards. Existing
> toggles (gamification, coach, habit matrix, muscle volume, weekly target,
> schedule) stay where they are (Training Preferences / Customization) and are NOT
> folded into personalization. No drag editor. No capability is removed by any
> control in this spec.

## 1. Accent themes

### 1.1 Mechanism (unchanged architecture, new values)

The existing `--accent` / `--accent-dim` / `--accent-glow` CSS variables plus the
Tailwind `accent.*` aliases are the mechanism. A theme sets six values, in BOTH
light and dark variants (dark variants brightened, following the vermilion
precedent):

| Variable | Rule |
|---|---|
| `--accent` (hex + RGB triplet) | The accent color itself. Used for primary actions, selection, brand moments only. |
| `--accent-dim` | Darker variant for hover/pressed states and borders on accent surfaces. |
| `--accent-text` | Accent used as TEXT on the page background. MUST meet ≥4.5:1 against the page background in its mode. |
| `--accent-on` | Text ON an accent-filled surface. MUST meet ≥4.5:1 for labels; ≥3:1 is acceptable ONLY for large text and UI-only (non-text) use, and that use must be labeled as such in the audit. |
| `--accent-subtle` | Tinted background for selected/hover states (low alpha, never a text carrier). |
| `--accent-glow` | Shadow/glow tint for accent surfaces. Decorative only. |

**Fixed, never accent-derived:** semantic colors (success, warning, danger, info —
see `design-system.md` §3.2), page backgrounds, body text, borders, macro colors.
An accent change touches accent tokens ONLY. If a future change needs a semantic
color to move, that is a separate decision, not a side effect of theming.

### 1.2 Preset table (proposed values — audit is the gate, not this table)

Vermilion is the default and the only preset whose ratios are code-verified today
(accent text 4.66:1 light). The five additional presets below are PROPOSED hex
values chosen to be plausible against the chalk/graphite backgrounds. **No
contrast ratio is claimed for them.** Each preset ships ONLY after the
implementation contrast audit (see §1.5) passes every row for that preset in
both modes; a failing value is corrected before shipping, never shipped with a
known failure.

| Preset | Mode | Accent | Dim | Text | On | Subtle | Glow |
|---|---|---|---|---|---|---|---|
| **ASCEND Vermilion** (default) | Light | `#E44427` | `#C7351B` | `#C7351B` (4.66:1 verified) | `#FFFFFF` | `#FDF1EE` | `rgba(228,68,39,0.16)` |
| | Dark | `#EB4E30` | `#C7351B` | `#FF7D66` | `#FFFFFF` | `rgba(228,68,39,0.15)` | `rgba(235,78,48,0.28)` |
| Cobalt | Light | `#2563EB` | `#1D4ED8` | `#1D4ED8` | `#FFFFFF` | `#EFF4FF` | `rgba(37,99,235,0.16)` |
| | Dark | `#3B82F6` | `#2563EB` | `#93C5FD` | `#FFFFFF` | `rgba(59,130,246,0.15)` | `rgba(59,130,246,0.28)` |
| Forest | Light | `#15803D` | `#166534` | `#166534` | `#FFFFFF` | `#F0FDF4` | `rgba(21,128,61,0.16)` |
| | Dark | `#4ADE80` | `#22C55E` | `#86EFAC` | `#052E16` | `rgba(74,222,128,0.15)` | `rgba(74,222,128,0.28)` |
| Plum | Light | `#9333EA` | `#7E22CE` | `#7E22CE` | `#FFFFFF` | `#FAF5FF` | `rgba(147,51,234,0.16)` |
| | Dark | `#C084FC` | `#A855F7` | `#D8B4FE` | `#2E1065` | `rgba(192,132,252,0.15)` | `rgba(192,132,252,0.28)` |
| Teal | Light | `#0F766E` | `#115E59` | `#115E59` | `#FFFFFF` | `#F0FDFA` | `rgba(15,118,110,0.16)` |
| | Dark | `#2DD4BF` | `#14B8A6` | `#5EEAD4` | `#042F2E` | `rgba(45,212,191,0.15)` | `rgba(45,212,191,0.28)` |
| Rose | Light | `#E11D48` | `#BE123C` | `#BE123C` | `#FFFFFF` | `#FFF1F2` | `rgba(225,29,72,0.16)` |
| | Dark | `#FB7185` | `#F43F5E` | `#FDA4AF` | `#4C0519` | `rgba(251,113,133,0.15)` | `rgba(251,113,133,0.28)` |

Notes on the table:
- Dark-mode `on` values follow the vermilion precedent: where the dark accent is
  light enough (Forest, Plum, Teal, Rose), `on` is a near-black shade for
  readable label text; where it stays saturated (Cobalt, Vermilion), `on` is
  white. The audit confirms each pairing; if a pairing fails, the `on` value
  (not the accent) is what changes first.
- `dim` for dark mode reuses the light-mode dim or a mid-tone; it is a
  hover/pressed value, not a text carrier, so it is exempt from the 4.5:1 rule
  but must remain visibly distinct from the accent.
- No preset may be added by implementation without a row in this table and a
  passing audit row. Preset count stays at six in this program.

### 1.3 Custom accent (hex input + live preview + auto-correction)

- **Input:** a hex field accepting `#RGB` and `#RRGGBB` (normalized to
  `#RRGGBB` on entry). Invalid input shows an inline error ("Enter a hex color,
  like #2563EB") and applies nothing. No color-picker wheel is specified — hex
  input plus the six presets is the control surface; a picker may be added later
  only if it reuses this same correction pipeline.
- **Preview (before commit):** typing a valid hex renders a preview panel in the
  CURRENT appearance mode showing: a primary button, a secondary button, a
  selected chip, an accent-text sample line, and a focus ring. The preview does
  NOT restyle the whole app until Apply — a half-applied theme the user then
  abandons must not leave the app in a mixed state.
- **Auto-correction (the safety rule):** the entered hex is the *requested*
  accent. The *applied* theme is derived, never the raw hex alone:
  1. `accent` = requested hex (light mode). Dark-mode accent = the same hue
     brightened until it reads clearly on the dark background (lightness raised;
     same correction pass as presets).
  2. `accent-text` = the requested hex darkened (light mode) / lightened (dark
     mode) in lightness steps until it meets ≥4.5:1 against the page background
     (`#F3F0E7` light / `#121411` dark). The stepping is deterministic and
     bounded (stop at the nearest passing shade; never overshoot into a
     different hue).
  3. `accent-on` = white or near-black (`#171916`), whichever meets ≥4.5:1
     against the accent; one of the two always passes for label text. (If a
     future surface needs large/UI-only text at ≥3:1, that surface is named in
     the audit, not assumed.)
  4. `accent-dim` = accent darkened one step; `accent-subtle` / `accent-glow` =
     accent at low alpha.
- **Corrected-shade note (never silent):** if any derived value differs from the
  naive derivation (most visibly: the text shade differs from the entered hex),
  the preview panel shows a note BEFORE Apply: "Adjusted for readability — text
  uses [derived shade], not [entered hex]." The user applies the corrected
  theme knowingly or picks another hex. A failing combination is NEVER silently
  accepted for text use.
- **Apply / Cancel:** Apply commits the custom theme (persisted per §5) and
  restyles the app; Cancel discards the preview and returns to the previous
  theme. Leaving the picker without applying discards the preview (no partial
  state).

### 1.4 ThemePicker component contract

`ThemePicker` (see `design-system.md` §6) renders: a swatch grid (six presets,
selected indicator = accent ring + check, each swatch labeled with its name for
screen readers — never color alone); the custom hex input + preview panel +
corrected-shade note; a Reset button (§1.6). Props carry preset definitions,
selection, custom hex, and callbacks only — no contrast math, no store writes,
no persistence logic inside the component. Contrast data arrives as
audit-supplied note strings per preset (see §1.5); the component renders them,
it does not compute them.

### 1.5 Contrast audit (implementation stage gate — required, not optional)

Before any preset or the custom pipeline ships, implementation runs a contrast
audit producing one row per preset × mode × use: accent (UI-only), accent-text
(≥4.5:1 vs page background), accent-on (≥4.5:1 for labels; ≥3:1 only where the
use is named large/UI-only), focus ring (visible against both backgrounds),
selected-state chip (accent-subtle background + accent-text label, ≥4.5:1),
chart series where the accent appears (accent must never be the sole carrier of
a series — see chart frame standard). The audit also covers five custom-accent
cases: a very light hex, a very dark hex, a mid-grey hex, a saturated yellow,
and the default vermilion (regression). Any failing row is corrected in the
preset table or the correction algorithm and re-audited. The audit output is
recorded in the implementation QA doc; this spec does not pre-claim its results.

### 1.6 Reset (scoped, one tap)

Reset-to-default restores ASCEND Vermilion and clears the custom hex. It touches
NOTHING else — not density, not dashboard layout, not appearance mode
(light/dark/system), not training preferences. After reset, a toast confirms
scope: "Theme reset to ASCEND Vermilion." A combined reset that also resets
density or layout is forbidden (it would silently undo unrelated choices).

### 1.7 What accent theming does NOT do

- It does not change appearance mode (light/dark/system is a separate, existing
  control; accent presets have light AND dark variants so the two controls
  compose).
- It does not recolor semantic states, charts' measured/estimated distinction,
  macro colors, or the success/warning/danger tokens.
- It does not add a theme to onboarding: new users get Vermilion; theming is
  discovered in You → Settings → Appearance & Personalization, not imposed
  during first run.

## 2. Dashboard cards (Today customization)

### 2.1 Section inventory and identity

Today is composed of named sections with stable ids. The Customize sheet and
the persisted layout use these ids, and the sheet's checkbox labels are EXACTLY
the section titles the user sees on Today (no separate admin names):

| Section id | Today title | Locked? |
|---|---|---|
| `workout-card` | Today's workout (card title varies: plan name / rest-day state) | YES — always shown, pinned first, not reorderable |
| `nutrition-strip` | Nutrition (calories + protein strip) | No |
| `coach` | Coach | No |
| `habit-matrix` | Habits (week Mon–Sun) | No |
| `quick-actions` | Quick actions | No |
| `hydration` | Hydration | No |
| `readiness` | Readiness | No |
| `level` | Level | No |
| `steps` | Steps | No |
| `challenge` | Monthly challenge | No |
| `weekly-review-detail` | Weekly review (detail) | No |

The quote is NOT a section (Coach footer only, or off in Simple — see §3.1). The
workout card's rest-day state is a state of the locked card, not a separate
section that can be hidden to dodge it.

### 2.2 Customize Today sheet

- **Reach:** from Today itself (a "Customize" action at the end of the Today
  sections, labeled "Customize Today") AND from You → Settings → Appearance &
  Personalization. Both open the SAME sheet; there is no second, divergent
  editor in Settings.
- **Controls:** one checkbox per section (checked = shown), up/down buttons per
  movable section to change order, the workout-card row locked (checkbox
  disabled with the label "Always shown"), and a "Restore layout" button.
- **No drag editor:** up/down buttons suffice. Rationale (debate dissent,
  retained): reordering is expected to be rare and set-once; drag adds bundle,
  keyboard, and screen-reader cost disproportionate to that frequency. Revisit
  only if live testing shows repeated reordering.
- **Immediate feedback:** toggling or moving a section updates Today live
  behind/after the sheet closes — no Apply step, no preview mode. The sheet
  closes to the new layout, not to a stale one.
- **Sensible hidden-card layout:** hidden sections are simply absent — no
  placeholder gaps, no "hidden section" stubs on Today. The workout card and
  header are always present, so Today can never be customized into an empty
  screen: even with every movable section hidden, the floor is header +
  workout card, and the Customize action remains reachable from the end of the
  sections and from Settings, so the user can always get back.
- **Restore layout (scoped):** restores the density-appropriate default (§2.3)
  for visibility AND order, touches nothing else (not theme, not density), and
  toasts its scope: "Today layout restored." Restoring layout does not reset
  the density mode that determined the default.

### 2.3 Good defaults (what a user sees before touching anything)

| | Simple (new accounts) | Detailed (existing accounts) |
|---|---|---|
| Order | workout-card, nutrition-strip, coach, habit-matrix, quick-actions, hydration | workout-card, nutrition-strip, coach, habit-matrix, quick-actions, hydration, readiness, level, steps, challenge, weekly-review-detail |
| Visibility | Supporting sections (readiness, level, steps, challenge, weekly-review-detail) hidden until the user turns them on | All sections shown |
| Steps slot | Shown only when synced step data exists (existing behavior preserved); the slot is stable when it appears — no layout shift for content below it | Same, stable slot |

An explicit user choice beats the default permanently: turning a supporting
section on in Simple keeps it on; switching density does NOT re-hide sections
the user explicitly showed, and does NOT re-show sections the user explicitly
hid. Density changes only the DEFAULT for sections the user has never touched
(implementation: visibility is stored per section as shown/hidden/unset; unset
resolves via the current density default).

### 2.4 CustomizeSheet component contract

`CustomizeSheet` (see `design-system.md` §6) renders the checkbox list, up/down
controls, locked workout-card row, and restore button. Props carry the section
list, current visibility/order, and callbacks only — no store writes, no
default computation inside the component. Section titles come from the same
strings Today renders (single source, so the sheet can never disagree with the
page).

### 2.5 Scope limit (stated, not silently omitted)

Dashboard customization covers Today ONLY in this program. Per-screen
customization for Train, Progress, or Fuel is a future consideration, flagged
here so it is not mistaken for an oversight: the decision is to ship one
well-understood customization surface before spreading the concept.

## 3. Simple vs Detailed modes

### 3.1 One `density` key, presentation only

`density` is a single key with two values: `simple` | `detailed`. It changes
presentation — which sections, inputs, and filters are shown or expanded — and
NEVER data, calculations, stored values, or available features. Every feature
reachable in Detailed is reachable in Simple (possibly via one more tap); every
number shown in Detailed is the same number in Simple when shown.

**Hard rule (applies in both modes, no exceptions):** anything required to
complete a screen's primary action is NEVER behind an expander, collapsed
section, or second screen. Expanders hold supporting context only. The
primary-action audit ("main action with zero expander opens") is a verification
gate for every screen in both modes.

**Workout mode follows density, with a persistent override:** the perform
surface uses Beginner mode in Simple and Advanced mode in Detailed BY DEFAULT.
The existing in-workout mode switch remains and persists as `workoutModeOverride`
(`beginner` | `advanced` | `null`); `null` means "follow density." Changing
density while an override is set does NOT change the workout mode (the user's
explicit choice wins); clearing the override re-follows density. This preserves
the existing Beginner/Advanced switch behavior while unifying the concept.

### 3.2 Per-surface definitions

**Today** (see also §2.3 and IA §5):

| Element | Simple | Detailed |
|---|---|---|
| Fold (header + workout card + nutrition strip) | Identical in both modes | Identical |
| Coach section | Today's note + weekly-review summary; athlete facts behind expander | Same + athlete top-2 visible + review detail link |
| Habit matrix | Today only, compact | Full week Mon–Sun |
| Quick actions, hydration | Same in both modes | Same |
| Supporting sections | Hidden by default (new users); user choices respected | Shown (readiness, level, steps stable slot, challenge opt-in, weekly-review detail) |
| Quote | Off | Coach section footer |
| Steps | Only when synced data exists | Only when synced data exists (stable slot in both modes) |

**Train:**

| Element | Simple | Detailed |
|---|---|---|
| Plans list / History list | Same structure; history rows compact (date, plan, duration) | Same + history rows show volume + top set |
| Start action | Plan card "Start" goes straight to the perform surface (no logger hop) in both modes | Same |
| Perform surface | Beginner: one set at a time; Set options (RPE/RIR, set type, crowded-gym) in one expander per exercise, collapsed by default; previous performance = "Last session · [date]" line | Advanced: full multi-set table; Set options open by default; previous performance = last-3-sessions expander |
| Rest timer | Docked, never covering controls, in both modes | Same |
| Completion | Summary first, then ONE optional "Coach's take" expansion (replaces the forced modal stack) in both modes | Same |

**Progress:**

| Element | Simple | Detailed |
|---|---|---|
| Spotlight chart | Goal-aware spotlight (see §4), default range, no filter controls visible | Same spotlight + FilterBar (lift + range + metric) + pin control surfaced on the spotlight |
| Other charts | One tap away (chart list) | Same, plus FilterBar per chart |
| PRs / Records | Key PRs (latest per lift group) | Full PR table + standards comparison |
| Body metrics | Latest entry + trend line | Full table + entry history |
| Empty states | Designed EmptyState + next action in both modes | Same |

**Fuel:**

| Element | Simple | Detailed |
|---|---|---|
| Today segment | Strip + quick-add + scan entry + today's meals; macro targets behind the existing detail tap | Same + macro breakdown visible |
| Meals segment | Meal list + search | Same + filters (date range, source: scan/manual/barcode/voice) |
| Macros segment | Daily totals + goal comparison | Same + per-meal macro table + weekly average |
| Scan review | Per-item exact/estimated chips + portion-memory transparency in both modes (honesty boundary is NOT density-dependent) | Same |
| Pinned foods | Shown | Shown + management (reorder/remove pinned) |

**You (Profile | Settings):** layout is IDENTICAL in both modes. Settings rows
must stay findable — hiding settings by density would violate the
discoverability directive that motivated this program. Density affects Today,
Train, Progress, and Fuel only. (This is a deliberate asymmetry: a settings
screen that hides settings is a contradiction.)

### 3.3 What Simple does NOT do

- It does not remove critical controls (see hard rule §3.1).
- It does not simplify calculations, round numbers differently, or hide
  warnings (injury exclusions, deload notices, pain stop, sync conflicts all
  show identically).
- It does not lock the user out of Detailed features: every Detailed element
  has a path from Simple (a tap, an expander, or the density toggle itself).
- It does not change onboarding content: onboarding is the same 9 steps in
  both cases (density default is applied AFTER onboarding, see §5.2).

### 3.4 What Detailed does NOT do

- It does not become a number wall: sections are grouped and labeled, charts
  follow the frame standard (title-as-question, labeled axes, legend, range),
  and advanced inputs are organized (Set options grouped per exercise, filters
  grouped per chart), not dumped.
- It does not show debug data, raw ids, or internal labels. "Detailed" means
  more of the user's own data, not more of the system's internals.

## 4. Goal-aware prioritization (without locking users in)

Progress opens on a **spotlight** chart chosen by the user's profile goal. The
goal is a DEFAULT, not a lock: all charts remain one tap away, and the spotlight
is pinnable.

| Profile goal | Default spotlight | Fallback if no data for it |
|---|---|---|
| Strength-focused | e1RM trend for the user's most-logged compound lift | Overall strength trend (best e1RM across lifts) |
| Powerlifting | e1RM trend (squat / bench / deadlift selector on the spotlight itself) | Overall strength trend |
| Bodybuilding | Weekly volume by muscle group | Weekly total volume |
| Fat-loss | Body-weight trend (measured entries only; estimated entries dashed + badged) | Consistency heatmap |
| General fitness | Consistency heatmap (week Mon–Sun) | Weekly workout count |
| Unknown / unset goal | Consistency heatmap | — |

Implementation maps these labels to the actual profile-goal enum values; if a
goal value has no row here, it falls back to the consistency heatmap and the gap
is flagged (never silently mapped to a wrong chart).

**Pin override:** the spotlight carries a "Pin a different chart" control (on
the spotlight itself, not buried in Settings). Pinning stores
`pinnedProgressChart`; the pinned chart becomes the spotlight until the user
clears the pin ("Reset spotlight" on the same control) or changes their profile
goal (goal change re-derives the default and clears the pin, with a toast
stating so — a stale pin after a goal change would be the wrong spotlight by
definition). Dissent retained (Expert D): a user mid-transition (e.g. strength
user in a fat-loss phase) gets the wrong spotlight until they discover the pin;
the surfaced pin control — not a hidden setting — is the mitigation.

## 5. Persistence rules

### 5.1 New `uiPreferences` keys

All personalization state lives in the existing Zustand `uiPreferences` object
(`src/lib/store.ts`), persisted via the existing zustand-persist setup
(localStorage-first) and merged with `DEFAULT_UI_PREFERENCES` on load. New keys:

| Key | Type | Default |
|---|---|---|
| `accentTheme` | `'vermilion' \| 'cobalt' \| 'forest' \| 'plum' \| 'teal' \| 'rose' \| 'custom'` | `'vermilion'` |
| `customAccentHex` | `string \| null` (normalized `#RRGGBB`) | `null` |
| `density` | `'simple' \| 'detailed'` | See §5.2 (migration rule) |
| `todayLayout` | `{ visible: Record<string, boolean \| 'unset'>; order: string[] }` — see §5.3 | Default order + all `unset` |
| `workoutModeOverride` | `'beginner' \| 'advanced' \| null` | `null` |
| `pinnedProgressChart` | `string \| null` (chart id) | `null` |

No new storage mechanism, no new table, no new sync endpoint is introduced by
this spec. Appearance mode (light/dark/system) and `hasCustomTheme` keep their
existing separate handling (`setTheme(theme, isCustom)` two-arg form preserved;
a user accent pick is NOT a theme-mode pick and must not set `hasCustomTheme`).

### 5.2 New vs existing users (the migration rule — deliberate asymmetry)

- **New accounts** (fresh store, no prior persisted blob): `density` defaults
  to `'simple'`.
- **Existing accounts** (a persisted blob predating the redesign):
  `density` defaults to `'detailed'`, preserving the experience they already
  have. Forcing Simple on existing users was judged worse: it would hide
  sections they rely on without their consent.
- **Mechanism:** bump the zustand-persist version and implement `migrate()`:
  blobs migrating from the pre-redesign version get `density: 'detailed'` (plus
  the other new keys at their defaults); fresh stores start at the new version
  with `DEFAULT_UI_PREFERENCES.density = 'simple'`. The migration runs once and
  is idempotent. Dissent retained (Expert A): two defaults fracture first
  impressions (screenshots/docs show Simple; existing users see Detailed) —
  mitigated by documenting both modes and making the density toggle prominent
  in Appearance & Personalization.
- **No stored density key + no migration path** (e.g. a hand-edited blob):
  treat as `'detailed'` if the store already holds user data (profile,
  workouts, or meals non-empty), else `'simple'`. Never crash on this case.

### 5.3 Today layout storage semantics

- `order` holds movable section ids in user order; the workout card is never in
  `order` (pinned first by construction).
- `visible` holds per-section `'unset'` (never touched → density default per
  §2.3), `true` (explicitly shown), or `false` (explicitly hidden). Density
  switches never overwrite `true`/`false` values.
- Unknown section ids in a stored layout (e.g. from a future version) are
  dropped on read; known sections missing from a stored layout are appended in
  default order. The layout can therefore never reference a section that does
  not exist, and never lose a section that does.

### 5.4 Invalid preferences (never crash, never blank-screen)

The existing merge (`{ ...DEFAULT_UI_PREFERENCES, ...stored }`) handles unknown
KEYS but not invalid VALUES, so implementation adds value validation on read:
- `accentTheme` outside the preset list (and not `'custom'` with a valid
  `customAccentHex`) → `'vermilion'`, custom hex cleared.
- `customAccentHex` not matching `#RRGGBB` → `null` (and `accentTheme`
  `'custom'` falls back to `'vermilion'`).
- `density` outside `'simple' | 'detailed'` → the §5.2 default for that account.
- `todayLayout` malformed (not an object, order not an array) → default layout.
- `workoutModeOverride` outside `'beginner' | 'advanced' | null` → `null`.
- `pinnedProgressChart` naming a chart id that does not exist → `null`
  (spotlight re-derives from goal).
Validation is silent (no error UI for a corrupt pref blob — the app just shows
defaults); the corrected values are written back on the next persist so the
blob heals itself.

### 5.5 Sign-out, account switch, offline, reset

- **Offline:** all personalization works fully offline. Theme, density, and
  layout are localStorage state; no network call is made to read or apply them.
- **Sign-out (keep data):** personalization prefs REMAIN on the device and
  apply to the resulting guest session. They are device prefs, not account data.
- **Sign-out (clear data):** prefs reset to fresh defaults along with the rest
  of the cleared state (same semantics as the existing clear path — the
  redesign adds no exception).
- **Account switch (sign out + sign in):** prefs STAY as device prefs; they are
  NOT swapped per account and NOT overwritten by the incoming account's
  stored prefs. Rationale: silently making local prefs account-wide would
  change behavior for existing users without consent, and per-account prefs
  would be a separate product decision (flagged, not assumed).
- **Sync (OPEN — audit required, copy must not promise it):** the baseline
  records that theme + `uiPreferences` travel in the sync payload, but
  per-field coverage for the NEW keys was NOT verified in decision phases.
  Implementation MUST audit the sync serializer field by field. Until that
  audit passes for a key, implementation MUST EXCLUDE the new keys from the
  sync serializer (local-only), and UI copy must NOT promise cross-device sync
  for theme, density, or layout. LocalStorage persistence is guaranteed;
  cross-device sync is expected-but-unverified. If the audit finds existing
  `uiPreferences` fields already syncing, those keep syncing unchanged — the
  exclusion applies to the six NEW keys only, pending verification.
- **Resets are scoped, always:** theme reset (§1.6), layout restore (§2.2),
  and density reset (a "Reset density to default" control that restores the
  §5.2 default for the account and clears `workoutModeOverride` to `null`)
  are three separate one-tap actions, each toasting its own scope. There is no
  "reset all personalization" button: a combined reset that also resets theme
  or layout would be a nasty surprise.

### 5.6 Internationalization

All new strings (preset names, picker labels, corrected-shade note, sheet
labels, restore toasts, spotlight pin labels, density descriptions) get `en`
+ `hi` keys following the existing dictionary pattern (`src/lib/i18n/`), with
the same missing-key fallback behavior as the rest of the app. Preset names are
proper nouns with short descriptors (e.g. "Cobalt — deep blue"), not color
swatches alone. No hardcoded English strings in the new components.

## 6. Acceptance tests (personalization)

1. Picking each preset restyles primary actions, selection, and brand moments
   app-wide in BOTH light and dark modes, and changes nothing else (spot-check:
   page background, body text, borders, success/warning/danger, macro colors
   identical before/after).
2. Entering a hex that would fail as text (e.g. a pale yellow) shows the
   corrected-shade note in the preview BEFORE Apply; after Apply, all accent
   text meets ≥4.5:1 (audit tool, both modes).
3. Reset restores Vermilion and clears the custom hex; density and layout are
   untouched (assert stored values before/after).
4. Customize sheet: hiding every movable section leaves header + workout card
   + Customize action reachable; restoring layout returns the density default.
5. Simple mode: every screen's primary action completes with zero expander
   opens (primary-action audit per screen, both modes).
6. Density switch preserves explicit section choices (show/hide a section,
   switch density, switch back — choice intact) and preserves an explicit
   workout-mode override.
7. Existing-account migration: a pre-redesign blob loads as Detailed with all
   new keys defaulted; a fresh account loads as Simple. (Simulated with
   fixture blobs — labeled simulated, not a user study.)
8. Invalid pref blob (bad enum values, malformed layout, unknown section ids)
   loads to defaults with no crash and no blank screen; the blob heals on next
   persist.
9. Sign-out (keep) preserves prefs into the guest session; sign-out (clear)
   resets them; account switch does not swap them.
10. Sync audit doc exists and names, per new key, synced vs local-only; UI copy
    contains no cross-device promise for any key the audit marks local-only.
11. Spotlight: each goal maps to its §4 chart; pin overrides it; goal change
    clears the pin with a toast; unknown goal falls back to the consistency
    heatmap (flagged, not silently mapped).
12. Contrast audit rows exist for all six presets × both modes × every use in
    §1.5, plus the five custom-accent cases; zero failing rows ship.
