# R3 — Vegetarian Gym-Goer, 27 (veg family, 120 g protein target)

**Verdict: 6/10** — The protein coach's numbers are honest (a rarity), but a single suggestion can't carry a 120 g target, and the copy oversold what one anchor does until this round's fix.

## What worked
- Anchor values are real, from the DB at realistic portions: paneer 100 g → 18 g, soya chunks 30 g dry → 15.6 g, Greek yogurt 150 g → 15 g, dal tadka katori → 10.5 g (cooked — not the 24 g dry-chart lie).
- Fires only from 14:00 and only when the gap is ≥ 15 g; dismissible per day; silent for non-veg profiles (no irrelevant nagging).
- The suggestion re-computes as he logs, so after adding the anchor a remaining gap re-suggests — an iterative path to 120 g exists across the evening.

## Issues found
1. **[Medium — FIXED] The message overclaimed.** At 70/120 g logged (50 g gap), the best anchor (whey, 23.9 g) was described as "would close most of the gap" — it covers 48%. The copy now grades the claim: closes the gap / most of it / "a strong start — about X g still left, pair it with another protein food". Commit `9769b56`.
2. **[Medium — open, by design] One anchor per suggestion.** No single veg anchor exceeds ~24 g, so a user 50–80 g short gets one food at a time. Acceptable coaching style, but a "tonight's plan: whey + 100 g paneer" combo suggestion would serve this persona better. Left open — needs a design call, not a bug fix.
3. **[Low] Whey is the default big-gap answer.** For gaps > 24 g the largest anchor is always whey; a user who doesn't buy supplements sees the same suggestion daily. A "don't suggest foods I never log" learning step is absent.

## Bottom line
He can actually get to 120 g with this coach — paneer/soya/whey/dal anchors at real values — but he'll tap through 2–3 suggestions across the evening to do it.
