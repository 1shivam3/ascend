/**
 * Audit Phase 4, Task 4.7 (P3-4) — the Today Light/Dark control.
 *
 * Was: a text pill that labelled the CURRENT mode ("Light" + sun
 * while in light mode) although tapping switches to the other one.
 * Now: an icon-only button whose icon is the TARGET mode (Moon in
 * light, Sun in dark) and whose accessible label names the action —
 * "Switch to dark mode" / "Switch to light mode" via the existing
 * ui.switchMode string, in both locales. No new i18n keys.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const src = read('src/components/ui/ThemeToggle.tsx');

describe('Phase 4.7 — icon-only target-mode theme button', () => {
  it('renders no visible mode text', () => {
    expect(src).not.toContain('<span>');
    expect(src).not.toContain("{t('ui.dark')}");
    expect(src).not.toContain("{t('ui.light')}");
  });

  it('the icon is the target mode: Sun when dark, Moon when light', () => {
    const darkBranch = src.indexOf("theme === 'dark' ?");
    const sun = src.indexOf('<Sun', darkBranch);
    const moon = src.indexOf('<Moon', darkBranch);
    expect(darkBranch).toBeGreaterThanOrEqual(0);
    expect(sun).toBeGreaterThan(darkBranch);
    expect(moon).toBeGreaterThan(sun); // Moon is the else branch
  });

  it('the accessible label names the action via ui.switchMode', () => {
    expect(src).toContain("t('ui.switchMode', { mode: targetMode })");
    expect(src).toContain('aria-label={actionLabel}');
    expect(src).not.toContain("t('ui.toggleTheme')");
    // The target is computed as the opposite of the current theme.
    expect(src).toContain("theme === 'dark' ? t('ui.light') : t('ui.dark')");
  });

  it('the label strings exist in both locales', () => {
    expect(read('src/lib/i18n/en.ts')).toContain("'ui.switchMode': 'Switch to {mode} mode'");
    expect(read('src/lib/i18n/hi.ts')).toContain("'ui.switchMode': '{mode} मोड पर जाएं'");
  });

  it('keeps a 44px touch target', () => {
    expect(src).toContain('w-11 h-11');
  });
});
