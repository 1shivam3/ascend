/**
 * Text-size setting (persona-sim round 5, SIM-P1-08). The app renders
 * its type in rem-based classes (text-2xs = 0.625rem, etc.), so
 * scaling the root font-size scales the whole UI — including the
 * small labels — without touching hundreds of call sites. 'normal'
 * clears any override (browser default 16px); large/xlarge step to
 * 112.5%/125%.
 *
 * INVARIANT (gauntlet UX-15): font sizes must stay rem-based. The
 * arbitrary px utilities (text-[0.625rem] and friends) do NOT follow the
 * root size — they were converted to rem equivalents (text-[0.625rem]
 * etc.) so the setting now covers them too. Do not reintroduce
 * text-[Npx] for text; px remains fine for non-type dimensions.
 */

export type TextScale = 'normal' | 'large' | 'xlarge';

export const TEXT_SCALE_FONT_SIZE: Record<TextScale, string> = {
  normal: '',
  large: '112.5%',
  xlarge: '125%',
};

export function applyTextScale(scale: TextScale | undefined): void {
  if (typeof document === 'undefined') return;
  const resolved: TextScale =
    scale === 'large' || scale === 'xlarge' ? scale : 'normal';
  document.documentElement.style.fontSize = TEXT_SCALE_FONT_SIZE[resolved];
}
