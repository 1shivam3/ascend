# Synthetic User Results — ASCEND Final Certification, Round 2b

> ## ⚠ SYNTHETIC SIMULATION — NOT REAL USERS
> Every "reviewer" in this document is a **modeled persona**, constructed for
> this certification round. **No human being was interviewed, observed, or
> quoted.** These are not market research, not user research, and not
> testimonials. Scores are structured judgments derived **only** from the
> verified audit evidence of Rounds 1a–1c (build `62e25543`), never from
> invented experience.

- **Build judged:** master `62e25543` — the app exactly as audited.
- **Grounding rule:** every task outcome, score reason, churn moment, and
  recommendation moment below cites a finding ID or a verified positive from
  the Round 1a–1c documents (`design-consistency-audit.md` = 1a F-xx,
  `screen-by-screen-ui-audit.md` = UI-1b-xx, `functional-test-results.md` =
  F1–F9 / journeys J1–J10, `accessibility-audit.md` = A11Y-xx,
  `device-compatibility.md` = DEV-x, `performance-audit.md` = PERF-x,
  `security-audit.md` = SEC-1c-xx). Where the audit did not test something,
  the persona does not get to have an opinion about it; it is marked
  NOT AUDITED instead.
- **Outcome vocabulary:** **Succeeds** (audit evidence shows the flow works),
  **Succeeds with friction** (works, but an audited finding degrades it),
  **Fails** (the audit evidence shows the task cannot be completed as
  intended).
- **One evidence tension, disclosed:** the Round 1a inventory lists "set
  editing" among present features; Round 1b-2's driven UI testing (F3)
  established that editing exists for *pending* sets only and that **no edit
  path exists for a completed set**. Persona correction tasks below are
  judged on the driven evidence (F3), which is the stronger source.

---

## Persona 1 — The Beginner

**Who:** First month in a gym, never followed a structured program. Budget
Android phone, gym-floor use. Goal: "tell me what to do today and whether I
did it right."

**Tasks:**
1. *Complete onboarding and get a first plan* — **Succeeds with friction.**
   The happy path is verified end-to-end (J1): goals → details → plan offer
   matching the goals, food targets with defaults disclosed, summary with
   DEFAULT badges. Friction: leaving the name empty produces the browser's
   native validation bubble instead of the app's designed error (F2), and
   going back from the plan offer to fix details wipes the typed name (F1).
2. *Follow the first guided workout* — **Succeeds with friction.** Session
   flow, draft persistence, rest timer, and exact summary all verified (J2).
   Friction: the first-session tips card says "Tap the big Done button" but
   the button is labelled **Complete Set** (UI-1b-05) — a beginner is the
   user least able to bridge that gap.
3. *Open the weekly review at the end of week one* — **Succeeds with
   friction, bordering on misleading.** The review renders for a week that
   ended before the account existed and reports "0 of 4 planned sessions"
   with four named missed days (UI-1b-02).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 8 | One coherent token system across onboarding/Today/Train (1a strengths; UI-1b compliance lines) |
| Polish | 7 | Tips card names a button that doesn't exist under that name (UI-1b-05) |
| Consistency | 7 | Core screens on-system; Form Coach quick-action leads to an off-system modal (UI-1b-01) |
| Hierarchy | 8 | Simple Today matches the mandated order exactly (UI-1b §2) |
| Ease of use | 6 | F1 + F2 in onboarding; UI-1b-05 in the first workout |
| Interaction quality | 7 | Draft resume and rest timer verified working (J2) |
| Trust | 7 | DEFAULT badges and honest estimates build it; pre-account "missed sessions" spend it (UI-1b-02) |
| Overall | 7 | Guided and honest, with first-run paper cuts exactly where a beginner is most fragile |

**Most likely to churn:** the first weekly review telling them they missed
four sessions in a week before they had an account (UI-1b-02).
**Most likely to recommend:** onboarding that labels every assumed number
DEFAULT instead of pretending it knows them (J1).

---

## Persona 2 — The General Gym User

**Who:** Trains 3–4×/week for general fitness, has used Strong/Hevy-style
loggers. Mid-range Android. Goal: fast, reliable logging and a trustworthy
history.

**Tasks:**
1. *Log a full workout* — **Succeeds.** 15 sets logged, summary volume exact
   to the kilogram (1,500 kg hand-verified), History matches the store (J2).
2. *Correct a set logged with the wrong weight* — **FAILS.** No edit path
   exists for a completed set, in-session or in History; the only remedies
   are wholesale data deletion (F3, P2).
3. *Check history after a reload* — **Succeeds.** Session persists with exact
   values (J2/J10).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Consistent core screens (UI-1b compliance lines) |
| Polish | 7 | CURRENT SPLIT denominator shifts 4→5 while a draft is open (F4) |
| Consistency | 7 | Meal delete gets confirm + undo; draft discard gets neither (F5) — inconsistent safety conventions |
| Hierarchy | 7 | Train/History inventory is standard and scannable (UI-1b §5) |
| Ease of use | 6 | The single most common logger correction is impossible (F3) |
| Interaction quality | 6 | Pending-set pre-fill reduces mis-logs but cannot repair them (F3 mitigant) |
| Trust | 8 | Arithmetic never disagreed between UI and store anywhere it was checked (J2/J4/J5) |
| Overall | 7 | A logger this exact should not make a typo permanent |

**Most likely to churn:** logging 100 kg instead of 10 kg and discovering it
can never be fixed (F3).
**Most likely to recommend:** closing the app mid-workout and finding the
draft restored exactly (J2).

---

## Persona 3 — The Bodybuilding-Focused Lifter

**Who:** Hypertrophy-focused, tracks volume per muscle group and protein
daily. Goal: volume accounting he can periodize from, and meal logging that
keeps protein honest.

**Tasks:**
1. *Review weekly volume by muscle* — **Succeeds.** Progress Muscle Volume
   matched the logged session set-for-set (Chest 3, Back 6, Shoulders 3,
   Arms 3 — sums to 15, J4).
2. *Log a 200 g paneer meal and verify the protein* — **Succeeds with
   friction.** Saved values are exact (530 kcal / 36.6 g P at 200 g, J5), but
   Save silently blocks without a meal name (F6), and the builder's blank
   template row can make the sheet display 795 kcal for one visible item
   (F7) before saving.
3. *Follow the coach block and check in* — **Succeeds.** Check-in thread
   persists answers; protein guidance is given in Indian units (katori dal,
   paneer, thali math, J8).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 8 | Progress reuses the same segmented/chip/matrix components as Home/Train (UI-1b §6) |
| Polish | 7 | Meal builder can display a doubled total for a single item (F7) |
| Consistency | 7 | Status colors mostly bypass the semantic tokens (1a F-03) — visible in dense data screens |
| Hierarchy | 8 | Progress segments (Strength/Body/Consistency) and gated, honest trend states (J4) |
| Ease of use | 7 | Meal save friction only (F6/F7); training flows clean (J2) |
| Interaction quality | 7 | Quantity edits update totals live and exactly (J5) |
| Trust | 8 | Per-muscle sums and macro arithmetic verified exact (J4/J5) |
| Overall | 8 | The numbers this persona lives by are the numbers the audit could not fault |

**Most likely to churn:** the meal sheet showing 795 kcal for one paneer
portion and concluding the totals can't be trusted (F7).
**Most likely to recommend:** per-muscle volume that adds up exactly, week
after week (J4).

---

## Persona 4 — The Strength Athlete

**Who:** Trains the big lifts with RPE, watches estimated 1RM trends, shares
a weekly recap with training partners. Goal: credible strength tracking.

**Tasks:**
1. *Log a top set with RPE* — **Succeeds.** RPE sheet stores the rating on
   the set (J2: `rpe: 8` recorded).
2. *Check estimated 1RM and the Big-3 scoreboard* — **Succeeds.** Epley
   values exact; scoreboard honestly labelled "Partial total — DOTS needs
   all three lifts" and "estimated… not tested maxes" (J4).
3. *Share the weekly recap card* — **Succeeds with friction.** Headline
   stats (sessions/sets/volume/dates) are exact, but the card claims "3 NEW
   PRS" and highlights a superseded bench baseline while the PR store holds
   6 records including the newer all-time PR (F8).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Share card is brand-true (vermilion on graphite, UI-1b §11) |
| Polish | 7 | Card's PR panel diverges from the PR page it invites comparison with (F8) |
| Consistency | 7 | Two subsystems (card vs Data Vault) publish two different PR counts (F8) |
| Hierarchy | 8 | PR page structure: best set, est. 1RM, next milestone per lift (J4) |
| Ease of use | 8 | RPE capture is one sheet, stored on the set (J2) |
| Interaction quality | 7 | PR drill-down rows are not plain buttons (J4 method note) |
| Trust | 7 | Estimates are honestly labelled; the share card's PR claim is not (F8) |
| Overall | 7 | Credible in the app, careless on the card it exports |

**Most likely to churn:** a training partner spotting that the shared card
shows an old PR after a new one was set (F8).
**Most likely to recommend:** a PR actually announced — "1 New Personal
Record detected & synced" — when a heavier set lands (J4).

---

## Persona 5 — The Powerlifter

**Who:** Meet-oriented, works in exact kilos, uses a plate calculator,
reviews attempts. Goal: precision logging with zero tolerance for wrong
numbers he cannot repair.

**Tasks:**
1. *Plan plates for a top set* — **Succeeds.** Plate Calculator is present
   in Training Tools (UI-1b §3 inventory).
2. *Log a heavier-than-ever set and get the PR* — **Succeeds.** 25 kg × 5
   created the all-time record at the exact Epley value (29.2 kg) and the
   summary announced it (J4).
3. *Fix a mis-entered set after completing it* — **FAILS.** No edit path for
   a completed set exists anywhere in the app (F3, P2).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Utilitarian and on-system in the workout surfaces (UI-1b §4) |
| Polish | 6 | First-run tip references a "Done button" that is labelled Complete Set (UI-1b-05) |
| Consistency | 7 | Workout chrome follows the system (UI-1b §4 compliance line) |
| Hierarchy | 7 | Target/last-time/set structure is clear in the session view (UI-1b §4) |
| Ease of use | 6 | Meet-prep logging is fine until the first typo (F3) |
| Interaction quality | 6 | Steppers and quick-adjust chips work, but completed work is read-only (F3) |
| Trust | 7 | PR math exact (J4); an uncorrectable wrong set contaminates the record it feeds |
| Overall | 7 | Precision everywhere except the one place precision lifters need it most: correction |

**Most likely to churn:** the uncorrectable mis-log during a meet-prep block
(F3).
**Most likely to recommend:** plate calculator + PR detection living in the
same logger (UI-1b §3, J4).

---

## Persona 6 — The Fat-Loss User

**Who:** In a calorie deficit, logs every meal, weighs food, checks protein
against a target daily. Goal: meal logging fast and honest enough to sustain
for months.

**Tasks:**
1. *Get calorie/protein targets from onboarding* — **Succeeds.** Targets on
   the Fuel page matched the onboarding offer exactly (2,526 kcal / 126 g P
   in the test profile, J5 setup).
2. *Log lunch from search and quick-add* — **Succeeds with friction.** The
   Indian food database returns per-100 g values and one-tap favorites
   (J5), but Save Meal silently does nothing until a meal name is typed —
   no inline error, name field not marked required (F6) — and the blank
   template row can double the displayed total (F7).
3. *Track water alongside food* — **Succeeds.** +250 ml persisted across a
   full reload together with the meal (J5).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Fuel is on-system with a standard scan modal (UI-1b §7) |
| Polish | 6 | Two photo entries ("Scan Food"/"Scan Meal") sit side by side with only textual distinction (UI-1b §7 observation) |
| Consistency | 7 | Delete gets a model confirm + undo — the standard Save should have met (J5) |
| Hierarchy | 7 | Daily intake card, macro rows, day-type chips are clearly ordered (UI-1b §7) |
| Ease of use | 5 | The daily-use save action fails silently for an undiscoverable reason (F6) |
| Interaction quality | 6 | Live totals while editing are exact; the blank-row trap undermines them (F7) |
| Trust | 7 | Saved arithmetic is exact to the decimal (J5); displayed pre-save totals can mislead (F7) |
| Overall | 6 | The persona who must use the app most often meets its worst friction most often |

**Most likely to churn:** tapping Save Meal with a full total on screen and
nothing happening, repeatedly (F6).
**Most likely to recommend:** an Indian food database (paneer, dal, sattu,
roti) with honest per-100 g values built in (J5).

---

## Persona 7 — The Time-Constrained User

**Who:** 30–40 minutes per session, trains before work, abandons anything
slow. Goal: open app → know today's session → log with minimal taps → leave.

**Tasks:**
1. *Glance at Today and start* — **Succeeds.** Simple Today puts the workout
   first, in the mandated order (UI-1b §2).
2. *Do the daily check-in fast* — **Succeeds.** The "Same as usual — go"
   shortcut exists for exactly this user (J8). Friction if they abandon a
   started check-in: it restarts from question one on return (J8 caveat).
3. *Resume an interrupted workout* — **Succeeds with friction.** Draft
   restore is verified across a full browser relaunch (J2); the risk is the
   resume banner's Discard destroying the draft in one tap with no
   confirmation (F5).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 8 | Simple Today is restrained and single-purpose (UI-1b §2) |
| Polish | 7 | Split counter denominator wobbles while a draft is open (F4) |
| Consistency | 8 | Simple/Detailed vocabulary is applied coherently (UI-1b §2/§8) |
| Hierarchy | 8 | Workout → nutrition → protein → actions → hydration → habits → quote (UI-1b §2) |
| Ease of use | 8 | Check-in shortcut + draft resume remove the two biggest time costs (J8/J2) |
| Interaction quality | 7 | One-tap irreversible Discard sits next to Resume on the same banner (F5) |
| Trust | 8 | Nothing this persona depends on was found numerically wrong (J2/J8) |
| Overall | 8 | Built for this user's morning, with one mis-tap hazard |

**Most likely to churn:** losing an in-progress session to an accidental
Discard tap (F5).
**Most likely to recommend:** "Same as usual — go" — a check-in that
respects a busy morning (J8).

---

## Persona 8 — The Data-Oriented User

**Who:** Exports everything, cross-checks the app against his own
spreadsheet, reads methodology notes. Goal: data he can verify and take
with him.

**Tasks:**
1. *Export a full backup* — **Succeeds.** JSON backup (versioned, structured)
   and CSV export with a documented header both download; the Data Vault
   inventory line matches the store exactly (J7).
2. *Cross-check the share card against the PR records* — **Succeeds with
   friction — the check itself fails.** Card: "3 NEW PRS" + baseline
   highlights. Store and Data Vault: 6 PRs, including a newer all-time bench
   PR (F8). Two subsystems publish different truths.
3. *Audit the strength trend* — **Succeeds.** The trend chart refuses to
   render on insufficient data instead of fabricating a line (J4).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Data screens are dense but component-consistent (UI-1b §6) |
| Polish | 7 | Export artifacts are properly structured and documented (J7) |
| Consistency | 6 | F8 is a consistency defect between subsystems, not just screens |
| Hierarchy | 8 | Progress gating and per-lift cards expose methodology (J4) |
| Ease of use | 7 | Exports are two taps in Settings (J7) |
| Interaction quality | 7 | Backup restore/import was NOT exercised end-to-end (J7 NOT TESTED) — claimed, not proven |
| Trust | 6 | Exact arithmetic everywhere (J2–J9) vs one public disagreement between card and vault (F8) |
| Overall | 7 | The most verifiable app this persona has used — with one visible crack |

**Most likely to churn:** finding the F8 discrepancy while cross-checking —
it makes him re-verify everything else.
**Most likely to recommend:** a versioned JSON backup + documented CSV
export, no account required (J7).

---

## Persona 9 — The Returning User

**Who:** Trained consistently, then life intervened for three weeks. Opens
the app guilty and braced for a scolding streak screen. Goal: pick up where
he left off without being punished or confused.

**Tasks:**
1. *Open the app after three weeks and find his data* — **Succeeds.**
   Local-first storage persists; drafts, history, and settings survive
   relaunch and time (J2/J3/J7 evidence classes).
2. *Read the weekly review for the missed period* — **Succeeds with
   friction.** The missed-session framing is supportive ("Yesterday didn't
   happen — and that's fine", J8), but the same review that reports 0/4
   also says "the revision below can move it" and "No changes proposed —
   the plan is working as it is" in one view (UI-1b-03), and review logic
   does not distinguish pre-account or absent periods from trained ones
   (UI-1b-02 mechanism).
3. *Restart the check-in habit* — **Succeeds with friction.** A check-in
   left unfinished restarts from the first question when he returns to it
   (J8 caveat).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Nothing about absence changes the app's presentation (UI-1b) |
| Polish | 7 | The review contradicts itself in a single view (UI-1b-03) |
| Consistency | 7 | Supportive copy in check-in vs unqualified accounting in review (J8 vs UI-1b-02) |
| Hierarchy | 7 | Week-status card and review entry points are findable (UI-1b §9) |
| Ease of use | 7 | Data and plan are simply still there (J2/J7) |
| Interaction quality | 7 | Check-in restart-from-Q1 is the only re-entry friction (J8) |
| Trust | 7 | No fake data on empty states (J10); review framing overstates what it knows (UI-1b-02) |
| Overall | 7 | Welcoming in tone, careless in bookkeeping |

**Most likely to churn:** a "review" of weeks he never trained, presented
with the same authority as real ones (UI-1b-02/UI-1b-03).
**Most likely to recommend:** "Yesterday didn't happen — and that's fine" —
the missed-session copy that doesn't guilt him (J8).

---

## Persona 10 — The Minimalist

**Who:** Wants one screen, three numbers, no feed, no fuss. Turns off every
optional feature. Goal: the least app that still logs a workout.

**Tasks:**
1. *Strip Today down to essentials* — **Succeeds.** Simple is the default;
   11 sections are reorderable/hideable in Customize Today, and the layout
   persists across reload (J6).
2. *Use only logging, ignore the coach* — **Succeeds.** Coach surfaces are
   present but the core logger never depends on them (J2); coach tips can
   be turned off from the Coach card (UI-1b §9 inventory).
3. *Find Form Check from Today's quick actions* — **Succeeds with
   friction.** The entry point exists (UI-1b §2), but the modal it opens is
   the app's one off-system surface (UI-1b-01).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 8 | Simple Today is genuinely minimal, not a collapsed Detailed (UI-1b §2) |
| Polish | 8 | Customization applies instantly and persists (J6) |
| Consistency | 8 | The screens this persona uses are the system's most disciplined (UI-1b) |
| Hierarchy | 8 | Mandated Simple order, exactly as specified (UI-1b §2) |
| Ease of use | 8 | Reorder verified end-to-end (J6) |
| Interaction quality | 8 | No audited friction on this persona's paths |
| Trust | 8 | "Nothing is lost — switching only changes how much you see" (J6 copy, verified true) |
| Overall | 8 | The rare persona the audit gives nothing to complain about |

**Most likely to churn:** no audited failure targets this persona; the
weakest point on his path is the Coach tab's density if he ever opens it
(UI-1b §9 inventory) — recorded as an observation, not a failure.
**Most likely to recommend:** Simple-by-default with real, persistent
customization (J6).

---

## Persona 11 — The Advanced Power User

**Who:** Runs block periodization, imports years of history from Strong,
wants custom themes and every toggle found. Goal: bend the app to his
system without fighting it.

**Tasks:**
1. *Import history (CSV from Strong/Hevy/FitNotes)* — **NOT VERIFIED.**
   The import paths exist in the Data Vault and the import sanitizer is
   code-reviewed as thorough (J7; security §7), but restore/import was not
   exercised end-to-end in functional testing (J7 NOT TESTED). This persona
   does not award credit for unexercised flows.
2. *Set a custom hex accent and build a block* — **Succeeds.** Custom hex
   with Apply/Cancel gating is inventoried in Settings (UI-1b §8); accent
   switching applies and persists (J6); "Build my block" is the Coach tab's
   primary action (UI-1b §9).
3. *Use Form Coach for a squat check* — **Succeeds with major visual
   friction.** The feature exists and its privacy model is on-device
   (UI-1b §3), but its modal is transparent at phone width and ignores his
   chosen accent entirely (UI-1b-01 / 1a F-02).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Power surfaces are coherent; Form Coach visibly is not (UI-1b-01) |
| Polish | 7 | Unverified import is a promise, not polish (J7 NOT TESTED) |
| Consistency | 6 | Form Coach is a second design language inside the app (1a F-02, UI-1b-07) |
| Hierarchy | 7 | Training Tools concentrates advanced features findably (UI-1b §3) |
| Ease of use | 7 | Theme customization is deep and safe (Apply/Cancel, J6/UI-1b §8) |
| Interaction quality | 7 | Block building and check-in work (J8); import unproven |
| Trust | 7 | Honest gating elsewhere buys patience; F8-style divergence would not |
| Overall | 7 | Depth is real; the newest flagship feature is the least finished |

**Most likely to churn:** Form Coach — the flagship feature looking like it
belongs to a different, unstyled app (UI-1b-01).
**Most likely to recommend:** custom hex accents + block-based coaching in a
free local-first app (UI-1b §8/§9).

---

## Persona 12 — The Design-Conscious User

**Who:** Notices radius, spacing, and color drift; screenshots apps he
likes. Goal: an app that looks like one team made it, in any theme.

**Tasks:**
1. *Switch theme and accent, then walk every screen* — **Succeeds with
   friction.** Graphite + Cobalt propagates correctly across Home, Train,
   and Coach (UI-1b §13 theme matrix) — until Form Coach, which does not
   follow the theme at all (UI-1b-01).
2. *Open every dialog and compare* — **Succeeds with friction.** Chrome is
   uniform in practice (UI-1b §10), despite three coexisting constructions
   underneath (1a F-06) and one modal with the wrong radius (UI-1b-07).
3. *Share the weekly card* — **Succeeds with friction.** The card itself is
   brand-true; its modal's Share WhatsApp button is a solid off-token
   green found nowhere else in the system (UI-1b-08).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Strong core system; status colors hard-coded per-theme (1a F-03) |
| Polish | 6 | 725 default-palette utilities bypass the semantic tokens (1a F-03) |
| Consistency | 6 | One live token scheme plus a dead one whose dark values disagree (1a F-01); Form Coach off-system (UI-1b-01) |
| Hierarchy | 7 | Type hierarchy is effectively two sizes despite a defined scale (1a F-09) |
| Ease of use | 7 | Nothing visual blocks tasks on his walk (UI-1b) |
| Interaction quality | 6 | Two button systems with different heights and opposite "outline" meanings (1a F-05) |
| Trust | 7 | The theme engine itself is honest — what you pick is what renders (UI-1b §13) |
| Overall | 6 | A good design system with visible unfinished edges |

**Most likely to churn:** the Form Coach modal floating transparent over
the scrim at phone width (UI-1b-01) — the screenshot he'd send a friend,
for the wrong reason.
**Most likely to recommend:** the theme system — graphite + cobalt verified
coherent across the app (UI-1b §13).

---

## Persona 13 — The Skeptical Newcomer

**Who:** Burned by fitness apps that invent streaks, inflate numbers, and
paywall his own data. Reads the privacy policy before the features. Goal:
decide whether this app lies to him.

**Tasks:**
1. *Check whether the numbers are honest* — **Succeeds.** Defaults are
   badged DEFAULT (J1); 1RM figures are labelled estimates, "not tested
   maxes" (J4); trend charts refuse to draw on insufficient data (J4).
2. *Read the privacy terms and data controls* — **Succeeds.** The four legal
   pages are mutually consistent and driven from a single source
   (UI-1b §12); guest mode needs no account (J1); export and reset are real
   (J7).
3. *Survive the first weekly review* — **Succeeds with friction.** The app
   tells him he completed "0 of 4 planned sessions" in a week before his
   account existed (UI-1b-02) — precisely the kind of manufactured history
   he came in watching for. Partial mitigation exists only on the athlete
   card (DEFAULT label), not in the review itself.

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | No dark patterns or fake urgency observed in the audit walk (UI-1b) |
| Polish | 7 | Legal content is consistent across all four pages (UI-1b §12) |
| Consistency | 7 | Honesty labelling is systematic, not one-off (J1/J4/J10) |
| Hierarchy | 7 | Disclaimers sit next to the numbers they qualify (J4) |
| Ease of use | 7 | Guest mode removes the account wall entirely (J1) |
| Interaction quality | 7 | Reset flow forces a backup decision before destruction (J7) |
| Trust | 6 | Best-in-class disclaimers, taxed by one invented history (UI-1b-02) |
| Overall | 7 | He stays — cautiously, and watching the review screen |

**Most likely to churn:** the pre-account weekly review (UI-1b-02).
**Most likely to recommend:** "estimated from your best rep performances,
not tested maxes" — a fitness app declining to flatter him (J4).

---

## Persona 14 — The Accessibility-Conscious User

**Who:** Low-vision user who relies on large text, strong contrast, and
keyboard/screen-reader navigation on desktop; enlarges everything. Goal:
complete the same flows as everyone else, without workarounds.

**Tasks:**
1. *Navigate Today and a modal by keyboard* — **Succeeds with friction.**
   Focus is visible on 100% of ~70 probed stops; the modal traps focus,
   closes on Esc, and returns focus to its trigger (accessibility §3).
   Friction: one stop per Tab cycle lands on `document.body` (A11Y-04),
   and Today's reading order differs from its visual order for
   non-interactive content (UI-1b-06).
2. *Read the app's small labels* — **Succeeds with friction.** Every token
   text pair passes AA contrast (accessibility §1), but 9–10 px text
   persists in 100+ places under the system's own 11 px floor (A11Y-03 /
   1a F-04), and the active bottom-nav label in light theme measures
   3.57:1 — an actual AA failure (A11Y-01).
3. *Enlarge the text* — **Succeeds.** Extra Large (root 16→20 px) verified
   end-to-end with zero overflow at 390 px (accessibility §5).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 7 | Contrast discipline is real in both themes (accessibility §1) |
| Polish | 6 | One measured AA failure ships in the primary navigation (A11Y-01) |
| Consistency | 7 | Exactly one unnamed button in the entire app (A11Y §2 / UI-1b-04) — a system with one hole |
| Hierarchy | 6 | Today's `h1` is the user's own first name (A11Y-05) |
| Ease of use | 6 | Sub-floor text (A11Y-03) and 14–16 px text-link targets (A11Y-02) tax every session |
| Interaction quality | 6 | Focus trap works; the body stop (A11Y-04) and missing timer live-region (A11Y-06) are daily frictions |
| Trust | 7 | Reduced motion is honoured globally and verified live (accessibility §6) |
| Overall | 6 | No barrier is total; the frictions are cumulative and daily |

**Most likely to churn:** habit-matrix and meta labels at 9–10 px (A11Y-03)
— the screens he must read every day.
**Most likely to recommend:** a text-size setting that genuinely rescales
the whole app without breaking layout (accessibility §5).
**NOT AUDITED for this persona:** real screen-reader sessions
(NVDA/VoiceOver/TalkBack) — the audit used DOM/keyboard probes only
(accessibility §7).

---

## Persona 15 — The Mobile-First User

**Who:** Phone is his only computer; logs one-handed on the gym floor,
360–390 px screen, gym Wi-Fi unreliable. Goal: everything works at phone
width, with gloves-off speed.

**Tasks:**
1. *Log a workout at 390 px* — **Succeeds.** Zero horizontal overflow in
   60/60 measured screen-states across 320–1440 px; primary targets ≥44 px
   (device §1; accessibility §4).
2. *Use Form Coach from the gym floor* — **Succeeds with major friction.**
   At phone width the modal's own background is transparent and its content
   floats on the scrim; it also ignores his theme (UI-1b-01). The analysis
   result screens were CODE-ONLY in the audit — NOT AUDITED here.
3. *Read the "Gym packed?" guidance mid-session* — **Succeeds with
   friction.** The explainer text is ellipsized at every phone width; the
   full sentence renders only ≥768 px or landscape (DEV-1). At 320 px the
   workout title itself squeezes to "U…" (DEV-2).
4. *Rely on the app offline in a basement gym* — **NOT VERIFIED.** The
   local build failed to serve the shell offline (F9); production offline
   behaviour is explicitly NOT TESTED, so this persona is given no score
   impact either way — and no assurance.

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 8 | No overflow or clipped layout at any phone width (device §1) |
| Polish | 6 | Ellipsized guidance text at exactly his widths (DEV-1) |
| Consistency | 6 | Form Coach breaks the phone experience the rest of the app keeps (UI-1b-01) |
| Hierarchy | 8 | Bottom bar (63 px ≤768 px) and session layout hold at 320 px (device §1) |
| Ease of use | 7 | Primary flows are thumb-safe (accessibility §4) |
| Interaction quality | 6 | Secondary targets (chips 24–38 px, header icons 36×44) are mid-set fiddly (A11Y-02) |
| Trust | 8 | Layout never lies about what fits (device matrix) |
| Overall | 7 | The gym-floor core is solid; the flagship add-on is not |

**Most likely to churn:** the transparent Form Coach modal (UI-1b-01).
**Most likely to recommend:** an app that never breaks its layout at
320 px (device §1).

---

## Persona 16 — The Privacy-Conscious User

**Who:** Refuses cloud fitness apps; keeps health data off servers where
possible; reads data policies and tests delete buttons. Goal: full training
value with data that stays his.

**Tasks:**
1. *Use the app fully as a guest* — **Succeeds.** No account is required;
   Today shows a "Local only" marker; welcome copy states "your data stays
   on this device" (UI-1b §2; J1).
2. *Verify the telemetry and deletion story* — **Succeeds.** Analytics load
   only after explicit consent, with health-shaped event parameters
   blocklisted by design (security §8); reset forces a backup decision,
   then provably wipes the store (J7); cloud account deletion requires a
   verified token — email alone never authorizes (security §4). Recorded
   caveats: Sentry has no app-level PII scrubber in the repo (SEC-1c-08),
   and Clarity session-replay is code-supported though not enabled
   (SEC-1c-07).
3. *Use Form Coach without uploading video* — **Succeeds.** The feature's
   privacy card states frames are analyzed locally and never uploaded;
   the audited build verifies zero egress in the feature (UI-1b §3;
   program records).

**Scores:**

| Dimension | Score | Reason (evidence) |
|---|---|---|
| Visual appeal | 8 | Privacy state ("Local only") is surfaced in the UI, not buried (UI-1b §2) |
| Polish | 8 | Legal pages are single-sourced and mutually consistent (UI-1b §12) |
| Consistency | 8 | The local-first promise holds across guest mode, backup, and reset (J1/J7) |
| Hierarchy | 8 | Consent precedes telemetry; deletion precedes destruction warnings (security §8, J7) |
| Ease of use | 8 | Guest mode is a first-class path, not a crippled demo (J1) |
| Interaction quality | 8 | Export + reset verified working, not just present (J7) |
| Trust | 9 | Consent-gated telemetry with a parameter blocklist is verifiable, not vibes (security §8) |
| Overall | 9 | The audit's highest score — this persona's requirements are the app's architecture |

**Most likely to churn:** no audited failure targets this persona; his
watch-item is SEC-1c-07 — if Clarity replay were ever enabled unmasked, he
would leave on principle. Recorded as a conditional, not a current defect.
**Most likely to recommend:** guest mode + on-device Form Coach + a delete
flow that actually deletes (J1/J7, UI-1b §3).

---

## Aggregate results

### Mean scores per dimension (16 personas)

| Dimension | Mean | Reading |
|---|---|---|
| Hierarchy | 7.4 | The mandated Simple order, honest gating, and clear per-screen structure land well |
| Visual appeal | 7.4 | One coherent system everywhere except the flagged surfaces |
| Trust | 7.3 | Exact arithmetic + honesty labels, taxed by UI-1b-02 and F8 |
| Consistency | 6.9 | Dragged by F-01/F-03 (system-level) and UI-1b-01 (feature-level) |
| Ease of use | 6.9 | Dragged by the correction/logging frictions (F3, F6) |
| Polish | 6.8 | Small defects are numerous and daily (P3 density) |
| Interaction quality | 6.8 | Strong primitives; correction and discard paths under-built |
| **Overall** | **7.1** | Range across personas: **6–9** (lowest: fat-loss, design-conscious, accessibility-conscious; highest: privacy-conscious, 9) |

### Findings ranked by persona impact

| Rank | Finding | Personas materially affected | Why it ranks here |
|---|---|---|---|
| 1 | **F3 (P2)** — no edit path for a completed set | General gym, powerlifter (tasks **fail outright**); strength athlete, bodybuilder, beginner, advanced, returning, data-oriented (same wall on any mis-log) | The only finding that makes a core task *impossible*; logging is the app's center of gravity |
| 2 | **UI-1b-02 (P2)** — pre-account/absent periods presented as the user's own missed history | Beginner, skeptical newcomer, returning user, fat-loss, general gym (every first-run and every return) | Strikes at the exact moment trust is formed; contradicts the app's own honesty system |
| 3 | **F6 + F7 (P3)** — silent Save-Meal block; builder blank-row double-total | Fat-loss (daily), bodybuilder, data-oriented, general gym | Individually P3, but they sit on the highest-frequency flow in the app after set logging |
| 4 | **UI-1b-01 / 1a F-02 (P2)** — Form Coach off-system, transparent at phone width, theme-blind | Mobile-first, advanced, design-conscious, beginner, minimalist (via Today's quick action) | The newest flagship feature is the least consistent surface in the app |
| 5 | **F8 (P3)** — share card PR count/highlights diverge from the PR store | Strength athlete, data-oriented, powerlifter, bodybuilder (anyone who shares or cross-checks) | Small numbers, large credibility cost — it exports the disagreement publicly |
| 6 | **1a F-04 / A11Y-03 (P3)** — 9–10 px text under an 11 px floor | Accessibility-conscious (daily), mobile-first, design-conscious, data-oriented | Cumulative legibility tax on the densest screens |
| 7 | **F5 (P3)** — one-tap draft Discard, no confirmation | Time-constrained, general gym, returning | Rare but irreversible; inconsistent with the app's own meal-delete standard |
| 8 | **PERF-2 (P3)** — Hindi dictionary (~65 KB gzip) loads in English sessions | Mobile-first, time-constrained (mild); all personas marginally | ~11% of cold script payload for a dictionary most sessions never open |

*Positive findings with persona impact, for balance:* exact arithmetic
(J2/J4/J5/J9) is the single largest trust contributor across personas;
the honesty system (DEFAULT badges, estimate disclaimers, gated charts)
is the second; theme/dashboard customization that verifiably persists
(J6) is the third.

### Where personas honestly disagree

- **Coach density.** The data-oriented and advanced personas score the
  Coach tab's depth (blocks, athlete model, review) as the app's
  differentiator. The minimalist and time-constrained personas score the
  same surface as the app's heaviest — and are served instead by Simple
  Today and the "Same as usual — go" shortcut (J8). Both judgments are
  grounded in the same inventory (UI-1b §9); the app answers the
  disagreement with the Simple/Detailed split rather than a compromise.
- **Estimated 1RM.** The strength athlete accepts Epley estimates because
  they are labelled estimates (J4). The powerlifter's world runs on tested
  maxes; he credits the "not tested maxes" disclaimer but would never
  program from the number. The app takes the honest position; the
  disagreement is about the metric, not the app.
- **Status-color expression (1a F-03).** The design-conscious persona
  penalizes 725 hard-coded palette utilities. Every other persona is
  unaffected — the colors render consistently enough in practice. A
  system-debt finding, not a user-experience one, and the scores say so.
- **The weekly review.** The returning user reads supportive intent
  (J8 copy) and docks only for self-contradiction (UI-1b-03); the
  skeptical newcomer reads the same screen as manufactured history
  (UI-1b-02) and docks trust harder. Same evidence, different priors —
  the fix (account-age-aware framing) satisfies both.
- **Sharing.** Strength athlete and bodybuilder want the recap card;
  the data-oriented persona refuses to share it until F8 is fixed. The
  card's headline numbers are exact (J9) — the disagreement is entirely
  about the PR panel.

## What synthetic review cannot tell us

- **Real comprehension.** Whether a true beginner understands "RPE",
  "%1RM", or the check-in's questions on first contact. Personas were
  assumed to read labels as written; the audit itself notes %1RM/RPE
  carry no in-place explanation (UI-1b §3) — only humans can price that.
- **Real gym-floor conditions.** Sweaty hands, gloves, bright light,
  one-rep-left attention, basement connectivity (F9's production answer
  is still NOT TESTED), and a real phone's GPU under Form Coach — the
  phone runtime remains NOT VERIFIED in the program records.
- **Real retention and emotion.** Churn/recommend moments above are
  reasoned from defect severity and flow frequency, not observed
  behavior. Nobody actually quit, and nobody actually recommended.
- **Sound.** Whether the rest-timer chime and notifications are audible
  and timely on a real device — no audio path was testable in any round.
- **Population truth.** Sixteen archetypes cannot represent a market.
  Score means summarize the *evidence*, not users; a 7.1 here means
  "the audited findings distribute this way across modeled needs,"
  nothing more.
- **Anything behind sign-in.** All rounds ran guest-only; cross-account
  isolation and signed-in sync behavior rest on code review, not
  observation (baseline access matrix).

*End of synthetic results. The companion protocol for replacing these
modeled judgments with real ones is `real-user-testing.md`.*
