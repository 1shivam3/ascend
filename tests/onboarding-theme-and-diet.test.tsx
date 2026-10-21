import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PersonalDetailsScreen from '../src/components/onboarding/PersonalDetailsScreen';
import { useStore } from '../src/lib/store';
import { translate } from '../src/lib/i18n';

/**
 * QA4-017 — the onboarding island hardcoded the light palette (54
 * bg-white, ~75 text-[#171916], 82 text-[#858076] at 3.45:1, failing
 * AA), so dark-mode users got a full-screen light flash and muted
 * text failed contrast. Source contract: no app-palette hexes remain
 * in the island; everything goes through theme tokens.
 *
 * QA4-019 — onboarding never asked diet preference (silently defaulted
 * to non_vegetarian). The details step must render the control.
 */

const ISLAND_FILES = [
  'src/components/Onboarding.tsx',
  ...fs
    .readdirSync(path.resolve(__dirname, '../src/components/onboarding'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `src/components/onboarding/${f}`),
];

/** App-palette hexes that must never reappear in the island. */
const PALETTE_HEXES = [
  '#171916', // graphite (text-primary)
  '#f3f0e7', // chalk (bg-primary)
  '#858076', // sage — 3.45:1, fails AA as text
  '#e2dfd6', // chalk border
  '#e44427', // vermilion (accent)
  '#d03b20', // accent hover
  '#212420', // graphite surface
  '#2c302b', // graphite border
  '#e8e5dc', // chalk sunken
  '#5e615a', // secondary text
];

describe('onboarding island theme contract (QA4-017)', () => {
  it('no hardcoded palette hexes remain in any onboarding file', () => {
    for (const rel of ISLAND_FILES) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8').toLowerCase();
      for (const hex of PALETTE_HEXES) {
        expect(src, `${rel} must not contain ${hex}`).not.toContain(hex);
      }
    }
  });

  it('no bg-white remains (cards use the themed bg-card surface)', () => {
    for (const rel of ISLAND_FILES) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
      expect(src, `${rel} must not contain bg-white`).not.toContain('bg-white');
    }
  });

  it('the only hexes left in the island are the Google logo brand fills', () => {
    const googleLogoHexes = ['#4285f4', '#34a853', '#fbbc05', '#ea4335'];
    for (const rel of ISLAND_FILES) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
      const hexes = src.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      for (const h of hexes) {
        expect(
          googleLogoHexes,
          `${rel} contains non-logo hex ${h}`,
        ).toContain(h.toLowerCase());
      }
    }
  });

  it('muted text uses the AA-compliant text-muted token (4.74:1), not sage', () => {
    const details = fs.readFileSync(
      path.resolve(__dirname, '../src/components/onboarding/PersonalDetailsScreen.tsx'),
      'utf8',
    );
    expect(details).toContain('text-text-muted');
    expect(details).not.toContain('#858076');
  });
});

describe('onboarding diet preference (QA4-019)', () => {
  beforeEach(() => {
    useStore.getState().setUiPreferences({ language: 'en' });
  });

  it('the details step renders all four diet options (en)', () => {
    const html = renderToStaticMarkup(
      <PersonalDetailsScreen onContinue={() => {}} onBack={() => {}} />,
    );
    expect(html).toContain('Diet Preference');
    expect(html).toContain('Vegetarian');
    expect(html).toContain('Eggetarian');
    expect(html).toContain('Non-Vegetarian');
    expect(html).toContain('Vegan');
    // The default stays non_vegetarian — but now as a visible, chosen option.
    expect(html).toContain('aria-checked="true"');
  });

  it('every diet key exists in Hindi too (dictionary parity)', () => {
    // NB: component rendering is asserted in English above — zustand's
    // server snapshot is the initial state, so SSR markup can't see a
    // language switch; the codebase's i18n tests assert via translate()
    // for the same reason.
    expect(translate('hi', 'onboarding.dietPreference')).toBe('आहार पसंद');
    expect(translate('hi', 'onboarding.dietVegetarian')).toBe('शाकाहारी');
    expect(translate('hi', 'onboarding.dietEggitarian')).toContain('एगिटेरियन');
    expect(translate('hi', 'onboarding.dietNonVegetarian')).toBe('मांसाहारी');
    expect(translate('hi', 'onboarding.dietVegan')).toBe('वीगन');
    expect(translate('hi', 'onboarding.dietHint')).not.toBe(translate('en', 'onboarding.dietHint'));
  });
});
