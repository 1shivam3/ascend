# R3 — Weight-Loss User, 26 (relies on photo scan)

**Verdict: 6/10** — The scan flow's design is the most honest in the category (drafts in katori, ghee question front and center). Two accounting leaks between "what the AI said" and "what got saved" were quietly breaking her trust math until this round.

## What worked
- Scan drafts land in household units when grams map cleanly (300 g dal → "2 katori"), grams otherwise — she thinks in katoris.
- The ghee/oil prompt is in the review step per item, defaulted to the dish's DB assumption, one tap to change. This is the only scan flow that admits the camera can't see tadka.
- Portion feedback loop ("rice was about 250 g") re-runs analysis instead of forcing manual edits.

## Issues found
1. **[High — FIXED] Ghee correction ignored portion size in scan too.** A 300 g (2 katori) dal scan set to "None" removed only 1 of the 2 assumed tsp — her deficit math was off by 36 kcal on one item, ~70+ kcal across a thali. Scan review + save now scale by servings (`servingsForOil` on estimated grams). Commit `f732139`.
2. **[Medium — FIXED] The save toast quoted the AI's numbers, not the saved ones.** Toast said "~600 kcal" while the ghee-adjusted foods actually saved ~670 kcal — her day total jumped more than announced, the exact trust leak this feature exists to prevent. Toast and protein progress now sum the adjusted saved foods. Commit `c0b1d6b`.
3. **[Low — open] AI item names that miss the curated list get no ghee prompt.** If the AI returns a generic name that doesn't resolve to a curated dish (e.g. "lentil curry"), `defaultOilForFood` returns null and no oil question is asked — the undercount the prompt exists to fix slips through silently. Mitigated by the refinement-notes field, but a generic "oil used in cooking?" fallback for unmatched curries would close it.

## Bottom line
After fixes, the number she is told is the number that lands in her day — the whole point for a deficit user.
