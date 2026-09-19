# ASCEND — Progression & Gamification Systems

## 1. Core Progression Philosophy & Separation of Concerns

Progression in ASCEND is strictly **deterministic, auditable, and mathematically grounded**. 
AI never mints XP, alters levels, or awards ranks. All progression is governed by immutable mathematical functions executed identically on client and server.

### 1.1 Decoupling Global Attributes from Exercise Mastery
A critical design mandate of ASCEND is the separation between an athlete's global archetype attributes and their specific exercise mastery:

$$\text{Global Strength} \neq \text{Bench Press Mastery}$$

* **Global Attributes (STR, STA, AGI, DIS, VIT):** Macro-level character attributes representing overall physical capacity, aggregate work capacity, consistency, and athletic balance on a 1–100 scale.
* **Exercise Mastery:** Micro-level technical proficiency and progressive overload on a specific movement pattern (e.g., Bench Press, Low-Bar Squat, Pull-Up) on an independent 1–100 Lift Level scale.

#### Example Scenario
An athlete with **Global Level 42** may possess:
* **Strength: 74** (driven by high multi-year aggregate tonnage across all upper/lower compounds)
* **Bench Press Lift Level: 27** (solid intermediate progress)
* **Squat Lift Level: 24** (recently restarted after a minor ankle mobility reset)
* **Deadlift Lift Level: 31** (high mechanical proficiency and heavy 1RM)
* **Overhead Press Lift Level: 18** (lagging overhead development)

This ensures the RPG system mirrors real-life athletic reality: a lifter can be generally powerful overall while possessing distinct, lagging, or elite individual lifts.

---

## 2. Mathematical Formulations

### 2.1 Estimated One-Rep Max (1RM) Formula
To prevent single-formula bias (Epley tends to overestimate high reps; Brzycki becomes unstable above 10 reps), ASCEND implements a **Dampened Hybrid Brzycki-Epley Curve**:

$$\text{1RM}(w, r) = 
\begin{cases} 
w & \text{if } r = 1 \\
\frac{1}{2} \left[ \left( w \cdot \left(1 + \frac{r}{30}\right) \right) + \left( \frac{w \cdot 36}{37 - r} \right) \right] & \text{if } 2 \leq r \leq 10 \\
w \cdot \left(1 + \frac{r}{30}\right) \cdot \delta(r) & \text{if } r > 10 
\end{cases}$$

Where $\delta(r)$ is a dampening penalty for high-rep endurance sets:
$$\delta(r) = \left(\frac{10}{r}\right)^{0.12}$$

*Rationale:* A 20-rep set of 100kg technically yields an astronomical mathematical 1RM in unconstrained formulas, but reflects muscular endurance rather than peak neural limit strength. The dampening curve clamps high-rep skewing.

---

### 2.2 Exercise Mastery System Formulas

#### A. Mastery XP per Set ($MXP_{set}$)
For each completed work set of an exercise:

$$MXP_{set} = \left( r \times \frac{w}{\max(\text{1RM}_{base}, 20)} \times 12 \right) \times M_{type} \times M_{RPE}$$

Where:
* $w$ = Weight lifted (kg).
* $r$ = Repetitions completed.
* $\text{1RM}_{base}$ = Athlete's historical best 1RM on this exercise (normalizes effort across different strength baselines).
* $M_{type}$ = Set Type Multiplier:
  * Normal Set: $1.0$
  * Top / Failure Set: $1.25$
  * Drop Set: $0.85$
  * Warmup Set: $0.20$
* $M_{RPE}$ = Rate of Perceived Exertion Multiplier:
  $$M_{RPE} = 0.70 + (0.05 \times \text{RPE}) \quad \text{for } \text{RPE} \in [6, 10]$$

#### B. Mastery Session Completion Bonus
Upon completing a workout, each trained exercise gains an efficiency bonus:
$$MXP_{session} = \sum MXP_{set} + \text{Bonus}_{PR} + \text{Bonus}_{Consistency}$$
* $\text{Bonus}_{PR} = 150 \text{ XP}$ (if any all-time PR was achieved for that movement in the session).
* $\text{Bonus}_{Consistency} = 50 \text{ XP} \times \min(\text{Consecutive Weeks Trained}, 4)$.

#### C. Exercise Mastery Level Curve (1–100)
The cumulative Mastery XP required to advance from Lift Level $L-1$ to $L$:

$$MXP_{req}(L) = \left\lfloor 180 \cdot L^{1.65} + 60 \right\rfloor$$

| Lift Level ($L$) | Mastery Title Tier | Cumulative XP Required | Est. Training Duration |
| :--- | :--- | :--- | :--- |
| **1–19** | Novice | 0 – 3,250 XP | Weeks 1–4 |
| **20–39** | Apprentice | 3,251 – 15,800 XP | Months 2–4 |
| **40–59** | Specialist | 15,801 – 43,200 XP | Months 5–10 |
| **60–79** | Master | 43,201 – 95,000 XP | Years 1–2 |
| **80–99** | Grandmaster | 95,001 – 185,000 XP | Years 2–4 |
| **100** | Paragon / Ascendant | 185,001+ XP | Lifetime Dedication |

---

### 2.3 Global Character XP & Leveling Engine

#### A. Global XP Sources
1. **Set Completion:** $XP_{set} = 15 + (\text{RPE} \times 2) + (\text{is\_failure} ? 10 : 0)$.
2. **Workout Session Completion:**
   $$XP_{session} = 120 + \left( \frac{\text{Tonnage (kg)}}{500} \times 10 \right) + \left( \frac{\text{Duration (min)}}{10} \times 8 \right)$$
   *(Capped at 400 XP per session to prevent unhealthy over-training).*
3. **Personal Record Broken:** $100 \text{ XP}$ per PR (Max Weight, Max Reps, Max Volume, Max 1RM).
4. **Daily Quests:** $75 \text{ XP}$ per completed directive.
5. **Weekly Feats:** $250 \text{ XP}$ per completed feat.
6. **Streak Multiplier:**
   $$M_{streak} = 1.0 + \min(0.02 \times \text{Streak Days}, 0.30) \quad (\text{Up to } +30\% \text{ bonus})$$

#### B. Global Level Curve (1–100)
The total XP required to reach Global Level $N$:

$$XP_{global}(N) = \left\lfloor 240 \cdot N^{1.82} + 100 \right\rfloor$$

#### C. Character Ranks
| Rank Tier | Level Range | Heraldry Title | Division System |
| :--- | :--- | :--- | :--- |
| **Rank I** | 1 – 19 | Initiate | Division IV → I (every 5 levels) |
| **Rank II** | 20 – 39 | Adept | Division IV → I |
| **Rank III** | 40 – 59 | Vanguard | Division IV → I |
| **Rank IV** | 60 – 79 | Centurion | Division IV → I |
| **Rank V** | 80 – 99 | Sovereign | Division IV → I |
| **Rank VI** | 100+ | Ascendant | Sovereign Grand Tier |

---

## 3. Character Attributes System (1–100)

Attributes are normalized composite indices reflecting training stimulus over a rolling 90-day window:

```
          [ STRENGTH ]
          /          \
         /            \
  [ AGILITY ]      [ STAMINA ]
      |                 |
      |                 |
  [ VITALITY ]───[ DISCIPLINE ]
```

### 3.1 Mathematical Definitions

1. **Strength (STR):**
   $$\text{STR} = \min\left(100, \; 10 + 25 \cdot \log_{10}\left(1 + \frac{\text{Compound Heavy Volume}_{90d}}{25,000}\right) + 15 \cdot \left(\frac{\text{Wilks / Relative 1RM Ratio}}{2.5}\right)\right)$$
   *Drivers:* Sets with $\text{RPE} \geq 8$ on primary compound movements (Squat, Bench, Deadlift, OHP).

2. **Stamina (STA):**
   $$\text{STA} = \min\left(100, \; 10 + 30 \cdot \left( \frac{\text{Total Reps}_{30d}}{2,500} \right) + 20 \cdot \left( \frac{\text{Avg Density (kg/min)}}{150} \right)\right)$$
   *Drivers:* High rep sets ($>10$ reps), superset completions, low rest interval adherence ($<60$s).

3. **Agility (AGI):**
   $$\text{AGI} = \min\left(100, \; 10 + 40 \cdot \left( \frac{\text{Bodyweight / Calisthenics Volume}}{\text{Total Volume}} \right) + 30 \cdot \left( \frac{\text{Unilateral Sets}}{\text{Total Sets}} \right)\right)$$
   *Drivers:* Pull-ups, dips, lunges, Bulgarian split squats, plyometrics, mobility work.

4. **Discipline (DIS):**
   $$\text{DIS} = \min\left(100, \; 10 + 45 \cdot \left( \frac{\text{Current Streak}}{30} \right) + 35 \cdot \left( \frac{\text{Scheduled Sessions Completed}}{\text{Scheduled Sessions Planned}} \right)\right)$$
   *Drivers:* Consistency, training on scheduled plan days, completing daily quests.

5. **Vitality (VIT):**
   $$\text{VIT} = \min\left(100, \; 10 + 40 \cdot \left( \frac{\text{Rest Days Respected}}{\text{Planned Rest Days}} \right) + 30 \cdot \left( \frac{\text{Deload Adherence}}{1} \right) + 20 \cdot \text{Sleep/Water Ratio}\right)$$
   *Drivers:* Proper deloads, logging rest days, completing active recovery routines.

---

## 4. Streak Engine & Rest Day Grace Mechanics

### 4.1 The Rest Day Grace Rule
To prevent lifters from burning out due to gamified streak pressure:
* A scheduled Rest Day in an active workout plan **never breaks a streak**.
* If an athlete logs a Rest Day as "Rest / Regeneration", their streak counter advances by +1, and they are awarded $+40 \text{ Vitality XP}$.
* If an unplanned day off occurs:
  * If the user holds a **Streak Freeze Token** (maximum 2 held), one token is automatically consumed. The streak is preserved.
  * If no tokens exist, the streak resets to 1 on the next logged workout (the longest streak stat remains preserved).

### 4.2 Streak Freeze Earning
* Achieving a 14-day streak grants **+1 Streak Freeze Token** (up to a hard cap of 2).

---

## 5. Anti-Cheat & Input Anomaly Safeguards

To maintain the integrity of global leaderboards and personal records, all logged numbers pass through a **Deterministic Plausibility Filter**:

```
Logged Set Input: (Weight: W, Reps: R)
  │
  ├──► Check 1: W <= 550 kg (1,212 lbs) [Clamped to world record threshold]
  ├──► Check 2: R <= 100 reps per set
  ├──► Check 3: 1RM Delta Check:
  │      If (New_1RM > Best_Historical_1RM * 1.35) AND (Best_Historical_1RM > 60kg)
  │      ──► Trigger Anomaly Flag
  │
  └──► Anomaly Flagged:
         - Local log preserved for user
         - Set excluded from public leaderboard
         - UI prompts: "Extreme PR detected. Please confirm entry: 250kg x 8 reps?"
```
