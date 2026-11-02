/**
 * Spot-check defect (2026-11-01): in the Coach "Ask the coach"
 * panel, the empty transcript rendered the INPUT's placeholder copy
 * ("Ask about your training…") inside the bordered message card —
 * a second box above the real input that read as a duplicate input
 * field. The empty state now has its own copy (coachChat.emptyState)
 * rendered as plain hint text; the transcript card renders only
 * once a conversation exists. The input keeps the placeholder.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const section = fs.readFileSync(
  path.join(process.cwd(), 'src/components/CoachChatSection.tsx'),
  'utf8'
);

describe('spot-check: coach chat empty state is not a duplicate input', () => {
  it('emptyState copy exists in both dictionaries and differs from the placeholder', () => {
    expect(en['coachChat.emptyState']).toBeTruthy();
    expect(hi['coachChat.emptyState']).toBeTruthy();
    expect(en['coachChat.emptyState']).not.toBe(en['coachChat.placeholder']);
    expect(hi['coachChat.emptyState']).not.toBe(hi['coachChat.placeholder']);
  });

  it('the empty state renders the emptyState copy as plain text, before any card', () => {
    expect(section).toContain("{t('coachChat.emptyState')}");
    expect(section).toContain('messages.length === 0 ? (');
    // The placeholder string is no longer rendered as message content.
    expect(section).not.toContain("<p className=\"text-xs text-text-muted\">{t('coachChat.placeholder')}</p>");
  });

  it('the placeholder remains only on the real input (placeholder + aria-label)', () => {
    expect(section.match(/t\('coachChat\.placeholder'\)/g)).toHaveLength(2);
    expect(section).toContain('placeholder={t(\'coachChat.placeholder\')}');
  });
});
