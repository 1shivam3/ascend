# R3 — Hostel Student, 20 (mess thali daily, tight budget)

**Verdict: 5/10** — The item-by-item logging is genuinely good, but his actual meal — "thali" — did not exist in the app until this round's fix. A hostel student's core use case was the one thing search couldn't find.

## What worked
- Text quick-log of a mess lunch is excellent: "2 roti, 1 katori dal, 1 katori sabzi, 1 katori rice" parsed to 649 kcal / ~25 g protein with correct katori weights (dal 150 g, sabzi 120 g).
- Household units everywhere in the builder — he thinks in katoris, not grams.
- Veg thali protein (~22 g/plate) plus curd makes budget protein tracking plausible.

## Issues found
1. **[High — FIXED] "Thali" was unloggable.** `getFoodSuggestions('thali')` returned `[]`; `parseNaturalMealOffline('1 thali')` produced an unmatched 0-kcal row. Added a real `veg thali` entry (standard composition, plate ≈ 650 g → 702 kcal, assumption text lists the parts). Commit `643e3b8`.
2. **[High — FIXED] "1 thali" then weighed 100 g.** First parse after adding the entry matched the dish but used the generic 100 g piece weight → 108 kcal for a ~700 kcal plate. `PIECE_WEIGHTS` now maps thali → 650 g. Commit `d13ecc2`.
3. **[Medium — FIXED] Favorites lost the ghee prompt.** He favorites his 4 mess items and re-adds them daily; the Favorites path stripped oil state, so "Ghee/oil in this?" never appeared on his most-used path. Favorites/history adds now re-attach the DB oil default. Commit `15a95e6`.
4. **[Low — open] Generic 'dal' values exclude the tadka its assumption describes.** Base 'dal' is 0.4 g fat/100 g (plain boiled) while its meta says "light tadka, 1 tsp assumed". His mess dal logs ~0.6 g fat per katori. Small kcal impact (~30 kcal/meal); left for a base-data pass because 'dal' feeds many flows.

## Bottom line
After fixes, his whole day is ~6 taps: favorite thali or quick-log text, adjust ghee once. Before fixes, the app effectively told him his meal didn't exist.
