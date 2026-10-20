# Priya's Review — 27, fat loss, busy 9–7, ex-MFP user

**Persona:** Priya, 27. Two years on MyFitnessPal; hates the barcode paywall and the US-centric food DB (try typing "dal tadka" into MFP). Works 9–7, so logging must be fast. Joined ASCEND for Indian food support + free barcode. Goal: lose fat. Read-only code analysis on branch `feat/overnight-build`, with the offline parser executed under vitest for empirical checks.

---

## 1. First impression (30 seconds in)

Splash → welcome → goals screen. The goal picker reads "Calorie deficit, keep lean mass" under Lose Fat (checked `src/components/onboarding/FitnessGoalsScreen.tsx` in a sibling review — the lose-fat subtitle is the clearest of the bunch, genuinely speaks my language). Then experience, then personal details (name/gender/age/weight/height), then a workout-plan offer, then home. The whole flow takes under a minute and never asks for an email upfront if I tap Continue as Guest.

**The gap I feel immediately:** at no point does anyone tell me my calorie target. Onboarding computes it silently (`calculateRecommendedMacroGoals` in `src/components/Onboarding.tsx:327-337`, never displayed on any screen) and drops me onto a training-led home page. A fat-loss user onboarding without being told "your target is 1,489 kcal and here's why" is a missed moment — MFP shows you the number and the math at minute two. Here I have to find the Meals page and squint at the calorie ring.

## 2. What worked for her specifically

- **The Indian food DB is the best thing in the app.** `src/lib/macros.ts` FOOD_DB has ~450 entries with genuinely Indian coverage: roti/chapati/naan/paratha, 7 dal variants, sabjis (aloo gobi, bhindi masala), poha/upma/idli/dosa (9 dosa variants), khichdi, sambar, sattu, soya chunks, chaats, 30+ sweets, Maggi masala noodles. This is exactly the DB gap that drove me off MFP, and it's real.
- **"2 rotis and 1 bowl dal" parses to 470 kcal / 24.4g protein offline** — I ran `parseNaturalMealOffline` under vitest and it matches. The quick-logger on the Meals page (MealsPage.tsx:2103) needs no quantity math: "1 bowl dal" → 200g bowl → 232 kcal. For a 9–7 schedule, typing one sentence per meal is as fast as logging gets.
- **The offline fallback works.** The quick logger tries the AI API first (`/api/ai/parse-meal`) and falls back to the local IFCT-calibrated parser when the network dies (`src/components/MealsPage.tsx:960-986`). On the metro with no signal, my lunch still logs.
- **Free barcode with a manual-entry safety net.** Barcode scans look up a curated Indian-products catalog (37 entries — MuscleBlaze, Quaker, Saffola, Epigamia in `src/app/api/barcode/route.ts`) then Open Food Facts, and a not-found scan gives an editable "not in database" card whose values are saved as a custom barcode for next time (`src/components/BarcodeScannerModal.tsx:168-185`, `src/lib/storage.ts:163-182`). The thing I paid MFP for is free here, and the manual path is honest.
- **Favorites, frequent foods, and Copy Yesterday** (`src/components/MealsPage.tsx:1743-1760, 1709-1741`). I eat roughly the same lunch 5 days a week. Day 3 onward, logging my lunch is one tap. This is the feature that keeps a busy person logging past week 1.
- **The daily pacing badge is honest about the deficit:** "Deficit Preserved (X kcal under ceiling)" / "Over Deficit Limit (+X kcal)" (`src/components/MealsPage.tsx:1011-1031`), with the only place in the app that explains the target math: *"1,489 = 1,939 maintenance − 450 deficit · ≈0.45 kg/week. Targets stay above a 1,400 kcal safety floor. Weigh yourself weekly — the trend matters more than any single day."* (`src/components/MealsPage.tsx:1991-2006`). This is exactly the explanation onboarding should have given me. Buried treasure.
- **Absurd-quantity guard:** "100 rotis" is refused instead of logging 12,000 kcal (`getAbsurdQuantityWarning`, `src/lib/macros.ts:1134`; wired into both save paths at `src/components/MealsPage.tsx:747,903`). And junk input ("asdfgh") can't become a phantom 0-calorie meal (`isJunkMealParse`, `src/lib/macros.ts:1121`). MFP lets you log nonsense silently; this doesn't.
- **A restaurant meal works:** "1 plate butter chicken and 2 naan" = 1,121 kcal in my vitest run — realistic, no MFP-style "1 order butter chicken (restaurant)" lottery entry.

## 3. What confused or frustrated her (specific, cite screens/flows)

### The silent 0-kcal pizza — a real bug

I typed "2 rotis and 1 slice pizza" into the offline parser (Friday team lunch, quick-logger). Pizza is **not** in FOOD_DB — no pizza, no burger, no plain "momos", no cola. Result from my vitest run: pizza logs at **0 kcal, flagged `isUnmatched`, and the meal is NOT rejected as junk** because `isJunkMealParse` requires *all* items to be unrecognized (`src/lib/macros.ts:1121-1130`). The quick-logger then saves the meal immediately with **no review step and no warning about the unmatched item** (`src/components/MealsPage.tsx:960-986` — contrast the manual builder, which does show an "Not found in offline database — enter custom macros" banner at `:2964`). The toast says "Logged 2 items: ~238 kcal." My 300+ kcal slice of pizza evaporated, and the pacing badge cheerfully reports "Deficit Preserved." This is the worst kind of fat-loss bug: the app tells me I'm under target when I'm not, and I'd never know unless I audit every meal. The fix: in the offline fallback path, surface unmatched items (the data is already on the FoodItem) instead of silently logging them — or block quick-log when any item is unmatched, the same way junk input is blocked.

### Onboarding never explains the number — and never shows it

The goal screen says "Calorie deficit, keep lean mass" but **no onboarding screen displays the calorie target or the deficit** (`src/components/Onboarding.tsx` screens: goals → experience → details → plan_offer → home; `calculateRecommendedMacroGoals` is called silently at `:327-337`). My target only exists as tiny text on the Meals page (see section 2 — literally `text-3xs`/`text-4xs` classes, the smallest type in the app). The deficit answer I wanted on Day 1 — "what's my number and why?" — exists in the code but is treated like a footnote. Move that two-line explanation into onboarding and the home fuel card.

### The maintenance estimate is a one-size-fits-all lie for a desk worker

`calculateMaintenanceCalories` (`src/lib/macros.ts:1165-1184`) = Mifflin-St Jeor **× 1.4 "active trainee" factor, hardcoded**, with no activity-level question in onboarding. For me (27F, 65kg, 165cm, desk 9–7): maintenance 1,939 → target **1,489 kcal**. If I train 2–3×/week at a desk job, my true maintenance is likely ~1,650-1,750, so my "450 kcal deficit" is really ~150-250 — the scale won't move and the app has no mechanism to notice. Which brings me to:

### The "dynamic nutrition" engine is dead code — Day 7 has no answer

`src/lib/coach-engine.ts:1077-1240` contains genuinely good work: a least-squares weight-trend regression (`analyzeWeightTrend`, needs 4+ weigh-ins over 7+ days) and `suggestCalorieAdjustment` — which would tell me "scale is flat, trim 125 kcal, reassess in two weeks" and answers the plateau case with sane coaching copy. **But nothing renders it.** I grepped the entire `src/` tree: `suggestCalorieAdjustment` and `analyzeWeightTrend` are imported only by `src/lib/use-coach-digest.ts`, and `useCoachDigest` is **imported by zero components**. `src/lib/store.ts` imports only `detectStalls` and `calculateReadiness` from the coach engine. So on Day 7, when I ask "why am I not losing weight?", the app shows me a weight chart (ProgressPage) and nothing else. No trend-adjusted calories. No plateau detection. No coaching answer. The engine that would make this app better than MFP exists and is wired to nothing. MFP at least shows me the weekly average; here the best tool I have is my own eyeballs on a chart. This is the single biggest product failure in my week.

### 143g protein on 1,489 kcal is punishing and nobody says so

`calculateRecommendedMacroGoals` (`src/lib/macros.ts:1186`) sets lose_fat protein to **2.2 g/kg** — 143g for me, 38% of my calories. My whole dal+roti lunch gave 24g. Hitting 143g on an Indian home diet without three whey scoops a day is a part-time job, and the app presents it as a plain number with zero guidance (no "here's how to hit this on veg", no graduated ramp — MFP at least defaults to a reachable ~90-100g and lets me adjust up). The protein pacing badge does say "24g protein needed to spare lean mass" (fine), but the header copy around it — "Maintaining caloric deficit to oxidize fat stores while preserving lean tissue", "Protein target met (anti-catabolic)" (`src/components/MealsPage.tsx:1024-1031`) — is gym-bro jargon I don't use. "Oxidize fat stores"? I want "you're under your calorie goal today" in words I'd say to a friend.

### Friction points in the logging flows

- The **manual meal builder now REQUIRES a meal name** (`src/components/MealsPage.tsx:715-722`, "Meal Name Required" toast). MFP asks for nothing. Every extra required field is a day-14 drop-off risk for someone logging on a lunch break.
- **Reminder settings can lie.** The Reminder Center lets me set breakfast/lunch/dinner times and the save modal closes with "Reminder preferences saved" — but delivery runs through a server dispatch route that needs `CRON_SECRET`/QStash (`src/app/api/notifications/dispatch/route.ts:135-139`), and there is **no client-side reminder scheduler in this branch** (no `setInterval`/`setTimeout` in the notification libs; prefs save locally + POST to `/api/notifications/preferences`). I have push-dependent reminders with no working local fallback on this branch, and the success toast fires even if I denied notification permission (permission is requested *after* close, fire-and-forget — `src/components/ReminderCenterModal.tsx:119-165`). For my 9–7 life, a lunch-logging reminder that never arrives is a broken promise; don't toast success for a pipeline that can't complete.
- Fast-food gaps in FOOD_DB: **no pizza, no burger, no cola/cold drink** entries. My office-adjacent diet isn't all dal and roti. Fuzzy matching can't save a key that doesn't exist.

### Nits

- Safe floors are inconsistent: `calculateRecommendedMacroGoals` clamps lose_fat at **1,400** (`src/lib/macros.ts:1199`) but the coach engine's `SAFE_MIN_CALORIES` is **1,200 for women** (`src/lib/coach-engine.ts:1146`). One codebase, two safety lines.
- The smaller-me variant (55kg woman): target clamps to 1,400 and `calorieDelta` honestly shows −338 instead of −450 — good, but again, explained nowhere at onboarding.

## 4. Would she keep using it after week 1? Why/why not

**Borderline yes, for one reason only: Indian food logging is genuinely faster here than anywhere else.** The quick-logger + favorites + copy-yesterday combo means my daily logging takes ~90 seconds, and the Indian DB coverage is better than MFP's by a mile. If logging cost were the only axis, I'd stay.

But I'm wavering, because the *point* of the app for me is fat loss, and everything past logging is where it thins out: nobody told me my target with reasoning, my protein goal is unreachable without guidance, the mixed-meal silent bug made me distrust the numbers, and Day 7 gave me a chart instead of an answer. MFP's food DB annoys me daily, but its weekly nutrition view answers "am I on track?" better than this does right now. I'll keep it installed for week 2, but I'm one stagnant fortnight away from deleting it.

## 5. What would make her delete it or go back to MyFitnessPal

1. **One stagnant fortnight with no coaching answer.** If the scale is flat for 2 weeks and the app's only advice is a weight chart, I'm gone. The trend engine is written — wire it up or this app's fat-loss story ends at "fancy food diary."
2. **Discovering the silent undercount.** The moment I realize my Friday pizza logged as 0 kcal and the app congratulated me on a preserved deficit, trust is dead. Silent data corruption is unforgivable in a tracking app.
3. **Reminder promises that don't deliver.** If I set meal reminders and never get one, the app trained me to forget logging.
4. **143g protein with no plan.** If hitting my protein target requires me to figure out Indian high-protein eating entirely alone, the target becomes decoration. MFP's lower default + big community recipe DB beats a "better" number I can't reach.
5. The training-led home page (readiness scores, XP, PRs) is all gym-centric chrome for a user whose goal is fat loss. I don't need it to go away — but nothing on Home speaks to *my* goal except the small fuel card.

## 6. What MFP/MacroFactor do better for fat loss

- **MacroFactor:** the gold standard for my question — it takes my weigh-ins + logged intake, computes my *actual* expenditure from the trend, and auto-adjusts my calories. ASCEND literally has this engine written (`suggestCalorieAdjustment`, `src/lib/coach-engine.ts:1139`) and ships none of it. This is the feature gap that decides whether I stay.
- **MFP:** a weekly nutrition summary (7-day calorie average vs target) so one bad day doesn't define the week. ASCEND's MealsPage has no weekly adherence view at all — everything is today-or-nothing, which is exactly the wrong psychology for fat loss. MFP also defaults protein to a reachable number and lets me raise it, instead of starting at 2.2 g/kg with no on-ramp.
- **MFP:** names nothing. No required meal names, no mandatory anything between me and a logged meal.
- **MFP community:** 14M+ foods means my office pizza *exists*. ASCEND's curated DB wins on Indian home food but loses on everything adjacent to it.

## 7. Rating out of 10

**6.5 / 10.**

It's a 9/10 food *database* for my diet wrapped in a 5/10 fat-loss *coach*. The logging experience is the best Indian food logging I've used anywhere — fast, offline-capable, free barcode, smart quantity parsing. But a fat-loss app that silently undercounts my worst meals, hides my target's reasoning, never asks about my activity level, and ships a disconnected weight-trend engine isn't coaching me — it's filing my food. Wire up `suggestCalorieAdjustment`, add a weekly adherence view, fix the unmatched-item quick-log bug, and show the deficit math at onboarding: that's a 9.

---

*Notes on method: FOOD_DB coverage and parser behavior verified by executing `parseNaturalMealOffline` and `calculateRecommendedMacroGoals` under vitest (test file removed after run). Dead-code claim for `useCoachDigest`/`suggestCalorieAdjustment` verified by repo-wide grep — the only importer of `use-coach-digest.ts` is itself, and `store.ts` imports only `detectStalls`/`calculateReadiness` from the coach engine.*
