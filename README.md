# ASCEND — Strength & Progression Web App

ASCEND is a minimalist, mobile-first strength tracking web application built with **Next.js 14 (App Router)**, **Tailwind CSS**, and **TypeScript**.

---

## Key Features

1. **Personal Records & Real Strength Standards (Levels 1 to 100)**:
   - Calculate your **exact 1RM** using the validated Epley formula ($1\text{RM} = \text{weight} \times (1 + \frac{\text{reps}}{30})$).
   - Ranks your lifts from **Level 1 to 100** based on real bodyweight-to-lift strength ratios (with gender multipliers).
   - Awards cool progression titles for each tier:
     - *First Steps* (1–10)
     - *Iron Initiate* (11–20)
     - *Steel Apprentice* (21–30)
     - *Forge Bound* (31–40)
     - *Iron Forged* (41–50)
     - *Steel Tempered* (51–60)
     - *Iron Will* (61–70)
     - *Titan Rising* (71–80)
     - *Apex Predator* (81–90)
     - *Mythic* (91–100)
   - Categorizes ranks into *Untrained*, *Beginner*, *Novice*, *Intermediate*, *Advanced*, *Elite*, and *World Class*.
   - Computes an **Overall Strength Level** and composite title across all your lifts.

2. **Daily Hard-Hitting Quote**:
   - A curated roster of 60 real motivational quotes from legendary athletes, philosophers, and coaches (Rollins, Socrates, Schwarzenegger, Goggins, Bruce Lee, Ali).
   - Automatically synchronizes to the day of the year for a fresh daily boost.

3. **Workout Logger**:
   - Fast, streamlined workout recorder.
   - Add exercises, track sets, weights, and reps in your preferred unit (`kg` or `lbs`).
   - Detailed expandable session history with total sets and exercise counts.

4. **Meal & Macro Estimator**:
   - Type in foods (e.g. *chicken breast, eggs, rice, oats, whey protein, avocado*), and it automatically estimates calories, protein, carbs, and fat based on quantity and serving units (`g`, `ml`, `piece`, `scoop`, `slice`, `tbsp`, `oz`).
   - All macros remain fully editable so you can customize them based on exact food labels.
   - Real-time daily macro totals (Kcal, Protein, Carbs, Fat) displayed at the top.

5. **Pure Zero Dummy Data**:
   - Clean slate: starts with zero placeholder PRs, fake workouts, or mock stats.
   - Clean onboarding asks for your name, gender, and bodyweight once so all strength math is 100% accurate from your first PR.
   - Persisted locally in browser `localStorage` with instant hydration.

6. **Fast, Mobile-First PWA UI**:
   - Dark theme with warm gold accents (`#e5c07b`) on deep charcoal surfaces (`#0a0a0a`).
   - Mobile bottom navigation bar with safe-area support.
   - Installable on mobile home screens as a PWA (Progressive Web App).

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build production bundle
npm run build

# Start production server
npm start
```
