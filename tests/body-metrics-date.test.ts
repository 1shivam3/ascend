import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { validateBodyMetricsForm } from '../src/components/BodyMetricsModal';
import { getLocalTodayStr } from '../src/lib/formatters';
import type { BodyMetricEntry } from '../src/lib/types';

const metric = (id: string, date: string, weightKg: number): BodyMetricEntry => ({
  id,
  date,
  weightKg,
});

// Runtime only needs these profile fields; the cast keeps tsc happy
// without constructing a full profile object.
const seedProfile = (weightKg: number) => {
  useStore.setState({
    profile: {
      bodyweightKg: weightKg,
      bodyweightLbs: Math.round(weightKg * 2.20462 * 10) / 10,
      heightCm: 175,
    } as never,
  });
};

const baseForm = {
  weight: '80',
  height: '',
  bodyFat: '',
  chest: '',
  waist: '',
  hips: '',
  unit: 'kg' as const,
};

describe('P0-1/D1: body metric entry dates', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  describe('validateBodyMetricsForm date validation', () => {
    it('a valid past date passes', () => {
      const { errors, values } = validateBodyMetricsForm({ ...baseForm, date: '2026-10-01' });
      expect(errors.date).toBeUndefined();
      expect(values).toBeDefined();
    });

    it('today passes', () => {
      const { errors, values } = validateBodyMetricsForm({ ...baseForm, date: getLocalTodayStr() });
      expect(errors.date).toBeUndefined();
      expect(values).toBeDefined();
    });

    it('a future date is a visible error and nothing validates', () => {
      const tomorrow = getLocalTodayStr(new Date(Date.now() + 86400000));
      const { errors, values } = validateBodyMetricsForm({ ...baseForm, date: tomorrow });
      expect(errors.date).toBeDefined();
      expect(values).toBeUndefined();
    });

    it('malformed dates are errors, never a silent fallback', () => {
      for (const bad of ['2026-13-01', '2026-02-30', 'yesterday', '2026-1-5', '']) {
        const { errors, values } = validateBodyMetricsForm({ ...baseForm, date: bad });
        expect(errors.date, `date ${JSON.stringify(bad)}`).toBeDefined();
        expect(values).toBeUndefined();
      }
    });

    it('an omitted date keeps the old behavior (no date error)', () => {
      const { errors, values } = validateBodyMetricsForm(baseForm);
      expect(errors.date).toBeUndefined();
      expect(values).toBeDefined();
    });
  });

  describe('updateBodyMetrics entryDate', () => {
    it('a backdated entry lands on the chosen date and today entry is untouched', () => {
      const today = getLocalTodayStr();
      seedProfile(80);
      useStore.setState({ bodyMetrics: [metric('b-today', today, 80)] });
      useStore.getState().updateBodyMetrics(81.5, undefined, undefined, undefined, undefined, undefined, '2026-10-01');
      const after = useStore.getState();
      expect(after.bodyMetrics.find((m) => m.date === '2026-10-01')?.weightKg).toBe(81.5);
      expect(after.bodyMetrics.find((m) => m.id === 'b-today')).toBeDefined();
      expect(after.profile?.bodyweightKg).toBe(80);
    });

    it('a today entry moves profile weight', () => {
      seedProfile(79);
      useStore.setState({ bodyMetrics: [metric('b-old', '2026-10-01', 79)] });
      useStore.getState().updateBodyMetrics(81.5);
      const after = useStore.getState();
      expect(after.bodyMetrics.find((m) => m.date === getLocalTodayStr())?.weightKg).toBe(81.5);
      expect(after.profile?.bodyweightKg).toBe(81.5);
    });

    it('a past date newer than all existing entries becomes current weight', () => {
      seedProfile(79);
      useStore.setState({ bodyMetrics: [metric('b-old', '2026-10-01', 79)] });
      useStore.getState().updateBodyMetrics(82, undefined, undefined, undefined, undefined, undefined, '2026-10-05');
      expect(useStore.getState().profile?.bodyweightKg).toBe(82);
    });

    it('backdating over an existing same-date entry tombstones the replaced row', () => {
      seedProfile(80);
      useStore.setState({ bodyMetrics: [metric('b-old', '2026-10-05', 80)] });
      useStore.getState().updateBodyMetrics(83, undefined, undefined, undefined, undefined, undefined, '2026-10-05');
      const after = useStore.getState();
      expect(after.bodyMetrics.map((b) => b.id)).not.toContain('b-old');
      expect(after.bodyMetrics.find((m) => m.date === '2026-10-05')?.weightKg).toBe(83);
      expect(after.deletedBodyMetricIds).toContain('b-old');
    });

    it('an omitted date still defaults to today', () => {
      seedProfile(80);
      useStore.getState().updateBodyMetrics(81.5);
      const after = useStore.getState();
      expect(after.bodyMetrics.find((m) => m.date === getLocalTodayStr())?.weightKg).toBe(81.5);
      expect(after.profile?.bodyweightKg).toBe(81.5);
    });

    it('works with no profile (profile stays null)', () => {
      useStore.getState().updateBodyMetrics(81.5, undefined, undefined, undefined, undefined, undefined, '2026-10-01');
      const after = useStore.getState();
      expect(after.profile).toBeNull();
      expect(after.bodyMetrics.find((m) => m.date === '2026-10-01')?.weightKg).toBe(81.5);
    });
  });
});
