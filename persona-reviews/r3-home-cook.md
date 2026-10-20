# R3 — Home-Cook Mother, 42 (cooks dal/sabzi her way, logs for the family)

**Verdict: 6/10** — "My version" is the feature she has wanted from every food app, and the save → search → re-log loop is airtight. The servings bug hit exactly her pattern (family-size portions) before the fix.

## What worked
- Save-as-my-version loop verified end-to-end in code: she sets her dal's real values + ghee level once; it tops search ahead of the DB entry, restores the exact portion snapshot, and quantity changes scale it proportionally.
- Updating her version replaces the old one (no duplicate "my dal" entries piling up).
- Recipe assumptions on DB dishes ("assumes 1 tsp ghee tadka") respect her intelligence — she can see what the generic entry presumes before overriding it.

## Issues found
1. **[High — FIXED] Oil adjustment ignored portion size.** She logs 2 katori of dal tadka for the family and sets ghee to "None": the app removed only 1 of the 2 assumed tsp (348 kcal shown instead of 312). At "1 tbsp" it under-added by the same factor. `withOilLevel`/scan now scale the delta by servings in the portion. Commit `f732139`.
2. **[Medium — open] One version per dish name.** Saving "my Dal Tadka" replaces the previous save of that name. Her weekday dal and her Sunday rich dal can't coexist — she'd need to name one differently (e.g. type a custom name), which the flow doesn't hint at.
3. **[Medium — open] "My versions" don't sync.** Custom foods persist on-device and in the backup file, but there is no Supabase table for them — a phone switch without a backup export loses the family's recipes. (Phase 1 brief specified backup persistence; server sync needs a new table, which the REST-only connector can't create.)
4. **[Low — FIXED] Favorites/history path dropped the ghee prompt** — her repeat-logging path; fixed in `15a95e6`.

## Bottom line
The household-recipe moat works as designed. The two open items (multiple variants per dish, cloud sync of custom foods) are the difference between a great week and a great year of retention for her.
