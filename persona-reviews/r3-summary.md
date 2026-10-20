# R3 Summary — Phase 1 (India Food Moat) Persona Round

**Average score: 5.9/10** across 8 food-focused personas (hostel student 5, Meera 5, veg gym-goer 6, home-cook mother 6, South Indian 6, fasting 6, weight-loss 6, office worker 7). Up from R1 4.4 / R2 4.5 (whole-app rounds) — and this round graded a narrower, stronger surface. The pattern flipped vs earlier rounds: the engines *and* the UI are wired; what failed was accounting correctness in the new layer itself.

## Top findings (all verified numerically against code)

1. **Ghee/oil delta ignored portion size** (mother, weight-loss; High). The DB assumption is per serving, but builder + scan applied a single-serving delta to the whole row: 2 katori dal set to "None" kept 1 tsp in the totals; "1 tbsp" under-added by the same factor. → `servingsForOil` scaling, `f732139`.
2. **Idli undercounted 2.5×** (South Indian; High). Per-piece macros (58 kcal) sat in the per-100g slot: 3 idlis logged 70 kcal. Overlay now carries true per-100g values reproducing 58 kcal/piece. → `0f7c151`.
3. **"Thali" didn't exist; sabudana khichdi silently mis-matched** (hostel, fasting; High). Search for the hostel persona's core meal returned nothing and text parse made a 0-kcal phantom row; the vrat staple borrowed moong khichdi's values (protein ~2× overstated). Both are real entries now; "1 thali" also weighs a full 650 g plate in quick-log. → `643e3b8`, `d13ecc2`.
4. **Fast modes coached without a medical caution** (Meera, fasting; High). One-meal/no-grain notes now advise a doctor check when diabetic or on glucose-lowering medication. → `6839d34`.
5. **Protein coach copy overclaimed** (veg gym-goer, office worker; Medium). "Would close most of the gap" for a 24 g anchor against a 50 g gap. Copy now states real coverage; the micro-dinner edge ("dinner near 120 kcal") is suppressed under 250 kcal remaining. → `9769b56`, `6839d34`.
6. **Fuzzy meta traps + trust leaks** (Medium). Plain 'rice' inherited curd rice's assumption/ghee prompt; 'paneer' inherited palak paneer's — substring matching now needs ≥ 0.6 overlap. Scan save toast quoted raw AI totals while adjusted totals were saved — toast now sums what was saved. Favorites/history adds dropped the ghee prompt — re-attached. → `2bff363`, `c0b1d6b`, `15a95e6`.

## Fixed vs left

**Fixed (9 commits):** oil servings scaling (builder + scan), protein-message honesty, adaptation floor, fast-mode diabetes caution, fuzzy meta threshold, idli values, sabudana khichdi + veg thali entries, thali piece weight, scan toast totals, favorites/history oil attach. **981 tests passing** (972 baseline + 9 new regression tests); only failures are the 20 pre-existing Docker-infra ones. tsc clean.

**Left open (with reasons):**
- *One anchor per protein suggestion* — deliberate one-concrete-suggestion design; combo suggestions need a design call.
- *Multiple custom versions per dish name* — saving replaces by name; variants need a naming UX decision.
- *Custom foods don't sync to Supabase* — no table exists and the connector is REST-only; backup-file persistence only (per Phase 1 brief).
- *Protein coach is condition-blind; sugar split exists only for barcode foods* — no health-condition plumbing in the coach; carried limitation from R2.
- *Day-kind is today-only* — multi-day fast pre-planning is a convenience gap.
- *Generic 'dal'/'poha' base values exclude the tadka fat their assumptions describe* — small (~30 kcal/meal); base-data pass recommended rather than a persona-round change.
- *Unmatched AI scan names get no ghee prompt* — a generic oil fallback for unrecognized curries would close the last undercount path.
