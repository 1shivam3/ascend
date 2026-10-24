/**
 * UX redesign Stage 8 — animation-spec regression pins.
 *
 * Kept: exactly the 4 keyframes (fadeIn 0.25s, tabEnter 0.22s, slideUp
 * 0.25s, scaleIn 0.2s, all ease-out) + CSS press feedback + the global
 * prefers-reduced-motion rule. Removed: all animate-pulse / animate-ping
 * (pulsing badges, shimmer skeletons, ambient dots) and the dead
 * animate-bounce-subtle class. animate-spin survives ONLY on in-flight
 * operation indicators (button/loading spinners), never over content.
 * Data-bar width transitions are kept deliberately: single-run value
 * displays, the same "data, not decoration" rationale as the spec's own
 * rest-timer exception (see implementation-summary.md). No rest-timer
 * bar element exists in this codebase — the rest UI is a numeric
 * countdown, which is already authoritative.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function* tsxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      yield* tsxFiles(full);
    } else if (full.endsWith('.tsx')) {
      yield full;
    }
  }
}

describe('Stage 8 — motion system', () => {
  it('no animate-pulse, animate-ping, or animate-bounce-subtle anywhere in src', () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(join(process.cwd(), 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const bad of ['animate-pulse', 'animate-ping', 'animate-bounce-subtle']) {
        if (src.includes(bad)) offenders.push(`${f}: ${bad}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tailwind keeps exactly the four spec keyframes at spec durations', () => {
    const cfg = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');
    for (const [name, dur] of [
      ['fadeIn', '0.25s'],
      ['tabEnter', '0.22s'],
      ['slideUp', '0.25s'],
      ['scaleIn', '0.2s'],
    ]) {
      expect(cfg, `${name} missing`).toContain(name);
      expect(cfg, `${name} duration`).toContain(dur);
    }
    expect(cfg).toContain('ease-out');
    // No fifth keyframe was added.
    const keyframes = cfg.slice(cfg.indexOf('keyframes:'));
    expect(keyframes.match(/^\s{8}\w+:/gm)?.length).toBe(4);
  });

  it('the reduced-motion rule collapses animation and transition', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('animation-duration: 0.01ms');
    expect(css).toContain('transition-duration: 0.01ms');
  });

  it('TabSkeleton is static blocks (no shimmer), Sheet closes with no exit animation', () => {
    const skel = readFileSync(join(process.cwd(), 'src/components/TabSkeleton.tsx'), 'utf8');
    expect(skel).not.toContain('animate-');
    // Sheet enters via the shared .modal-content CSS (slide-up keyframe),
    // not a utility — and carries no exit animation or pulse.
    const sheet = readFileSync(join(process.cwd(), 'src/components/ui/Sheet.tsx'), 'utf8');
    expect(sheet).toContain('modal-content');
    expect(sheet).not.toContain('animate-pulse');
    expect(sheet).not.toContain('animate-ping');
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const modalDef = css.indexOf('  .modal-content {');
    expect(modalDef).toBeGreaterThan(-1);
    expect(css.slice(modalDef, modalDef + 400)).toContain('animate-slide-up');
  });

  it('remaining animate-spin sites are all in-flight indicators', () => {
    // Spot-check the highest-risk survivor: the rest button must not spin
    // or pulse while running — its countdown text is the indicator.
    const active = readFileSync(join(process.cwd(), 'src/components/ActiveWorkoutScreen.tsx'), 'utf8');
    expect(active).not.toContain('animate-pulse');
    expect(active).not.toContain('animate-ping');
  });
});
