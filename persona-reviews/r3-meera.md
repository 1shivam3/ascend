# R3 — Meera, 29, Type-2 Diabetic (returning persona — safety pass)

**Verdict: 5/10** — No dangerous numbers, and carbs are visible on every new dish. But the fasting modes coached eating patterns that interact with her medication without any caution until this round's fix. Safety copy is not optional for this user.

## What worked
- Every curated Indian dish exposes carbs per household unit in the builder — the number she actually doses her day by.
- Festival day (+400 kcal) is explicitly user-chosen and framed as a buffer, not a target to hit.
- Whole-day adaptation never mutates her saved goals; it suggests, with reasons.

## Issues found
1. **[High — FIXED] Fast modes had no medical caution.** "One-meal day: …try to get most of it [protein] into that one meal" — for a type-2 diabetic on glucose-lowering medication, long meal gaps are a hypoglycemia risk, and the note said nothing. Both fast-mode notes now advise checking with a doctor first when diabetic or on such medication. The festival note (not a fast) deliberately carries no such caution. Commit `6839d34`.
2. **[Medium — open] Protein coach is condition-blind.** If Meera is vegetarian, the coach may suggest a 50 g sattu drink (~32 g carbs) or 500 ml milk (~24 g carbs) without any carb awareness. The anchors are ordinary foods (not unsafe advice), but a diabetic-aware ordering would rank paneer/tofu/greek yogurt first for her. No health-condition plumbing exists in the coach to gate on — flagged, not hacked around.
3. **[Medium — open, carried from R2] Sugar visibility is still barcode-only.** The new Indian dishes carry no `sugarG`; the day sugar total only appears when a barcode food was logged. Jaggery-sweetened dishes and festival sweets show carbs but no sugar split.
4. **[Low] Sabudana-heavy fasting guidance.** The no-grain note points to sabudana meals; sabudana is near-pure starch (now correctly valued at 28 g carbs/100 g after the R3 entry fix) — fine as information, worth her knowing, and the corrected values at least stop the app from understating it.

## Bottom line
Nothing in Phase 1 would harm her, and the fasting caution now closes the one real safety gap. Condition-aware coaching remains the honest open item.
