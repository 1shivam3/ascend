import { describe, it, expect } from 'vitest';
import { FOOD_DB } from '../src/lib/macros';
import {
  MODEL_LABELS,
  OFFLINE_LABEL_MAP,
  OFFLINE_UNRESOLVED_LABELS,
  OFFLINE_AUTO_DRAFT_THRESHOLD,
  isResolvedLabel,
  isOfflineScanAvailable,
  shouldUseOfflineScan,
  routeOfflineResult,
  buildItemForCandidate,
  buildOfflineDraft,
  alternativesFor,
  confidenceTierForScore,
  displayNameForLabel,
  type OfflineCandidate,
} from '../src/lib/offline-scan';

const cand = (label: string, score: number): OfflineCandidate => ({ label, score });

describe('offline scan — label map completeness', () => {
  it('covers every model label exactly once', () => {
    expect(Object.keys(OFFLINE_LABEL_MAP).sort()).toEqual([...MODEL_LABELS].sort());
    expect(MODEL_LABELS).toHaveLength(15);
  });

  it('every resolved label points at a real FOOD_DB entry with sane macros', () => {
    for (const label of MODEL_LABELS) {
      const mapping = OFFLINE_LABEL_MAP[label];
      if (!mapping) continue;
      const entry = FOOD_DB[mapping.dbKey];
      expect(entry, `${label} → ${mapping.dbKey}`).toBeDefined();
      expect(entry.calories).toBeGreaterThan(0);
      expect(Number.isFinite(entry.proteinG)).toBe(true);
      expect(Number.isFinite(entry.carbsG)).toBe(true);
      expect(Number.isFinite(entry.fatG)).toBe(true);
      expect(mapping.defaultGrams).toBeGreaterThan(0);
    }
  });

  it('the unresolved set is exactly the two dishes missing from the DB', () => {
    expect([...OFFLINE_UNRESOLVED_LABELS].sort()).toEqual(['kathi roll', 'kofta']);
    expect(FOOD_DB['kathi roll']).toBeUndefined();
    expect(FOOD_DB['kofta']).toBeUndefined();
    expect(isResolvedLabel('kathi roll')).toBe(false);
    expect(isResolvedLabel('kofta')).toBe(false);
  });

  it('known fuzzy traps stay exact: dal is dal, paneer is paneer', () => {
    // Substring/fuzzy matching used to send 'dal' to a tadka variant and
    // 'paneer' to palak paneer. The offline map must never do that.
    expect(OFFLINE_LABEL_MAP['dal']?.dbKey).toBe('dal');
    expect(OFFLINE_LABEL_MAP['paneer']?.dbKey).toBe('paneer');
  });
});

describe('offline scan — draft building', () => {
  it('builds a draft from the exact DB entry at the standard serving', () => {
    const draft = buildOfflineDraft([cand('biryani', 0.92)]);
    expect(draft).not.toBeNull();
    const item = draft!.items[0];
    expect(item.name).toBe('Biryani');
    expect(item.estimatedGrams).toBe(250);
    const per100 = FOOD_DB['biryani'];
    expect(item.calories).toBe(Math.round(per100.calories * 2.5));
    expect(item.proteinG).toBe(Number((per100.proteinG * 2.5).toFixed(1)));
    // Totals are the recalculated sums, same shape as the server result.
    expect(draft!.totalCalories).toBe(item.calories);
    expect(draft!.totalProtein).toBe(item.proteinG);
    expect(draft!.mealName).toBe('Biryani');
    expect(draft!.confidence).toBe('high');
  });

  it('dal drafts as generic dal (1 katori), never a tadka variant', () => {
    const item = buildItemForCandidate(cand('dal', 0.8));
    expect(item.name).toBe('Dal');
    expect(item.estimatedGrams).toBe(150);
    expect(item.calories).toBe(Math.round(FOOD_DB['dal'].calories * 1.5));
  });

  it('an explicitly chosen unresolved label drafts via the estimator, flagged', () => {
    const item = buildItemForCandidate(cand('kofta', 0.66));
    expect(item.name).toBe('Kofta');
    expect(item.estimatedGrams).toBe(150);
    expect(item.calories).toBeGreaterThan(0);
    expect(item.notes).toContain('closest database entry');
  });

  it('honours an explicit choice over the top-1', () => {
    const draft = buildOfflineDraft(
      [cand('dosa', 0.5), cand('dhokla', 0.44)],
      'dhokla'
    );
    expect(draft!.items[0].name).toBe('Dhokla');
  });

  it('empty candidates produce no draft', () => {
    expect(buildOfflineDraft([])).toBeNull();
  });

  it('alternatives exclude the currently drafted label', () => {
    const all = [cand('dosa', 0.9), cand('dhokla', 0.4), cand('dal', 0.2)];
    expect(alternativesFor(all, 'dosa').map((c) => c.label)).toEqual(['dhokla', 'dal']);
  });

  it('confidence tiers follow the thresholds', () => {
    expect(confidenceTierForScore(0.9)).toBe('high');
    expect(confidenceTierForScore(0.5)).toBe('medium');
    expect(confidenceTierForScore(0.2)).toBe('low');
    expect(displayNameForLabel('pav bhaji')).toBe('Pav Bhaji');
  });
});

describe('offline scan — routing', () => {
  it('confident + resolved top-1 auto-drafts', () => {
    expect(routeOfflineResult([cand('dosa', 0.9)])).toBe('draft');
    expect(routeOfflineResult([cand('dosa', OFFLINE_AUTO_DRAFT_THRESHOLD)])).toBe('draft');
  });

  it('below the threshold goes to choices', () => {
    expect(routeOfflineResult([cand('dosa', 0.34)])).toBe('choices');
    expect(routeOfflineResult([cand('dosa', 0.1)])).toBe('choices');
    expect(routeOfflineResult([])).toBe('choices');
  });

  it('a confident but unresolved top-1 still goes to choices (never auto-drafts)', () => {
    expect(routeOfflineResult([cand('kofta', 0.95)])).toBe('choices');
    expect(routeOfflineResult([cand('kathi roll', 0.99)])).toBe('choices');
  });
});

describe('offline scan — availability gate', () => {
  it('requires native + preference on + model available', () => {
    expect(shouldUseOfflineScan({ isNative: true, prefEnabled: true, modelAvailable: true })).toBe(true);
    expect(shouldUseOfflineScan({ isNative: false, prefEnabled: true, modelAvailable: true })).toBe(false);
    expect(shouldUseOfflineScan({ isNative: true, prefEnabled: false, modelAvailable: true })).toBe(false);
    expect(shouldUseOfflineScan({ isNative: true, prefEnabled: true, modelAvailable: false })).toBe(false);
  });

  it('web / non-native environments never report availability', async () => {
    // The test env is not a Capacitor native platform, so this must
    // resolve false without ever touching the plugin.
    await expect(isOfflineScanAvailable()).resolves.toBe(false);
  });
});
