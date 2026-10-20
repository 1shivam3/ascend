# R3 — Fasting User, 38 (Navratri no-grain fasts, one-meal days)

**Verdict: 6/10** — The fast modes themselves are honest and restrained. Her staple fasting food, though, was silently logged as a different dish with double the protein until this round.

## What worked
- No-grain fast keeps targets unchanged and says so ("treat them as guidance, not rules") instead of inventing a punitive fasting target.
- One-meal day lowers calories ~30% while protecting the protein target — the right shape for a training user.
- Day kinds are per-date and clearable; nothing leaks into the next day.

## Issues found
1. **[High — FIXED] Sabudana khichdi didn't exist — and the fallback lied.** With no entry, "Sabudana Khichdi" fuzzy-matched moong dal khichdi: 6.8 g protein claimed per katori (real: ~3.8 g) and carbs understated (31.5 g vs ~42 g). On a fast day built around this dish, both numbers she plans by were wrong. Real entry added (170 kcal/100 g, peanuts + potato, ghee assumption). Commits `643e3b8`.
2. **[Medium — FIXED] No medical caution on fast modes.** Shared with Meera's finding: both fast notes now carry the diabetes/medication caution. Commit `6839d34`.
3. **[Low — open] Day kind can only be set for today.** She plans a 9-day Navratri run but must re-tap the mode each morning; there's no way to pre-mark tomorrow. Minor daily friction, honestly disclosed in the UI pattern (today-only chips).
4. **[Low] One-meal protein target is aspirational.** Keeping a 120 g protein target for a single meal is physiologically optimistic; the note's "try to get most of it" softens it, but the target line still displays the full number.

## Bottom line
Fasting support is respectful rather than gamified, and her vrat foods now log truthfully. Pre-planning multi-day fasts is the open convenience gap.
