# Real-User Testing — ASCEND Final Certification, Round 2b

> ## Status: NO HUMAN PARTICIPANTS HAVE BEEN TESTED
> As of this document (2026-11-04), **zero real users** have taken part in
> any usability testing of ASCEND for this certification. Everything in
> the companion document (`synthetic-user-results.md`) is modeled, not
> measured. This document is the **ready-to-run protocol** for the day the
> owner recruits participants. Nothing here reports a result.

## 1. Purpose

Replace the synthetic panel's reasoned guesses with observed behavior on
the questions the audit could not settle — above all the four open items
in §7. The protocol mirrors the synthetic tasks deliberately, so human
results land on the same finding IDs and can confirm, refute, or re-rank
them.

## 2. Recruitment profile

- **N = 8–12 participants** (enough for qualitative saturation on the core
  flows; this is a defect-finding study, not a statistics exercise).
- **Market priority: gym-goers in India** — the launch market, and the
  population the app's Indian food database, thali-based protein guidance,
  and Hindi option are built for.
- **Spectrum quotas (mapped to the synthetic personas):**
  - ≥2 true beginners (<6 months training)
  - ≥2 experienced lifters (≥2 years, at least one strength-focused)
  - ≥2 nutrition-loggers (fat-loss or muscle-gain goal, currently tracking
    food in any app or on paper)
  - ≥1 returning trainee (lapsed ≥1 month)
  - ≥1 participant who uses accessibility features daily (large text,
    screen reader, or voice control) — recruited, never simulated
  - Remainder: general gym users / time-constrained trainers
- **Devices:** participants use **their own phones** (the audit's largest
  blind spot is real hardware). Record model + OS version per session.
  At least 3 sessions on ≤₹15k Android devices.
- **Exclusions:** anyone involved in building ASCEND; anyone who has used
  it before (first-run comprehension is a primary measurement).

## 3. Session shape

- 45–60 minutes, one participant, one moderator, one observer/note-taker
  (the moderator does not take the primary notes).
- Location: a real gym floor for at least half the sessions if logistics
  allow; otherwise a quiet room with the participant's own gym bag present
  is an acceptable substitute — record which.
- **Think-aloud throughout:** "Say what you're looking for, what you
  expect to happen, and what surprises you." The moderator prompts only
  with neutral phrases ("What are you thinking?"), never with UI
  directions. Help is given only after a task is scored as failed, and
  the rescue is logged.
- Order: consent (§5) → background questions (3 min) → Tasks 1–5 →
  questionnaire (SUS or UMUX-Lite) → debrief interview (10 min) →
  the §7 open-question probes woven into the tasks noted there.

## 4. The five core tasks (scripted verbatim intent, not verbatim taps)

1. **First run (mirrors synthetic Personas 1/13).** "You've just installed
   this app. Set it up and get to your first workout plan."
   *Watch for:* F2's native validation bubble vs the designed error; F1's
   back-navigation name loss; whether DEFAULT badges on the summary are
   noticed and understood; whether the plan offer feels credible.
2. **Log and correct (mirrors Personas 2/5 — contains the deliberate
   probe).** "Start today's workout. Log your first set as 20 kg for 6
   reps." Then, after the set is completed: **"You actually lifted 22.5 kg,
   not 20. Fix it."** This is the deliberate probe of **F3 (P2)**: there is
   no edit path for a completed set. Measure: time to discover
   impossibility, workaround attempted (delete? re-log? give up?), and the
   participant's verbatim reaction. Then: "Finish the workout and find it
   in your history."
3. **Feed the deficit (mirrors Persona 6).** "Log today's lunch: 200 g of
   paneer, and add a glass of water." *Watch for:* F6 (the silent
   Save-Meal name requirement — does the participant conclude Save is
   broken? how long until the name field is discovered?), F7 (does anyone
   put the quantity on the blank template row and accept the doubled
   total?).
4. **Check in and review (mirrors Personas 7/9).** "Do today's check-in,
   then open your weekly review and tell me what it says about your week."
   Use a **fresh profile** so the review covers a pre-account period —
   the comprehension test for **UI-1b-02**: does the participant notice
   the "missed sessions" predate their account? Do they believe them?
   Also probes UI-1b-03: do they catch the review contradicting itself?
5. **Make it yours, then take your data (mirrors Personas 8/10/16).**
   "Change the app's color theme, switch Today to the detailed view and
   back, then export a backup of your data and find where you'd delete
   everything." *Watch for:* theme persistence comprehension (J6 says it
   works — do users *notice* it worked?), Data Vault discoverability,
   and whether the reset safeguard dialog is read or reflex-tapped.

**Scoring per task:** success (unaided) / success with friction (completed
after hesitation, detour, or a visible error state) / fail (abandoned,
rescued, or completed wrongly — e.g., saving the doubled meal from F7
without noticing). Record time-on-task, error count, and one verbatim
quote per task (with consent, §5).

## 5. Consent and privacy handling

- **Written consent before any recording**, covering: screen recording,
  audio of think-aloud, and the use of anonymized quotes in the audit
  ledger. Separate opt-in for any video of the participant (default: no
  face video; screen + audio suffice).
- **Participants use guest mode on a study profile.** They are instructed
  to use a **fictional name** and approximate (not exact) body metrics.
  No participant signs into a personal account, and no participant's real
  health data is collected, exported, or retained by the study. Study
  devices/profiles are wiped at session end in the participant's presence
  if they ask.
- **The app's own telemetry stays off:** sessions run with telemetry
  consent declined, so the study never becomes a data source itself.
- Recordings and notes are stored under participant codes (P01…P12) with
  the code↔identity link kept separately and destroyed when the round
  closes. Compensation, if any, is the owner's decision and is disclosed
  in the consent form before the session.
- A participant may stop at any time; a stopped session is reported as a
  stopped session, not discarded silently.

## 6. Measures and how results feed the ledger

- **Per task:** success class (§4), time, errors, rescues.
- **Per session:** SUS (10-item) or UMUX-Lite (7-item) — pick one before
  the first session and use it for all; report the raw distribution, not
  just the mean, at this N.
- **Feeding the bug-fix ledger:** every observed failure or friction is
  entered as a ledger row keyed to the existing finding ID where one
  exists (F3, F6, UI-1b-02…), or as a new ID if humans find something the
  audit missed. Each row records: participant codes affected (count, not
  names), task, observed behavior, verbatim quote (consented), severity
  proposed by the moderator, and the synthetic panel's prior prediction
  for the same finding — so the certification can state, per finding,
  whether real users **confirmed / softened / refuted** the modeled
  judgment. Any finding confirmed by ≥2 participants at friction-or-worse
  is escalated one severity-review step at the Round 3 gate.
- **Reporting rule:** human results are reported in a separate addendum
  to this file (dated, N stated, recruitment described). They are never
  merged into the synthetic document's tables, and synthetic scores are
  never re-published as if they were human data.

## 7. Questions only humans can answer

These are the program's standing NOT VERIFIED / NOT TESTED items that no
further code audit can close:

1. **Cold-start review framing (UI-1b-02).** Do new users notice that the
   weekly review covers days before their account existed — and if they
   notice, do they read it as a bug, a lie, or a shrug? (Task 4 probe.)
2. **Form Coach trust and phone runtime.** On a real phone, does pose
   tracking complete at usable speed (the GPU path was NOT VERIFIED on
   this VM), does the off-system modal (UI-1b-01) actually deter use, and
   do users believe form feedback produced by a phone camera? Requires
   the participant's own squat video on their own device — nobody else's
   footage.
3. **Coach tone.** Is the coach's voice — supportive copy, "It never
   diagnoses pain," thali-based protein math — experienced as credible,
   patronizing, or ignorable by Indian gym-goers hearing it fresh?
   (Tasks 4 + debrief.)
4. **Rest-timer audibility on real phones.** Is the rest-end chime heard
   in a noisy gym, with the phone locked, in a pocket? Every prior round
   was audio-blind; this needs ears and hardware. (Observed during
   Task 2's rest period.)
5. **The mis-log probe's emotional cost (F3).** The audit knows the edit
   path doesn't exist; only users can say whether that is a shrug or a
   delete-the-app moment. (Task 2.)
6. **Offline in the wild (F9).** Does the production app open and log in a
   basement gym with no signal? Production behavior is NOT TESTED;
   participants' own gyms answer it incidentally — record any occurrence.
7. **%1RM / RPE comprehension.** Both terms appear with no in-place
   explanation (UI-1b §3). Do beginners ask, guess, or ignore?
   (Task 2 observation + debrief.)

## 8. Readiness checklist (all boxes currently unchecked)

- [ ] Owner approves recruitment and any compensation
- [ ] Consent form finalized (recording, quotes, wipe-on-request)
- [ ] SUS vs UMUX-Lite chosen
- [ ] Study profiles prepared (fresh guest state, telemetry declined)
- [ ] Moderator script printed; observer note template keyed to finding IDs
- [ ] ≥8 participants recruited against §2 quotas
- [ ] Sessions scheduled on participants' own devices
- [ ] Ledger addendum section reserved in this file

*End of protocol. When the first human session runs, this document stops
being a plan and starts being evidence — until then, the honest headline
stands: **no real user has tested this app.***
