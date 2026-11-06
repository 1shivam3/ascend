/**
 * Audit Phase 4, Task 4.1 — one Switch, one Segmented, one Chip, one
 * Toast. Source pins: the shared components carry the single styles,
 * and the ad-hoc implementations they replaced are gone (no local
 * switch markup, no one-off toggle/chip colours).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Phase 4.1 — Switch', () => {
  it('the shared Switch is accent-when-on, neutral-token-when-off', () => {
    const src = read('src/components/ui/Switch.tsx');
    expect(src).toContain('role="switch"');
    expect(src).toContain('aria-checked={checked}');
    expect(src).toContain("checked ? 'bg-accent' : 'bg-bg-tertiary border border-border'");
  });

  it('no screen keeps its own switch implementation', () => {
    for (const f of [
      'src/components/SettingsView.tsx',
      'src/components/ReminderCenterModal.tsx',
      'src/components/WorkoutDetailsView.tsx',
      'src/components/WorkoutPage.tsx',
    ]) {
      const src = read(f);
      expect(src, f).not.toContain('role="switch"');
      expect(src, f).toContain("from '@/components/ui/Switch'");
    }
  });

  it('Reminder Center lost its per-row toggle colours', () => {
    const src = read('src/components/ReminderCenterModal.tsx');
    expect(src).not.toContain('accentClass');
    expect(src).not.toContain('bg-purple-500');
    expect(src).not.toContain('bg-indigo-500');
    expect(src).not.toContain('bg-emerald-500');
    expect(src).not.toContain('bg-blue-500');
  });
});

describe('Phase 4.1 — Segmented', () => {
  it('dark selected pill is a raised neutral surface, not an accent fill', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.dark .segmented-item.active {');
    expect(css).toContain('background-color: rgb(var(--bg-elevated))');
    // The D-UX-4 filled-accent pairing no longer lists the segmented item.
    expect(css).not.toContain('.dark .segmented-item.active,\n.dark .bg-accent.text-accent-on');
    expect(css).not.toContain('.dark .btn-primary,\n.dark .segmented-item.active');
  });

  it('former ad-hoc segmented controls render through SegmentedControl', () => {
    // Settings Unit System
    const settings = read('src/components/SettingsView.tsx');
    expect(settings).toContain("value={profile?.unit === 'lbs' ? 'lbs' : 'kg'}");
    // Language (theme variant)
    expect(read('src/components/ui/LanguagePicker.tsx')).toContain('<SegmentedControl');
    // Gender selectors
    expect(read('src/components/onboarding/PersonalDetailsScreen.tsx')).toContain('<SegmentedControl');
    expect(read('src/components/EditProfileModal.tsx')).toContain('<SegmentedControl');
    // Progress range + pose + display units
    const progress = read('src/components/ProgressPage.tsx');
    expect(progress).not.toContain('bg-accent text-accent-on shadow-xs');
    expect(progress).not.toContain('role="radiogroup"');
  });
});

describe('Phase 4.1 — Chip', () => {
  it('the shared Chip is accent-tint selected / neutral unselected', () => {
    const src = read('src/components/ui/Chip.tsx');
    expect(src).toContain('bg-accent-subtle border-accent/50 text-accent-text');
    expect(src).toContain('bg-bg-secondary border-border text-text-secondary');
    expect(src).toContain('aria-pressed={selected}');
  });

  it('no lavender or one-off chip colours remain in components', () => {
    const files = fs
      .readdirSync(path.join(process.cwd(), 'src/components'), { recursive: true })
      .filter((f) => String(f).endsWith('.tsx'));
    for (const f of files) {
      const src = read(path.join('src/components', String(f)));
      expect(src, String(f)).not.toContain('#E9E4FF');
      expect(src, String(f)).not.toContain('bg-purple-500/20 text-purple-400');
    }
  });

  it('Reminder Center day chips and schedule body-part chips use Chip', () => {
    expect(read('src/components/ReminderCenterModal.tsx')).toContain('<Chip');
    expect(read('src/components/WeeklyScheduleModal.tsx')).toContain('<Chip');
  });
});

describe('Phase 4.1 — Toast', () => {
  it('one token-styled toast: sans typeface, elevated surface, severity icon chip', () => {
    const src = read('src/components/ui/Toast.tsx');
    expect(src).not.toContain('font-mono');
    expect(src).not.toContain('emerald-950');
    expect(src).not.toContain('rose-950');
    expect(src).not.toContain('zinc-900');
    expect(src).toContain('bg-bg-elevated/95');
    expect(src).toContain('bg-success/15 text-success');
    expect(src).toContain('bg-danger/10 text-danger');
    expect(src).toContain('bg-accent-subtle text-accent-text');
  });

  it('the toast stack clears the tab bar plus the safe area', () => {
    const src = read('src/components/ui/Toast.tsx');
    expect(src).toContain("bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))'");
  });

  it('"Press back again to exit" is sent as an INFO toast', () => {
    const nav = read('src/lib/navigation.tsx');
    expect(nav).toContain("toast.info(t('toast.pressBackAgain')");
    expect(nav).not.toContain("toast.error(t('toast.pressBackAgain')");
  });

  it('coalescing from PR #113 is untouched', () => {
    const src = read('src/components/ui/Toast.tsx');
    expect(src).toContain('export function upsertToast');
  });
});
