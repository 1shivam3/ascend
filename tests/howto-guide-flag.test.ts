import { describe, it, expect, vi } from 'vitest';
import { HOWTO_SEEN_KEY, clearHowToSeenFlag } from '@/lib/howto-guide';

describe('how-to-use guide once-flag', () => {
  it('exposes the exact key the page trigger reads and writes', () => {
    expect(HOWTO_SEEN_KEY).toBe('ascend_howto_seen_v1');
  });

  it('removes the flag so a newly completed onboarding shows the guide', () => {
    const removeItem = vi.fn();
    clearHowToSeenFlag({ removeItem });
    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith('ascend_howto_seen_v1');
  });

  it('never throws when storage is missing or refuses', () => {
    expect(() => clearHowToSeenFlag(undefined)).not.toThrow();
    expect(() => clearHowToSeenFlag(null)).not.toThrow();
    expect(() =>
      clearHowToSeenFlag({
        removeItem: () => {
          throw new Error('denied');
        },
      }),
    ).not.toThrow();
  });
});
