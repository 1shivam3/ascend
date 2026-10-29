/**
 * Gauntlet R-01 decision B — copy-only relabel of the weekly-review
 * adherence cell. The cell renders `{sessionsCompleted} / {sessionsPlanned}`
 * (scheduled days trained / scheduled days), so "Sessions done" overstated
 * it as attendance. The new labels name the adherence meaning; no logic
 * changed. The Hindi string is composed from existing vocabulary and is
 * UNREVIEWED — native-speaker review owed before it is treated as final.
 */
import { describe, expect, it } from 'vitest';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

describe('weekly review sessions cell label (R-01 decision B)', () => {
  it('labels the adherence fraction as planned sessions in English', () => {
    expect(en['weeklyReview.sessions']).toBe('Planned sessions done');
  });

  it('labels the adherence fraction as planned sessions in Hindi (unreviewed)', () => {
    expect(hi['weeklyReview.sessions']).toBe('पूरे हुए नियोजित सेशन');
  });
});
