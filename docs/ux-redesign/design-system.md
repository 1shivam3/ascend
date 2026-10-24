# ASCEND — Design System Specification

**Date:** 2026-10-25  
**Document:** `docs/ux-redesign/design-system.md`  
**Identity:** Editorial, Athletic, Refined, High-Contrast

---

## 1. Color Palette & Token Architecture

ASCEND uses a dual-palette foundation: **Graphite (Dark)** as the primary athletic mode, and **Chalk (Light)** as the high-legibility daytime mode, united by the signature **Vermilion `#E44427`** brand accent.

### 1.1 Core Brand Tokens

| Token Name | HEX Code | RGB Values | Semantic Purpose |
|---|---|---|---|
| `--brand-vermilion` | `#E44427` | `228, 68, 39` | Primary Brand Accent, Key Call-to-Actions, High-Impact Moments |
| `--brand-graphite` | `#171916` | `23, 25, 22` | Dark Background, High-Contrast Text in Light Mode |
| `--brand-chalk` | `#F3F0E7` | `243, 240, 231` | Light Background, Crisp Text in Dark Mode |
| `--brand-sage` | `#858076` | `133, 128, 118` | Neutral Slate Secondary Accents, Supporting Copy |

### 1.2 Curated Theme Preset Engine

The user can choose their accent theme. All presets maintain **WCAG 2.2 AA (≥4.5:1)** contrast against their respective card surfaces.

| Preset Key | Display Name | Accent HEX | Accent Dim | Accent Glow | Description |
|---|---|---|---|---|---|
| `vermilion` **(Default)** | **ASCEND Vermilion** | `#E44427` | `#C7351B` | `rgba(228, 68, 39, 0.20)` | The authentic ASCEND athletic flame |
| `amber` | **Volt Amber** | `#F59E0B` | `#D97706` | `rgba(245, 158, 11, 0.20)` | Warm, energetic, high-visibility gold |
| `cobalt` | **Electric Cobalt** | `#3B82F6` | `#2563EB` | `rgba(59, 130, 246, 0.20)` | Focused, technical, powerlifting steel |
| `emerald` | **Hyper Emerald** | `#10B981` | `#059669` | `rgba(16, 185, 129, 0.20)` | Vitality, fresh growth, endurance |
| `silver` | **Monochrome Silver** | `#E2DFD6` | `#A09C94` | `rgba(226, 223, 214, 0.15)` | Minimalist, calm, zero-distraction chalk |
| `crimson` | **Crimson Red** | `#EF4444` | `#DC2626` | `rgba(239, 68, 68, 0.20)` | High-intensity strength & PRs |

---

## 2. Typography Scale & Hierarchies

ASCEND uses system font stacks prioritized for rendering performance without web-font layout shift:
`var(--font-sans), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. Numerical metrics use monospace tabular lining (`JetBrains Mono`, `monospace`) to prevent number jitter during live rest timer countdowns.

| Role | Font Size | Line Height | Tracking | Weight | Class |
|---|---|---|---|---|---|
| **Display Hero** | 32px (`2.0rem`) | 36px | `-0.025em` | Bold (`700`) | `text-display font-display` |
| **Page Title** | 22px (`1.375rem`) | 28px | `-0.015em` | Bold (`700`) | `text-title font-display` |
| **Section Heading** | 16px (`1.0rem`) | 22px | `-0.01em` | Semibold (`600`) | `text-base font-semibold` |
| **Card Title / Subtitle** | 14px (`0.875rem`) | 20px | `normal` | Medium (`500`) | `text-sm font-medium` |
| **Body Primary** | 14px (`0.875rem`) | 20px | `normal` | Regular (`400`) | `text-body` |
| **Body Secondary** | 13px (`0.8125rem`) | 18px | `normal` | Regular (`400`) | `text-xs text-text-secondary` |
| **Micro Caption / Tag** | 12px (`0.75rem`) | 16px | `+0.02em` | Medium / Mono | `text-label text-text-muted` |
| **Metric Value (Lining)** | 24px–32px | 1.1 | `-0.03em` | Bold (`700`) | `font-mono font-bold tracking-tight` |

---

## 3. Surface & Spacing System

- **Base Spacing Grid:** 4px baseline (`p-1` = 4px, `p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-5` = 20px, `p-6` = 24px).
- **Corner Radii:**
  - Badges & Chips: `rounded-full` or `rounded-lg` (8px).
  - Cards & Containers: `rounded-2xl` (16px).
  - Modals & Bottom Sheets: `rounded-t-3xl` or `rounded-2xl` (20px).
- **Surfaces (Dark Mode):**
  - App Background: `#121411` (`bg-bg-primary`)
  - Elevated Container / Sunken: `#181B17` (`bg-bg-secondary`)
  - Card Surface: `#242823` (`bg-bg-card`)
  - Floating Sheet: `#2E322D` (`bg-bg-elevated`)
  - Border Hairline: `rgba(255, 255, 255, 0.08)` / `#343932`
- **Surfaces (Light Mode):**
  - App Background: `#F3F0E7` (`bg-bg-primary`)
  - Elevated Container / Sunken: `#E8E5DC` (`bg-bg-secondary`)
  - Card Surface: `#FFFFFF` (`bg-bg-card`)
  - Border Hairline: `#E2DFD6`

---

## 4. Reusable Component Specifications

### 4.1 Buttons (`Button.tsx`)
- **Primary:** Vermilion background (`bg-accent`), crisp white text (`text-white`), subtle hover brightness. Minimum height `44px` on mobile (`48px` in active workout).
- **Secondary:** Dark surface container (`bg-bg-secondary`), subtle border (`border-border`), text primary.
- **Ghost:** Transparent background, accent text on hover.
- **Destructive:** Crimson tint (`bg-danger/15 text-danger border-danger/30`).

### 4.2 Cards (`Card.tsx` / `AscendCard`)
- Clean padding: `p-4` mobile, `p-6` desktop.
- Defined border: `border border-border/80`.
- Subtle elevation: `shadow-xs hover:border-border transition-colors`.

### 4.3 Active Workout Set Stepper
- Touch targets: `48px × 48px` minimum.
- Weight display: Prominent monospace numerals with unit tag (`kg` / `lbs`).
- Quick-tap steppers: `+2.5` / `+5` pills adjacent to weight input.
- Checkmark button: `52px × 52px` circular/rounded-xl CTA that fills with accent color and check icon on completion.

### 4.4 Rest Timer Floating Dock
- Persistent bottom bar (height `56px`), anchored above the bottom safe area.
- Monospace countdown (`01:24`) with animated SVG circular ring.
- Quick controls: `+30s` button and `Skip` button.
- Dismissable without discarding workout state.
