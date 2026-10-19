# ASCEND Premium + Fun Transformation Plan

## Research Summary

### Gamification (fun, not irritating)
**Do:**
1. **Streak freeze** — Duolingo data: users with freeze access keep streaks 4.5x longer. One free freeze/week, no guilt.
2. **XP + visible levels** — every workout/meal/PR earns XP. Level progress bar always visible. Makes effort tangible.
3. **Monthly challenges** — time-boxed ("Log 12 workouts this month"), opt-in, with badge rewards. No punishment for skipping.
4. **PR celebrations** — surprise delight moment when hitting a personal record. Confetti, not popups.
5. **Variable rewards** — occasional surprise badges ("Night Owl" for late workouts). Unpredictable = delightful.

**Don't (anti-patterns):**
1. No guilt-tripping ("You broke your streak!") — always encouraging, never shaming
2. No notification spam — max 1/day, user controls timing
3. No paywalled streaks or XP — everything earnable free
4. No complex point systems — XP should be simple (workout=100, meal=20, PR=50)
5. No leaderboard anxiety — opt-in only, small groups, no public shaming

### Premium Design
**Illustration style: Soft-flat minimal vector** — 2D, warm, human, diverse characters. Reads premium, files stay small (WebP <100KB).

**5 premium rules:**
1. Generous whitespace — breathing room = expensive feel
2. Tabular numerals for all stats (alignment = precision)
3. Consistent illustration style everywhere (no mixed styles)
4. Subtle motion — 200ms ease-out micro-interactions, celebration only for real wins
5. Dark mode: elevated surfaces (not pure black), desaturated colors

**Where pictures matter most (by impact):**
1. Onboarding (first impression)
2. Empty states (turn "nothing here" into delight)
3. Exercise demos (novices don't know the movements)
4. Achievements/badges (tangible rewards)

**What looks cheap (avoid):**
1. Stock photos mixed with illustrations
2. Cluttered cards with too many stats
3. Aggressive gradients and neon colors
4. Tiny tap targets

### Novice Audit Findings (brutal)
**Jargon that confuses beginners:**
- "Hypertrophy", "progressive overload", "RPE", "RIR", "DOTS", "1RM", "AMRAP", "macrocycle", "deload", "Zone 2", "CNS", "mechanical tension"
- Goal taglines: "Hypertrophy volume, exercise selection, progressive overload" — meaningless to a novice

**Confusing flows:**
1. **Onboarding goals** — taglines are jargon-heavy. Novice doesn't know what "hypertrophy" means.
2. **Train tab** — "Plans" vs "History" is clear now, but "Built-in Routines" still confusing. Why are there workouts I didn't make?
3. **Active workout** — RPE picker says "@7/@8/@9" — novice doesn't know what @ means. (Has "Easy/Target/Hard" which helps, but @ is cryptic.)
4. **Progress page** — "DOTS Score & Standards" — completely opaque. "Pound-for-pound strength formula" doesn't explain it.
5. **Meals** — "macros", "micros" — novice doesn't know. "Log meal" is clear, but macro breakdown is jargon.

**Overwhelming screens:**
1. **Settings** — too many options, no hierarchy. Novice doesn't know what "RPE scale" or "DOTS" settings mean.
2. **Progress page** — too many charts at once. Novice wants: "am I getting stronger?" — one clear answer.
3. **Exercise library** — 102 exercises, no guidance. Novice doesn't know where to start.

## Implementation Plan

### Phase A: Pictures
**Style:** Soft-flat minimal vector, warm colors, diverse characters. WebP, <100KB each.

**Onboarding (3 illustrations):**
1. `onboarding-goals.webp` — diverse people with different goals (muscle, fat loss, strength)
2. `onboarding-experience.webp` — beginner to advanced journey
3. `onboarding-welcome.webp` — celebration, "you're in!"

**Exercises (top 30 by usage):**
Barbell Bench Press, Barbell Back Squat, Conventional Deadlift, Overhead Press, Barbell Row, Pull-ups, Lat Pulldown, Incline Dumbbell Press, Seated Dumbbell Shoulder Press, Barbell Bicep Curl, Tricep Rope Pushdown, Leg Press, Romanian Deadlift, Dumbbell Bicep Curl, Dumbbell Lateral Raise, Seated Cable Row, Leg Extension, Lying Leg Curl, Barbell Hip Thrust, Goblet Squat, Push-ups, Dumbbell Bench Press, Incline Barbell Bench Press, Barbell Front Squat, Sumo Deadlift, Chin-ups, Dumbbell Hammer Curl, Skull Crushers, Bulgarian Split Squat, Front Plank

**Empty states (4):**
1. `empty-workouts.webp` — "No workouts yet" (dumbbell character)
2. `empty-meals.webp` — "No meals logged" (plate character)
3. `empty-prs.webp` — "No PRs yet" (trophy character)
4. `empty-photos.webp` — "No progress photos" (camera character)

**Achievements (5 badges):**
1. `badge-first-workout.webp` — First workout complete
2. `badge-streak-7.webp` — 7-day streak
3. `badge-pr.webp` — New personal record
4. `badge-100-workouts.webp` — 100 workouts
5. `badge-early-bird.webp` — Workout before 7am

### Phase B: Fun Mechanics
**1. Streak Freeze**
- 1 free freeze per week, auto-applied if you miss a day
- Visual: snowflake icon on the streak counter when freeze is active
- No guilt: "Streak saved! Take a rest day."

**2. XP System**
- Workout complete: 100 XP
- Meal logged: 20 XP
- PR hit: 50 XP bonus
- Water logged: 5 XP
- Level thresholds: Level = floor(sqrt(totalXP / 100)) + 1
- Progress bar in header, level-up celebration (confetti, not popup)

**3. Monthly Challenges**
- Framework: admin-defined challenges (stored in code, not DB for v1)
- Example: "December Strength" — log 12 workouts, earn badge
- Opt-in via banner (dismissible, never forced)
- Progress tracked automatically

**Anti-irritation rules:**
- Max 1 celebration per session
- All challenges dismissible
- No "you missed" messages — only "welcome back"
- XP never decays, levels never go down

### Phase C: Simplifications (top 5)
**1. Goal taglines → plain English**
- "Build Muscle" → "Get bigger and stronger"
- "Get Stronger" → "Lift heavier weights"
- "Lose Fat" → "Burn fat and get lean"
- (Keep the science in advanced mode)

**2. RPE picker → remove @ numbers for beginners**
- Beginner mode: show only "Easy / Just Right / Hard"
- Advanced mode: show @7/@8/@9

**3. DOTS Score → explain or hide**
- Add subtitle: "Strength compared to your bodyweight"
- Or hide for beginners, show in advanced mode

**4. Settings → group and simplify**
- Group into: Account, Notifications, Appearance, Advanced
- Hide advanced settings (RPE scale, DOTS) behind "Advanced" toggle

**5. Progress page → hero metric**
- Top: "You're getting stronger!" with one clear trend
- Charts below, collapsible

## What NOT To Do
1. Don't add social features (friends, feeds) — scope creep, moderation nightmare
2. Don't do daily challenges — too much pressure, becomes irritating
3. Don't gate features behind XP — everything stays free and open
4. Don't use push notifications for gamification — only for reminders user explicitly set
5. Don't redesign the whole app — surgical improvements only
6. Don't add a mascot character (yet) — test with illustrations first

## File Locations
- Illustrations: `public/images/illustrations/`
- Exercise images: `public/images/exercises/`
- Badges: `public/images/badges/`
- XP logic: `src/lib/xp-system.ts`
- Streak freeze: `src/lib/streak-freeze.ts`
- Challenges: `src/lib/challenges.ts`
