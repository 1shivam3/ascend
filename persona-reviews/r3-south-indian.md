# R3 — South Indian User, 31 (sambar / rasam / dosa / idli accuracy)

**Verdict: 6/10** — The regional set is real and the confusables are genuinely distinct — rare in food apps. But idli, the single most common tiffin item, was undercounted 2.5× until this round's fix.

## What worked
- Confusables kept distinct and plausible: sambar 65 kcal/100 g (1 katori = 98 kcal, 4.5 g protein), rasam 30/100 g (45/katori), kadhi separate — with region tags and correct tadka assumptions.
- Dosa values sane: plain dosa 1 piece (80 g) = 134 kcal, masala dosa = 241 kcal; rava dosa carries a higher oil assumption (1.5 tsp — it does drink tawa oil).
- Curd rice, lemon rice, tamarind rice, bisibelebath, ven pongal, kootu, avial, poriyal all present with South tags — not an afterthought section.

## Issues found
1. **[High — FIXED] Idli was valued per-piece in a per-100g slot.** The base entry held the classic one-idli macros (58 kcal, 2P/12C) as if per 100 g. "3 idli" logged 70 kcal instead of ~175. The overlay now carries true per-100g values (145 kcal) that reproduce exactly 58 kcal per 40 g piece. Commit `0f7c151`.
2. **[Medium — FIXED] Plain "Rice" wore curd rice's identity.** Fuzzy meta resolution matched 'rice' → 'curd rice' (score 0.44), so steamed rice showed a curd-rice assumption and a ghee prompt defaulting to 1 tsp. The substring direction now requires ≥ 0.6 overlap. Commit `2bff363`.
3. **[Low] Dosa piece weight (80 g) is a smallish dosa.** A big hotel dosa runs 100–120 g; users can bump quantity to 1.5, but the default will mildly undercount restaurant dosas. Data judgment call — left as-is rather than inflating home dosas.

## Bottom line
After the idli fix, a full tiffin (3 idli + sambar + coconut chutney, or masala dosa + filter coffee) logs within a few percent of reference values — the regional promise holds.
