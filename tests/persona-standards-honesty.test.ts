import { describe, it, expect } from 'vitest';
import { getLiftLevel, getOverallLevel } from '../src/lib/strength-standards';

describe('strength standards honesty (persona: Kavya / Aditya)', () => {
  it('labels a custom exercise ranked against a proxy standard', () => {
    const level = getLiftLevel('Power Clean', 80, 75, 'female');
    expect(level.isStandardUnavailable).toBe(true);
    expect(level.standardNote).toContain('No published strength standard');
  });

  it('does not flag a known library lift with its own standard', () => {
    const level = getLiftLevel('Barbell Bench Press', 90, 75, 'female');
    expect(level.isStandardUnavailable).toBe(false);
  });

  it('excludes proxy-standard estimates from the overall level average', () => {
    const real = getLiftLevel('Barbell Bench Press', 90, 75, 'female');
    const fake = getLiftLevel('Mystery Lift', 500, 75, 'female'); // absurd proxy level
    const overall = getOverallLevel([real, fake]);
    expect(overall.level).toBeLessThanOrEqual(real.level + 2);
  });
});
