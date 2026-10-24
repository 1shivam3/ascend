# ASCEND — Purposeful Motion & Animation Specification

**Date:** 2026-10-25  
**Document:** `docs/ux-redesign/animation-spec.md`  
**Philosophy:** Responsive, subtle, athletic, zero-blocking. Motion serves orientation and confirmation, never decoration.

---

## 1. Animation Choreography & Constraints

All animations must satisfy the following technical constraints:
- **Duration Floor & Ceiling:** Micro-feedback (120ms–200ms); Screen transitions (200ms–280ms). Never exceed 320ms.
- **Hardware Acceleration:** Only animate `transform` and `opacity`. Never animate `width`, `height`, `margin`, or `padding` (to eliminate layout thrashing).
- **Reduced Motion:** When `prefers-reduced-motion: reduce` is detected, all transitions immediately drop to `opacity` cross-fades or 0ms instant updates.

---

## 2. Animation Catalog

| Component | Trigger | Animation Description | Duration | Easing | Reduced Motion Fallback | Purpose |
|---|---|---|---|---|---|---|
| **Tab Navigation** | User taps bottom tab | Page fades in with subtle 4px upward rise (`translateY(4px)`) | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Instant switch | Preserves spatial orientation between major destinations |
| **Set Completion** | Checkmark tapped in Active Workout | Checkmark icon scales (`0.9 -> 1.05 -> 1.0`) with brief Vermilion glow; set row subtly shifts to muted border | 180ms | `ease-out` | Static checkmark | Immediate tactile confirmation of recorded set without blocking timer |
| **Rest Timer Ring** | Active countdown | Circular SVG `stroke-dashoffset` smoothly decrements | 1000ms continuous | `linear` | Numeric text countdown only | Peripheral visual sense of remaining rest time |
| **Modal / Sheet Open** | Action trigger | Backdrop fades in (`opacity: 0 -> 1`), sheet slides up (`translateY(16px -> 0)`) | 240ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Instant overlay | Grounds sheet hierarchy above background content |
| **Theme Swatch Tap** | User taps color swatch in Settings | Active ring smoothly scales and expands around selected preset; CSS variables update | 160ms | `ease-out` | Instant active border | Clear confirmation of theme selection |
| **Macro Ring Update** | Food logged | SVG arc length updates to new calorie/protein total | 250ms | `ease-out` | Instant arc render | Visual payoff for recording a meal |
| **PR Unlock Badge** | Personal record achieved | PR badge pulses gently (`scale 1.04 -> 1.0`) with subtle gold/accent tint | 300ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Static badge | Celebrates genuine milestone without noisy confetti |
