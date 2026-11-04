# Screen-by-Screen UI Audit — ASCEND Final Certification, Round 1b

- **Build audited:** master `62e25543` (Form Coach stack merged). Production
  build gate: `https://ascendtonext.vercel.app/sw.js` read at audit time —
  `CACHE_NAME = ascend-62e2554-cache`. **Gate passed.**
- **System of reference:** `design-system-specification.md` (Round 1a) is the
  canonical system; `design-consistency-audit.md` findings are cited below as
  **1a F-01…F-11**. Train incorporates the verified re-audit of 2026-11-03
  (`ASCEND_TRAIN_AUDIT/reaudit-2026-11-03.md`) and the merged declutter state
  (PRs #90–#92); only what is new since is audited fresh there.
- **Method and limits (read before trusting any line):**
  - The production host was unreachable from this sandbox's headless Chromium
    (proxy tunnel failure), so the interactive pass ran against a **local
    production build of the exact audited commit** (`npm run build`,
    `next start`) in a scratch clone. A local build's own service-worker cache
    name is `ascend-dev-cache`; that is a local-build artifact, not a version
    difference — the source commit is identical to production. The build gate
    above and all four legal pages were read from production directly.
  - Viewport: desktop 1440×900. The app renders its centred ≤480 px column
    plus a desktop sidebar at this width. This is **not a phone**; one
    390×844 phone-width probe was run for the Form Coach modal (§3). No touch
    input, no real GPU (SwiftShader), no audio.
  - Fresh guest profile; onboarding completed with throwaway data (name
    "Audit"). View-and-navigate only: no sets completed, no workout finished,
    no analysis run, no forms submitted beyond guest onboarding. Screens that
    need those actions are marked **CODE-ONLY**.
  - Today sections are placed by CSS flex `order` (`HomePage.tsx:584`), so
    DOM text order ≠ visual order there; the Today inventory cites the
    **visual** (screenshot) order.
  - The headless browser's clock is UTC, so the "Good night" greeting in
    captures is an environment artifact, not a finding.
- **Coverage:** browser-verified — onboarding, Today (Simple + Detailed),
  Train Plans / plan detail / form-cues sheet / Training Tools, Form Coach
  modal (upload state, desktop + 390 px), active workout (view only), History
  (empty state), Progress, Fuel + meal-scan modal, Profile, Settings (incl.
  live theme switch), Coach tab (check-in + Ask), weekly review modal, weekly
  share-card modal, legal pages (text, from production). CODE-ONLY —
  workout completion/summary, populated History, Form Coach analysis/summary
  states, legal page layout.

---

## 1. Onboarding flow

**Inventory (observed, top to bottom).** Splash: "ASCEND / YOUR WORKOUT AND
FOOD LOG. / TAP TO CONTINUE". Welcome: English/हिंदी toggle, headline "Log the
work. Watch it add up.", buttons *Get Started* / *I already have an account* /
*Continue as Guest*, note "No account needed — your data stays on this
device." Step 1 of 2 (goal): five selectable cards — Build Muscle, Lose Fat,
Get Stronger, Improve Fitness / Stamina, General Fitness — plus *Continue* and
*Skip for now*. Step 2 of 2: name field (placeholder "e.g. Alex"), Gender
(Male/Female/Other), date-of-birth Day/Month/Year selects, injury selector
presented as tappable options including "No injuries" under the copy "Pick any
that apply — your plan will avoid movements that load them. Leave empty if
none.", *Continue* / *Back*. Plan offer: the generated week's workouts with
exercise lists, "Your daily food target: 2,296 kcal", and explicit default
disclaimers (figures assume 70 kg · 175 cm until changed, plus a diabetes
note). Setup summary: rows GOAL / LEVEL / TRAINING DAYS / DIET / INJURIES,
with DEFAULT chips on the values the user never chose, the line "Level,
training days and diet are starting defaults — change them any time in
Settings.", and *Start training* / *Edit in You → Settings*.

**Compliance.** Standard cards, chips, selects and `.btn-primary` throughout;
the estimation honesty (defaults labelled DEFAULT in both the offer and the
summary) is exemplary and matches the coach honesty bar. No new findings.

**Compliance line: FOLLOWS SYSTEM.**

## 2. Today / Home

**Inventory — Simple (visual order, screenshot-verified).** Greeting + name;
Light/Dark toggle chip and notification bell; "Local only" marker. Today's
Workout card ("Upper A", "51 min • 5 exercises", *Change Today's Workout*,
*Start Workout*, "Already trained? Quick log a past session"). Nutrition and
Protein as two side-by-side stat cards ("0 cal / 2,296", "0 g / 112 g"). Quick
actions: Meal Scan (camera icon), Scan (barcode icon), Weight, Form Check.
Hydration card ("0.0 / 2.5 L today", +250 / +500). Streak line ("Start your
streak with today's workout") above the Habit & workout matrix (Weekly/Monthly
toggle; rows WORKOUT / WATER / CREATINE / PROTEIN, row labels colour-coded).
Quote last ("The iron never lies to you." — Henry Rollins), then *Customize
Today*.

This is exactly the owner's mandated Simple order (workout, nutrition,
protein, quick actions, hydration, habits, quote last) and it matches the code
default (`SIMPLE_DEFAULT_ORDER`, `src/lib/today-layout.ts:54`) as resolved by
`resolveTodayLayout` (`HomePage.tsx:575`). **Detailed adds** (all observed):
a "Carbs 0g · Fat 0g" line under the nutrition cards; a Readiness card ("70
Ready" + Details); a Level card ("Level 0 · 0 XP · 100 to Level 1"); a Coach
section (see §9 finding UI-1b-02); a "Your weekly review" row; and the monthly
challenge card ("12 Workouts This Month", *Join challenge* / Dismiss in
Customize). The Simple/Detailed toggle itself was exercised in Settings and
takes effect immediately.

**Finding UI-1b-06 (P3).** Visual order and DOM order diverge on Today:
sections are positioned with flex `order` (`HomePage.tsx:584` `orderOf`), so
assistive technology and keyboard traversal follow the DOM sequence (where the
quote precedes Quick actions) while sighted users see the quote last. Both
orders are individually sensible; the divergence is the defect class
(WCAG 1.3.2 / 2.4.3 territory), recorded here because the two orders were both
directly observed.

**Compliance line: FOLLOWS SYSTEM** (with UI-1b-06 noted).

## 3. Train — Plans, plan detail, tools, and the Form Coach modal

Per scope, Plans/plan-detail are **not** re-audited: the browser pass confirms
the post-declutter state from the 2026-11-03 re-audit is what ships —
plan cards with name, est. duration range, per-exercise sets×reps @ load,
"Coach this plan" and *Start Workout*; CURRENT SPLIT card ("Upper / Lower
Split", "0 of 4 completed this week", *Adjust plan*); a "Your weekly review"
banner (§9). Plan detail: "WORKOUT DETAILS" eyebrow, duration/exercise count,
body-part tags, exercise rows as buttons opening the shared form-cues sheet
(large demo, Pause animation, numbered cues, *Close form cues*), "Gym packed?"
with its gloss, sticky *Start Workout*. Carried forward from the re-audit,
still true in this build: "%1RM" and "RPE" appear in plan/active views with no
in-place explanation.

**Training Tools sheet** (opened from Plans; `WorkoutPage.tsx:3457`):
ASCEND Form Coach ("Upload a squat video for pose analysis & repetition
counter"), Plate Calculator, Weekly Schedule & Split, Exercise Library, Log
Past Session, Build workout plan, and a "Workout view" Simple/Advanced toggle
— note this is a *second* density vocabulary (Simple/Advanced) alongside
Today's Simple/Detailed; observation only.

**Finding UI-1b-04 (P3, accessibility).** The Training Tools sheet's close
button (X icon, `WorkoutPage.tsx` sheet at :3457, button at ≈:3473) has **no
accessible name** — no text, `aria-label`, or `title`. A DOM probe of the whole
walk found exactly one unnamed button in the app, and it is this one. Its
target size is fine (44×44 px); only the name is missing. The comparable sheet
close elsewhere in the same file carries `aria-label={t('common.close')}`
(`WorkoutPage.tsx:296`), so this is an omission, not a pattern.

### Form Coach modal (new since the re-audit — audited fresh)

**Inventory (upload state, observed).** Header: video icon tile, "ASCEND Form
Coach", "On-device video movement & rep analysis", Close. Exercise card: "SQ"
monogram tile, "Barbell Back Squat", ACTIVE chip, "Currently the only
supported exercise — analysis is tuned for a barbell back squat filmed from
the side (depth, knee angles, rep cadence)". Dropzone: upload icon in a tile,
"Upload Workout Video", "Drag and drop your exercise video here, or browse
files", "Supports MP4, MOV, or WebM". Privacy card: "100% On-Device &
Private — Video frames are analyzed locally in your browser using
WebAssembly. Your video is never uploaded to any cloud server." Filming
Recommendation card (side-profile, hip height, full body in frame). "Lift
Safely" card: "Stop the set if you feel pain or discomfort. Form Coach gives
technique feedback from video measurements — it is not medical advice. If pain
persists, see a qualified professional." The analysis and summary states were
not re-run in this pass (they were verified end-to-end on the owner's own
squat video during the PR #93/#94 pass); the summary state is CODE-ONLY here.

**Finding UI-1b-01 (P2).** The modal does not participate in the design
system, in two independently verified ways:
1. **It loses its own surface at phone width.** The modal root uses
   `bg-surface-base sm:bg-surface-elevated`. `bg-surface-base` generates no
   CSS (1a F-02), so below the `sm:` breakpoint the root's computed background
   is `rgba(0,0,0,0)` — transparent. Verified by computed-style probe at
   390×844 and visible in the capture: the modal's inner cards have surfaces
   (they use working classes), but the modal card itself is see-through and
   its content floats on the scrim, held together only by a thin border. On
   desktop (≥640 px) the `sm:` variant applies and the surface renders.
2. **It ignores the accent theme entirely.** The elements styled with the
   nonexistent `*-accent-primary` classes (1a F-02: 26 + 15 uses) compute to
   inherited body colours under both the default vermilion and a switched
   cobalt accent: the "SQ" tile and dropzone icon tile render with
   `rgba(0,0,0,0)` backgrounds, "browse files" renders in the secondary text
   colour instead of the accent, and borders fall back to a default grey
   (`rgb(229,231,235)`). Its remaining tints (privacy card, ACTIVE chip) come
   from default-palette classes (1a F-03), which likewise do not follow the
   chosen accent. See the theme matrix (§13).

**Finding UI-1b-07 (P3).** The modal root is `rounded-3xl` (24 px) against the
system's modal radius `rounded-2xl` (16 px) used by every other observed
dialog — a small but visible signature of the same off-system construction.

**Compliance line: Train — FOLLOWS SYSTEM. Form Coach modal — OFF-SYSTEM**
(UI-1b-01, UI-1b-07).

## 4. Active workout

**Inventory (observed; started from Upper A, no sets completed).** Session
header with elapsed timer and *Finish*; exercise pager (Prev / "1 of 5 ▾" /
Next); *Form Cues* and *Warm-up* actions; "Gym packed?" with gloss; a
first-session tips card ("Quick gym tips", including pre-filled-weight and
auto-rest-timer explanations); "TODAY'S TARGET — 15 kg × 8 reps"; "LAST TIME —
First exposure" (honest cold-start label); set chips "SET 1 OF 3" with "− Set";
weight and reps steppers with quick-adjust chips; "RPE Effort (RPE) • Tap to
adjust"; *Skip* / *Complete Set*; "Next Exercise: Barbell Row". Tools menu
(observed): Pause & Save draft, Finish workout, Plate helper, Form Cues, Why
this target weight?, Warm-up sets, Change routine / split, Voice dictation,
Add exercise, Swap this exercise. The session renders as a full-screen overlay
above Train.

**Finding UI-1b-05 (P3, copy).** The tips card tells the user to "Tap the big
Done button after completing each set" (`src/lib/i18n/en.ts:907`,
`workout.tip2`), but the button is labelled **Complete Set**
(`ActiveWorkoutScreen.tsx:2973`). First-run guidance naming a control that
does not exist under that name.

**Compliance line: FOLLOWS SYSTEM** (one copy defect, UI-1b-05).

## 5. Workout summary / completion + History

**Summary/completion: CODE-ONLY** — the protocol for this pass forbade
completing a workout, so no claim is made about the rendered summary. (The
completion flow itself was exercised in earlier verified passes.)

**History (browser-verified, empty state).** Train → History shows "RECENT
WORKOUTS / Your journey starts here. Completed training sessions, logged sets,
and volume metrics will appear here." — plain text with **no call to action**.
Observation (not ranked): this is the only observed empty state that offers no
next action; compare the Fuel empty state ("WHAT YOU ATE TODAY (0)" with four
logging entries directly above) and the Progress PR rows ("No data yet — log
one to start the trend"). Populated History state is as recorded in the
2026-11-03 re-audit plus the declutter (session affordances reduced 2→1).

**Compliance line: PARTIAL** (empty state below the app's own empty-state
standard; populated state not re-verified this pass).

## 6. Progress

**Inventory (observed, fresh account).** Header actions: *Generate Weekly
Training Card* (share, §12) and *Analytics Tools*. Segments: Strength | Body |
Consistency. Habit Matrix (month grid, "0 days trained", "Streak: 0 days",
filter chips All Habits / Gym / Water / Creatine / Protein, per-day detail
card). "Pin a different chart" with options Auto (goal), Strength trend,
Volume by muscle, Weight trend, Training consistency, Big three. Personal
Records section with an honest explainer of estimated 1RM, *View All*, and
per-lift rows reading "No data yet — log one to start the trend".

**Compliance.** Reuses the same segmented control, chips and habit-matrix
component as Home/Train; empty states are honest and instructive. No new
findings beyond the global 1a patterns (F-03 palette-coded labels, F-04
sub-floor microtext in matrix cells).

**Compliance line: FOLLOWS SYSTEM.**

## 7. Nutrition / Meals (Fuel)

**Inventory (observed).** "NUTRITION & FUEL" eyebrow, MEALS title, *Options*.
Segments Meals | Macros. DAILY INTAKE card: *Edit Target*, "0 cal of 2296
daily target", day-type chips (Normal day / Fasting · no grain / One-meal
fast / Festival day). PROTEIN / CARBS / FAT rows against targets. DIET
PREFERENCE row. An estimates prompt card (activity chips; Weight 70; Height
175; *Save* / *Keep estimates for now*) — the onboarding estimation defaults
surfacing again for correction, consistent with §1's honesty pattern. Logging
entries: Scan Food ("Take a photo"), Scan Barcode ("Packaged products"), Scan
Meal, Add Manually; a natural-language input with *Log*; "Macro Lens • Voice /
Text • Indian IFCT" caption. WATER and CREATINE rows. "WHAT YOU ATE TODAY (0)"
empty state. **Scan modal (observed):** "Meal Scan / Photo → Macro Estimate /
Capture or Upload Your Meal / Take a photo of your plate — Indian meals,
rotis, and dals included. / Take Photo / Upload Gallery" with a standard
close — normal `.modal` chrome, unlike the Form Coach modal.

**Observation.** Two photo-scan entries ("Scan Food" and "Scan Meal") sit
alongside the distinct "Scan Barcode"; the photo modal was verified via the
Scan Food entry. On Home the equivalent pair is disambiguated by icons
(camera vs barcode, §2); in Fuel the duplication is textual only. Recorded as
an observation, not a ranked defect.

**Compliance line: FOLLOWS SYSTEM.**

## 8. Profile + Settings

**Inventory (observed).** You tab with Profile | Settings header tabs. Profile:
avatar initial, name "Audit", "Local Guest Athlete"; a rank line "INITIATE ·
LV 1" with a note that strength standards are table-based; HEIGHT 175 cm /
WEIGHT 70 kg / AGE 26 stat rows (the onboarding defaults, again labelled by
context); sections ACCOUNT & TRAINING and SHARING & SUPPORT; *Sign out &
account*. Settings is one scroll page with a section nav: Account & Security,
Appearance & personalization, Training preferences, Backup & legal, Sign out
& account, Help & FAQ (4 questions). Appearance contains: theme Chalk /
Graphite / System ("System Default"); Text Size Normal / Large / Extra Large;
the accent set (seven variants + Custom hex with Apply/Cancel + Reset to
Vermilion); Simple/Detailed density with an explainer; Customize Today.
Training preferences: weekly target (Auto/Off/2–6), schedule, units,
language EN/हिंदी, diet, level, toggles. Backup & legal: Export JSON/CSV,
Import, Privacy Policy, Terms of Service, Health & Safety Disclaimer, Delete
My Data (Web), Diagnostics.

**Compliance.** Settings rows, section headers and controls are the app's
standard components throughout; the custom-accent flow correctly gates on
Apply/Cancel. Theme switching was exercised live — see §13. No new findings.

**Compliance line: FOLLOWS SYSTEM.**

## 9. Coach tab (first trustworthy visual pass)

**Inventory (observed; Train → Coach).** Sub-segments: **Check-in** | **Ask
the coach**. Check-in, top to bottom: intro line ("Your coach designs today's
session from how you feel. Answer the check-in, start the session it
builds."); "YOUR COACH" card with *Turn off coach tips*, headline "Train in
blocks, like a coached athlete", block explainer, vermilion *Build my block*
button, and plan chips (Upper A selected). Check-in thread: "How are you
today?" with a "Same as usual — go" shortcut; a missed-session card (below);
the sleep question ("How did you sleep last night? (1 = terrible, 5 =
great)") with 1–5 chips; a note input ("Add a note for your coach
(optional)") and *Send*. A protein guidance card ("Protein today: 112–154 g"
with Indian-food examples: dal, paneer, soya, thali math). A week-status card
(below) with *Open full weekly review*. Footer honesty line: "It never
diagnoses pain — sharp pain always stops the session." **Ask the coach:**
"COACH CHAT" eyebrow, an evidence-based explainer, an honest empty state ("No
messages yet…"), message input + *Send*. **Weekly review modal** (opened from
Check-in and from the Plans banner): "Weekly review", range "2026-10-26 →
2026-11-01", "NEXT WEEK'S FOCUS — Protect your Monday session", a detail
paragraph, "PLANNED SESSIONS DONE 0 / 4" with "Missed: monday, tuesday,
thursday, friday" (day names render lowercase — minor copy detail), "TOTAL
TONNAGE 0.0t", and a proposals area.

The components are the app's standard cards, chips, segmented controls and
modal chrome — visually this tab is on-system. The defects here are in **what
the data presentation claims**, not in the chrome:

**Finding UI-1b-02 (P2, data presentation / cold start).** A brand-new
account is told a history it does not have, in three places, all observed on
an account created minutes earlier:
- Coach check-in: "Yesterday didn't happen — and that's fine / Upper A didn't
  get logged yesterday. You're building, not behind — do it today if you want
  it back." — for a user whose account did not exist yesterday.
- Weekly review modal: a full review of 2026-10-26 → 2026-11-01 (a week that
  ended before the account was created) stating "You completed 0 of 4 planned
  sessions" with four named missed days.
- Home (Detailed) athlete-model card: "You completed 0 of 32 planned sessions
  over the last 8 complete weeks… Mondays are the day most often missed."
Partial mitigation, recorded fairly: the athlete-model card labels that line
DEFAULT and sits it next to an explicit "Still learning you — trends need ~4
sessions on the same lift…" honesty statement. The check-in card and the
review modal carry no such qualifier, and the review presents its pre-account
week with the same authority as a real one. The missed-session logic is
schedule-based and does not account for account age.

**Finding UI-1b-03 (P3, copy/logic tension).** The weekly review contradicts
itself in a single view: the focus paragraph promises "…the revision below
can move it" (`src/lib/weekly-review.ts:409`, the missed-day template) while
the proposals area of the same 0/4 review states "No changes proposed — the
plan is working as it is." A week in which nothing was done is simultaneously
framed as needing a revision and as working as intended.

**Compliance line: PARTIAL** (chrome FOLLOWS SYSTEM; data presentation
UI-1b-02 / UI-1b-03).

## 10. Dialogs, sheets and toasts (cross-screen)

Dialogs actually opened this pass: Training Tools sheet, form-cues sheet,
Form Coach modal, meal-scan modal, weekly review modal, share-card modal,
active-workout tools menu, Customize Today (from Settings inventory). In
practice the chrome is uniform — title row, close top-right, `rounded-2xl`,
scrim — **except** the Form Coach modal (UI-1b-01 / UI-1b-07). That uniformity
is achieved despite three coexisting constructions in code (globals-based
`.modal-*`, `ui/Sheet`, hand-rolled `fixed inset-0`; 1a F-06), and one close
button lacks an accessible name (UI-1b-04). No toast behaviour was triggered
in this view-only pass; toasts are CODE-ONLY here.

**Compliance line: PARTIAL** (uniform in practice; construction debt and one
a11y omission underneath).

## 11. Share graphics — Weekly Training Card

**Observed (Progress → Generate Weekly Training Card).** Modal chrome is
standard: trophy icon tile, "Weekly Training Card", "WhatsApp & Instagram
Ready", close. The card itself is a canvas render (`WeeklyRecapModal.tsx`):
always-dark brand card — "ASCEND", "WEEKLY TRAINING RECAP", "NOV 2 – NOV 8",
the user's name ("AUDIT"), rank chip "DEVELOPING", a large total-volume
figure with "TOTAL VOLUME LIFTED · KG", three stat tiles (SESSIONS / SETS /
NEW PRS), "WEEKLY HIGHLIGHTS" with the line "Logged weeks are what progress
is made of.", footer "TRACKED WITH ASCEND / ascendtonext.vercel.app". Every
value was cross-checked against the app state for this zero-data account —
0 kg, 0 sessions, 0 sets, 0 PRs, correct name, correct week, KG units — and
all agree. The card's vermilion glow and graphite ground are the brand
colours; it renders dark in both app themes, which is correct behaviour for a
share image (its colours are canvas literals, cf. 1a F-08).

**Finding UI-1b-08 (P3).** The modal's *Share WhatsApp* button is filled with
a solid WhatsApp-brand green that exists nowhere in the token system; it is
the only non-token solid button colour observed in the app. Brand-motivated,
but off-system; *Save Image* beside it uses the standard neutral style.

**Compliance line: FOLLOWS BRAND; PARTIAL against the token system**
(UI-1b-08).

## 12. Legal pages (brief)

All four routes were read in full from production: /privacy (8 numbered
sections: storage & guest/cloud modes, AI provider chain incl. the free-tier
retention disclosure, hardware permissions, store data-safety declarations,
deletion, children's privacy, health notice, retention & rights), /terms (8
sections incl. assumption of risk and the same AI disclosures), /disclaimer
(not-medical-advice banner, emergency notice, PAR-Q, barbell safety protocol,
AI coach, hydration/creatine, nutrition, assumption of risk), /delete-account
(erasure policy, itemised destroyed-data list, in-app and external-form
methods). Content is consistent across the four (the free-tier and AI-log
retention disclosures agree verbatim in substance), and all four are driven
by the single source `src/lib/legal.ts` (LEGAL_VERSION 2.9). Layout/styling
of the legal pages was not screenshot-audited — CODE-ONLY for presentation,
verified for content.

**Compliance line: FOLLOWS SYSTEM** (content); presentation CODE-ONLY.

## 13. Theme matrix

One alternate theme was exercised end-to-end in the live app: **Graphite
(dark) + Cobalt accent**, switched in Settings → Appearance, then verified by
computed styles and captures on Home, Train and Coach surfaces. The `--accent`
token flipped from `228 68 39` (vermilion) to `59 130 246` (cobalt); primary
buttons on both Home and Train rendered `rgb(37,99,235)` — the accent's
dark-mode dim variant, applied consistently per the documented contrast rule
in the 1a specification — and segmented controls, selected chips and links
followed the same token. The density toggle (Simple → Detailed) was exercised
in the same pass and added exactly the sections inventoried in §2. The
remaining accent variants (seven presets + custom hex with Apply/Cancel and
Reset to Vermilion) were inventoried in Settings but only Cobalt was
exercised; claims for the others are CODE-ONLY. **The Form Coach does not
follow the theme at all**: under cobalt exactly as under vermilion, its
accent-styled elements compute to inherited text colours and transparent
backgrounds (UI-1b-01), because the classes it uses generate no CSS — theme
switching cannot reach it until 1a F-02 is fixed.

## 14. Ranked findings (this round only)

| # | Severity | Screen | Finding | Evidence |
|---|----------|--------|---------|----------|
| UI-1b-01 | P2 | Form Coach modal | Modal has no surface of its own below 640 px (transparent root) and ignores the accent theme entirely | Computed styles at 390×844 + desktop: root `rgba(0,0,0,0)`; tiles `rgba(0,0,0,0)`; "browse files" = secondary text colour under both accents; root classes `bg-surface-base sm:bg-surface-elevated`; 1a F-02 class counts |
| UI-1b-02 | P2 | Coach check-in · Weekly review · Home (Detailed) | Pre-account periods presented as the user's own missed history (missed yesterday; 0/4 in a week before signup; "0 of 32 over the last 8 complete weeks") | Observed verbatim on an account created minutes earlier; partial mitigation: DEFAULT label + "Still learning you" line on the athlete-model card only |
| UI-1b-03 | P3 | Weekly review modal | Same view promises "the revision below can move it" and states "No changes proposed — the plan is working as it is" for a 0/4 week | Observed verbatim; template at `src/lib/weekly-review.ts:409` |
| UI-1b-04 | P3 | Training Tools sheet (Train) | Close button has no accessible name (icon-only, no aria-label/title/text) | DOM probe: the single unnamed button in the walk; `WorkoutPage.tsx:3457` sheet, button ≈:3473; cf. labelled equivalent at `WorkoutPage.tsx:296` |
| UI-1b-05 | P3 | Active workout | First-run tip says "Tap the big Done button"; the button is labelled "Complete Set" | `src/lib/i18n/en.ts:907` vs `ActiveWorkoutScreen.tsx:2973`; both strings observed in the rendered UI |
| UI-1b-06 | P3 | Today | DOM order ≠ visual order (flex `order` placement): assistive traversal meets the quote before Quick actions; sighted users see it last | `HomePage.tsx:584` (`orderOf`), `:575`; DOM dumps vs screenshots |
| UI-1b-07 | P3 | Form Coach modal | Corner radius `rounded-3xl` vs the system's modal `rounded-2xl` | Root class list observed in DOM; spec §6 |
| UI-1b-08 | P3 | Share-card modal | "Share WhatsApp" button filled with off-token WhatsApp green | Observed in capture; component `WeeklyRecapModal.tsx` |

*Explicitly not claimed:* a missing space in the Fuel "0 kcal • 0g P" summary
was checked and **retracted** — the code renders `kcal • ` with spaces
(`MealsPage.tsx:3854`); the cramped string was an artifact of this pass's
text extraction. No unnamed buttons exist on Progress (probed). Today's
Simple order is **not** in violation — visually it matches the mandated order
exactly (§2).
