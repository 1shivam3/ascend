/**
 * ai-notices.ts — Task 1.2: first-use AI disclosure, per feature type.
 *
 * The first time a user opens an AI feature, a small banner states
 * plainly what leaves the device for that feature. The "seen" flags
 * live in localStorage only — no account, no server, works offline —
 * and the banner is informational: it never blocks the feature (the
 * scan/chat works identically whether the banner is up or dismissed).
 *
 * Feature types covered (the ones that send user content to AI
 * providers):
 *  - 'meal-scan': meal photos/text → Groq / Google Gemini (photos
 *    never go to free-tier models; ASCEND does not store the photo).
 *  - 'coach-chat': chat text + training context → the AI fallback
 *    chain; some free-tier text models may retain submitted text.
 * Form Coach needs no notice: it runs 100% on-device (verified —
 * zero network calls in src/features/form-coach).
 */
import type { StringKey } from './i18n/en';

export type AiFeature = 'meal-scan' | 'coach-chat';

export const AI_NOTICES_KEY = 'ascend_ai_notices_seen_v1';

function readSeen(): Partial<Record<AiFeature, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AI_NOTICES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<Record<AiFeature, boolean>>;
    }
  } catch {
    // Corrupt storage reads as "not seen" — the banner simply shows.
  }
  return {};
}

export function hasSeenAiNotice(feature: AiFeature): boolean {
  return readSeen()[feature] === true;
}

export function markAiNoticeSeen(feature: AiFeature): void {
  if (typeof window === 'undefined') return;
  try {
    const seen = readSeen();
    seen[feature] = true;
    window.localStorage.setItem(AI_NOTICES_KEY, JSON.stringify(seen));
  } catch {
    // Storage full/blocked: the banner may reappear next time. The
    // feature itself is never affected.
  }
}

/** The disclosure copy for a feature (en + hi via i18n). */
export function aiNoticeMessageKey(feature: AiFeature): StringKey {
  return feature === 'meal-scan' ? 'aiNotice.mealScan' : 'aiNotice.coachChat';
}
