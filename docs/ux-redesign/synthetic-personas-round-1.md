# ASCEND — Synthetic User Test Panel (Round 1 Baseline Evaluation)

**Date:** 2026-10-25  
**Document:** `docs/ux-redesign/synthetic-personas-round-1.md`  
**Purpose:** Evaluate ASCEND from 12 distinct synthetic user perspectives to identify design debt, competing user priorities, and high-friction interactions prior to the redesign.

> **Methodological Note:** These are structured synthetic personas derived from fitness app behavioral archetypes and tested against the actual ASCEND Next.js codebase. They provide comparative qualitative friction analysis, not empirical user telemetry.

---

## The 12 Synthetic Personas

### Persona 1: "The New Gym Member" (Maya, 24)
- **Goal:** Build a gym habit, learn basic compound lifts, feel confident in the gym.
- **Experience:** Beginner (<3 months).
- **Digital Pattern:** Mobile phone only, checks between exercises.
- **Preferred Density:** Minimal / Simple. 1 primary call to action, plain language.
- **Critical Need:** "What exercise do I do next, and how do I do it?"
- **Friction Points:** Acronyms like RPE, 1RM, DOTS, AMRAP without inline explanation. Overcrowded tables on Home.
- **Abandonment Risk:** Feeling foolish or intimidated by high-cognitive-load screens.
- **Key Tasks:**
  1. Complete onboarding and find a beginner routine.
  2. Log first set of goblet squats with correct weight/reps.
  3. Understand daily calories without feeling judged.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3/5
  - Information Hierarchy: 2/5 (Too many advanced powerlifting cards on Home)
  - Interaction Effort: 3/5
  - Visual Comprehension: 2/5
  - Accessibility: 3/5
  - Perceived Polish: 3/5

---

### Persona 2: "The General Fitness User" (David, 38)
- **Goal:** Stay fit, improve cardiovascular and core endurance, maintain general health.
- **Experience:** Intermediate gym-goer (3 days/week).
- **Digital Pattern:** Quick glance before work or in the evening.
- **Preferred Density:** Balanced. Clean summaries.
- **Critical Need:** Clear status of today's workout and nutrition balance.
- **Friction Points:** Home screen forces powerlifting metrics (DOTS score, radar chart) even when training for general health.
- **Abandonment Risk:** App feels like it was built exclusively for powerlifters.
- **Key Tasks:**
  1. Check today's scheduled training in <5 seconds.
  2. Log a quick meal or water intake.
  3. Review weekly workout consistency.
- **Baseline Ratings (1-5):**
  - Task Clarity: 4/5
  - Information Hierarchy: 2.5/5
  - Interaction Effort: 3/5
  - Visual Comprehension: 3/5
  - Accessibility: 3.5/5
  - Perceived Polish: 3/5

---

### Persona 3: "The Bodybuilding Lifter" (Alex, 27)
- **Goal:** Muscle hypertrophy, balanced volume per muscle group, aesthetic physique.
- **Experience:** Advanced (5 years training, PPL split).
- **Digital Pattern:** Constantly logging sets, tracking rest seconds, inspecting volume.
- **Preferred Density:** High / Detailed. Needs muscle-group breakdown and rep targets.
- **Critical Need:** Historical best sets per exercise, volume per muscle group per week.
- **Friction Points:** Muscle volume section is buried deep inside secondary sheets; rest timer sheet blocks view of upcoming exercises.
- **Abandonment Risk:** Inability to quickly inspect previous set weight/reps during a superset.
- **Key Tasks:**
  1. Start Incline Dumbbell Press and verify last week's weight and reps.
  2. Log 4 sets with 90s rest timer auto-triggering.
  3. Check weekly chest volume vs target.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3.5/5
  - Information Hierarchy: 3/5
  - Interaction Effort: 2.5/5 (Too many modal sheets during active workout)
  - Visual Comprehension: 3/5
  - Accessibility: 3/5
  - Perceived Polish: 3/5

---

### Persona 4: "The Strength-Focused Lifter" (Marcus, 31)
- **Goal:** Continuous progressive overload on Squat, Bench, Deadlift, Overhead Press.
- **Experience:** Intermediate to Advanced (4 years).
- **Digital Pattern:** Methodical, logs RPE and notes on bar speed.
- **Preferred Density:** Detailed. Values 1RM formulas and loading plates.
- **Critical Need:** Previous workout load for the exact same rep count, plate loading math.
- **Friction Points:** Stepper buttons in ActiveWorkout are small; plate calculator modal requires 3 taps to reach.
- **Abandonment Risk:** Miscalculating barbell weight due to confusing plate display.
- **Key Tasks:**
  1. View last session's 3x5 squat weight and target +2.5kg increase today.
  2. Use plate calculator to configure 142.5kg barbell.
  3. Record RPE 8.5 on the top set.
- **Baseline Ratings (1-5):**
  - Task Clarity: 4/5
  - Information Hierarchy: 3.5/5
  - Interaction Effort: 3/5
  - Visual Comprehension: 3/5
  - Accessibility: 3/5
  - Perceived Polish: 3.5/5

---

### Persona 5: "The Competitive Powerlifter" (Elena, 29)
- **Goal:** Prepare for sanctioned meet, peak Squat/Bench/Deadlift, manage fatigue.
- **Experience:** Elite / Competitive.
- **Digital Pattern:** Uses meet attempt planner, DOTS score tracking, deload protocols.
- **Preferred Density:** Maximum data density.
- **Critical Need:** DOTS score, Wilks, RPE-based 1RM estimation, meet attempts.
- **Friction Points:** Meet attempt planner is separated from the active workout; DOTS radar chart takes up half the Progress tab.
- **Abandonment Risk:** Lack of granular control over attempt percentages.
- **Key Tasks:**
  1. Plan 3 attempts for squat (Opener, Second, Third).
  2. Check current DOTS score against national weight class standard.
  3. Review coach deload recommendation.
- **Baseline Ratings (1-5):**
  - Task Clarity: 4/5
  - Information Hierarchy: 3/5
  - Interaction Effort: 3/5
  - Visual Comprehension: 3/5
  - Accessibility: 3/5
  - Perceived Polish: 3.5/5

---

### Persona 6: "The Fat-Loss User" (Priya, 33)
- **Goal:** Lose 10kg fat sustainably, build calorie awareness, track daily protein.
- **Experience:** Beginner/Intermediate fitness, highly nutrition-conscious.
- **Digital Pattern:** Opens app 4-5 times a day specifically to log meals and water.
- **Preferred Density:** Clean, supportive, clear macro visuals.
- **Critical Need:** Fast meal logging (Indian foods, barcode scan, photo scan), deficit progress.
- **Friction Points:** Meals tab has small text for micronutrients; portion slider is finicky; camera scanner sometimes fails without clear error guidance.
- **Abandonment Risk:** Food logging feels tedious or punishing when over calories.
- **Key Tasks:**
  1. Log a typical Indian lunch (2 roti, 1 bowl dal, paneer bhurji) in <30 seconds.
  2. Check remaining protein target for the evening.
  3. Scan a packaged protein bar barcode.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3.5/5
  - Information Hierarchy: 3/5
  - Interaction Effort: 2.5/5 (Photo scanner latency, small portion buttons)
  - Visual Comprehension: 3/5
  - Accessibility: 3/5
  - Perceived Polish: 3/5

---

### Persona 7: "The Time-Constrained Lifter" (James, 42)
- **Goal:** Complete a quality workout in exactly 45 minutes during lunch break.
- **Experience:** Intermediate (trains efficiently).
- **Digital Pattern:** Sweaty fingers, one-handed phone use, fast pacing.
- **Preferred Density:** Ultra-concise. Big tap targets, zero popup obstacles.
- **Critical Need:** Tap-and-go set completion, automatic rest timer.
- **Friction Points:** Unnecessary confirmation dialogs; rest timer modal requires manual dismiss if you start a set early; small buttons.
- **Abandonment Risk:** App slows down training pace.
- **Key Tasks:**
  1. Resume an in-progress workout with 1 tap.
  2. Check off 3 sets in rapid succession.
  3. Finish workout and save without answering a 4-step survey.
- **Baseline Ratings (1-5):**
  - Task Clarity: 4/5
  - Information Hierarchy: 3/5
  - Interaction Effort: 2/5 (Too many modal clicks during live workout)
  - Visual Comprehension: 3/5
  - Accessibility: 2.5/5
  - Perceived Polish: 3/5

---

### Persona 8: "The Detail-Oriented Athlete" (Dr. Nathan, 36)
- **Goal:** Longitudinal tracking of physiological adaptations, volume load, and recovery.
- **Experience:** Highly analytical, sports science background.
- **Digital Pattern:** Desktop & mobile tablet viewing, analyzes charts, exports CSV.
- **Preferred Density:** Deeply analytical, multi-variable charts.
- **Critical Need:** Date-based axes, volume load vs strength trends, data export.
- **Friction Points:** Progress charts show points without clear date labels on small viewports; CSV export is buried inside Settings Danger Zone.
- **Abandonment Risk:** Data visualization feels superficial or decorative rather than quantitative.
- **Key Tasks:**
  1. Inspect 6-month bench press progression chart with trend line.
  2. Export full workout data to CSV for external analysis.
  3. Correlate sleep readiness score with training volume.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3.5/5
  - Information Hierarchy: 3/5
  - Interaction Effort: 3/5
  - Visual Comprehension: 2.5/5
  - Accessibility: 3/5
  - Perceived Polish: 3/5

---

### Persona 9: "The Returning User" (Sarah, 30)
- **Goal:** Get back into training after a 3-week illness without guilt or confusion.
- **Experience:** Intermediate (periodic training breaks).
- **Digital Pattern:** Re-opens app after weeks of inactivity.
- **Preferred Density:** Encouraging, clear baseline restart.
- **Critical Need:** "Where did I leave off, and what weights should I start with today?"
- **Friction Points:** Aggressive broken-streak banners ("0 DAY STREAK"); unclear whether active routine needs to be restarted or resumed.
- **Abandonment Risk:** Psychological friction from broken streak indicators.
- **Key Tasks:**
  1. Open app and see a clean, welcoming restart state.
  2. Check last completed weights from 3 weeks ago.
  3. Start a calibrated comeback workout.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3/5
  - Information Hierarchy: 2.5/5
  - Interaction Effort: 3/5
  - Visual Comprehension: 3/5
  - Accessibility: 3.5/5
  - Perceived Polish: 3/5

---

### Persona 10: "The Interrupted User" (Carlos, 26)
- **Goal:** Train in a basement gym with spotty reception; frequently interrupted by calls.
- **Experience:** Regular gym-goer.
- **Digital Pattern:** Switches between music, WhatsApp, camera, and ASCEND; browser refreshes in background.
- **Preferred Density:** Robust, zero state loss.
- **Critical Need:** Uninterrupted workout recovery, clear offline feedback.
- **Friction Points:** Amber "Offline Mode" banner appears repeatedly on network fluctuation; fear of losing sets if browser tab suspends.
- **Abandonment Risk:** Losing a 5-set workout after taking a phone call.
- **Key Tasks:**
  1. Continue logging sets when WiFi drops to 0 bars.
  2. Background app, take a 3-minute call, return and verify draft is 100% intact.
  3. Seamlessly sync once back online.
- **Baseline Ratings (1-5):**
  - Task Clarity: 4.5/5 (ASCEND's offline persistence is technically strong)
  - Information Hierarchy: 3/5
  - Interaction Effort: 3.5/5
  - Visual Comprehension: 3/5
  - Accessibility: 3/5
  - Perceived Polish: 3/5

---

### Persona 11: "The Minimalist" (Klara, 28)
- **Goal:** Pure training logbook without social features, gamification, or clutter.
- **Experience:** Experienced lifter (wants a digital notebook).
- **Digital Pattern:** Dislikes visual noise, animated banners, quotes, or badges.
- **Preferred Density:** Minimalist / Zen.
- **Critical Need:** Only the workout log and timer. Hide challenges, coach recaps, and motivational quotes.
- **Friction Points:** Home page has quotes, streaks, athlete tiers, friend challenges, and coach cards that cannot be hidden.
- **Abandonment Risk:** Cognitive fatigue from unwanted social/gamification elements.
- **Key Tasks:**
  1. Hide friend challenges, quote, and athlete tier from Home.
  2. Switch to a quiet, monochrome or custom muted theme.
  3. Use app as a clean, rapid notebook.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3/5
  - Information Hierarchy: 2/5 (Too much mandatory clutter)
  - Interaction Effort: 2.5/5
  - Visual Comprehension: 2.5/5
  - Accessibility: 3.5/5
  - Perceived Polish: 3/5

---

### Persona 12: "The Accessibility-Conscious User" (Robert, 55)
- **Goal:** Stay active, maintain bone density and muscle mass, train safely.
- **Experience:** Older lifter, uses 125% OS font scaling and high contrast.
- **Digital Pattern:** Reading glasses off in the gym, relies on large text, clear contrast, and large touch targets.
- **Preferred Density:** Low density, high legibility.
- **Critical Need:** Minimum 44x44px touch targets, 4.5:1 text contrast, readable numbers.
- **Friction Points:** Small `3xs` (10px) labels on set tags and timers; muted gray text on dark cards difficult to read under gym lights; tiny stepper arrows.
- **Abandonment Risk:** Inability to read or tap set controls without putting on reading glasses.
- **Key Tasks:**
  1. Read set weight and rep values from arms-length without squinting.
  2. Tap the set-complete button without accidental taps on "Remove Set".
  3. Navigate tabs using high-contrast icons.
- **Baseline Ratings (1-5):**
  - Task Clarity: 3.5/5
  - Information Hierarchy: 2.5/5
  - Interaction Effort: 2/5 (Small buttons and micro-typography)
  - Visual Comprehension: 2/5
  - Accessibility: 2.5/5
  - Perceived Polish: 2.5/5

---

## 2. Summary Matrix Across All 12 Personas

| Persona | Task Clarity | Hierarchy | Interaction Effort | Visual Comprehension | Accessibility | Polish | Overall Satisfaction |
|---|---|---|---|---|---|---|---|
| 1. New Gym Member | 3.0 | 2.0 | 3.0 | 2.0 | 3.0 | 3.0 | **2.67 / 5** |
| 2. General Fitness | 4.0 | 2.5 | 3.0 | 3.0 | 3.5 | 3.0 | **3.17 / 5** |
| 3. Bodybuilding | 3.5 | 3.0 | 2.5 | 3.0 | 3.0 | 3.0 | **3.00 / 5** |
| 4. Strength Lifter | 4.0 | 3.5 | 3.0 | 3.0 | 3.0 | 3.5 | **3.33 / 5** |
| 5. Powerlifter | 4.0 | 3.0 | 3.0 | 3.0 | 3.0 | 3.5 | **3.25 / 5** |
| 6. Fat-Loss User | 3.5 | 3.0 | 2.5 | 3.0 | 3.0 | 3.0 | **3.00 / 5** |
| 7. Time-Constrained | 4.0 | 3.0 | 2.0 | 3.0 | 2.5 | 3.0 | **2.92 / 5** |
| 8. Detail Athlete | 3.5 | 3.0 | 3.0 | 2.5 | 3.0 | 3.0 | **3.00 / 5** |
| 9. Returning User | 3.0 | 2.5 | 3.0 | 3.0 | 3.5 | 3.0 | **3.00 / 5** |
| 10. Interrupted User | 4.5 | 3.0 | 3.5 | 3.0 | 3.0 | 3.0 | **3.33 / 5** |
| 11. Minimalist | 3.0 | 2.0 | 2.5 | 2.5 | 3.5 | 3.0 | **2.75 / 5** |
| 12. Accessibility User | 3.5 | 2.5 | 2.0 | 2.0 | 2.5 | 2.5 | **2.50 / 5** |
| **Average** | **3.62** | **2.75** | **2.75** | **2.75** | **3.04** | **3.04** | **2.99 / 5** |

### Key Takeaways from Round 1 Simulation
1. **Hierarchy (2.75/5) and Visual Comprehension (2.75/5) are the lowest rated areas.** Every user type complains about too many competing cards, inconsistent typographic scale, and buried controls.
2. **The "One-Size-Fits-All" dashboard fails both ends:** Beginners (Persona 1) and Minimalists (Persona 11) are drowned in DOTS/RPE/powerlifting cards, while Powerlifters (Persona 5) and Detailed Athletes (Persona 8) find charts cramped and attempt planners disconnected.
3. **Active Workout touch ergonomics (2.75/5) need a complete overhaul:** Buttons are too small for sweaty, one-handed gym usage (Persona 7, Persona 12).
4. **Mandatory Solution:** We must introduce a progressive disclosure architecture:
   - **Simple Mode vs Detailed Mode** toggle.
   - **Dashboard Card Customization** (allow hiding non-essential cards).
   - **Ergonomic Active Workout Card** with ≥44px touch targets.
   - **Curated Accent Theme Engine** (preserve Vermilion default, allow personalized palette choices).
