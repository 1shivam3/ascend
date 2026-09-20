import { describe, it, expect } from 'vitest';
import { getRankForLevel, RANKS } from '../../../constants/ranks';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';

describe('RANKS Ladder — E to SSS Deterministic Progression', () => {
  it('contains exactly the canonical 8 tiers: E, D, C, B, A, S, SS, SSS', () => {
    const expectedTiers = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const definedTiers = Object.keys(RANKS);

    expect(definedTiers).toEqual(expectedTiers);
  });

  it('correctly maps level thresholds to explicit configurable ranks', () => {
    // Level 1 -> E-Rank (min 1, max 9)
    expect(getRankForLevel(1).tier).toBe('E');
    expect(getRankForLevel(9).tier).toBe('E');

    // Level 10 -> D-Rank (min 10, max 24)
    expect(getRankForLevel(10).tier).toBe('D');
    expect(getRankForLevel(24).tier).toBe('D');

    // Level 25 -> C-Rank (min 25, max 44)
    expect(getRankForLevel(25).tier).toBe('C');
    expect(getRankForLevel(44).tier).toBe('C');

    // Level 45 -> B-Rank (min 45, max 64)
    expect(getRankForLevel(45).tier).toBe('B');
    expect(getRankForLevel(64).tier).toBe('B');

    // Level 65 -> A-Rank (min 65, max 79)
    expect(getRankForLevel(65).tier).toBe('A');
    expect(getRankForLevel(79).tier).toBe('A');

    // Level 80 -> S-Rank (min 80, max 89)
    expect(getRankForLevel(80).tier).toBe('S');
    expect(getRankForLevel(89).tier).toBe('S');

    // Level 90 -> SS-Rank (min 90, max 99)
    expect(getRankForLevel(90).tier).toBe('SS');
    expect(getRankForLevel(99).tier).toBe('SS');

    // Level 100+ -> SSS-Rank (min 100, max 999)
    expect(getRankForLevel(100).tier).toBe('SSS');
    expect(getRankForLevel(250).tier).toBe('SSS');
  });

  it('determines division progression IV -> III -> II -> I within rank span', () => {
    // D-Rank span: 10 to 24 (15 levels, step of 4)
    // 10 -> IV
    const divAt10 = getRankForLevel(10);
    expect(divAt10.tier).toBe('D');
    expect(divAt10.division).toBe(4);

    // 24 -> I
    const divAt24 = getRankForLevel(24);
    expect(divAt24.tier).toBe('D');
    expect(divAt24.division).toBe(1);

    // SSS has division 1
    const divAt100 = getRankForLevel(100);
    expect(divAt100.tier).toBe('SSS');
    expect(divAt100.division).toBe(1);
  });

  it('guarantees zero arbitrary rank changes: definitions match PROGRESSION_CONFIG', () => {
    for (const [tier, def] of Object.entries(PROGRESSION_CONFIG.ranks)) {
      expect(RANKS[tier as keyof typeof RANKS].title).toBe(def.title);
      expect(RANKS[tier as keyof typeof RANKS].minLevel).toBe(def.minLevel);
      expect(RANKS[tier as keyof typeof RANKS].maxLevel).toBe(def.maxLevel);
      expect(RANKS[tier as keyof typeof RANKS].color).toBe(def.color);
    }
  });
});
