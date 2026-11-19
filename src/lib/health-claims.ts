/**
 * M2 (bug program Phase 3) — health-claim filter for AI output.
 *
 * The rule: AI text in this app may describe food composition and
 * training facts ("200 kcal, 12 g protein", "a good source of
 * fibre"), but it may NOT make therapeutic, disease, or body-benefit
 * claims ("reduces inflammation", "boosts immunity", "supports
 * muscle recovery", "lowers cholesterol"). The gym-video scan note
 * claimed pineapple "may support muscle recovery and reduce
 * inflammation" — an unverified medical claim presented as fact.
 *
 * Two layers, per the brief:
 *  1. Prompt rule — every AI prompt that produces user-visible prose
 *     carries HEALTH_CLAIM_PROMPT_RULE.
 *  2. Post-filter — scrubHealthClaims() removes any SENTENCE that
 *     matches a claim pattern, wherever AI prose is returned or
 *     rendered. Sentence-level: the rest of the message survives.
 *     If every sentence is a claim, the result is empty and the
 *     caller falls back to its neutral default.
 *
 * Patterns are deliberately narrow (a claim verb + a health object)
 * so ordinary coaching survives: "supports your protein goal" is
 * fine (goal ≠ body system); "supports muscle recovery" is not.
 */

export const HEALTH_CLAIM_PROMPT_RULE =
  'Never make health, medical, or therapeutic claims about any food or supplement: do not say a food reduces inflammation, boosts immunity, detoxifies, lowers cholesterol or blood pressure, prevents or treats disease, heals, or improves a body function. Describe only composition (calories, macros, ingredients) and training relevance.';

/** Claim patterns: therapeutic verbs and benefit constructions. */
const CLAIM_PATTERNS: RegExp[] = [
  // Direct therapeutic / disease claims.
  /\b(reduce|reduces|reduced|reducing|lower|lowers|lowered|prevent|prevents|prevented|treat|treats|treated|cure|cures|cured|heal|heals|healed|fight|fights|combat|combats)\b[^.]{0,60}\b(inflammation|cholesterol|blood pressure|blood sugar|diabetes|cancer|disease|illness|infection|pain|risk of|symptoms?)\b/i,
  /\banti[-\s]?inflammatory\b/i,
  /\b(boost|boosts|boosted|strengthen|strengthens|improve|improves|improved|enhance|enhances|support|supports|supported|promote|promotes)\b[^.]{0,50}\b(immunity|immune system|immune function|muscle recovery|recovery|gut health|digestion|joint health|bone health|heart health|brain health|metabolism|hormones?|sleep quality)\b/i,
  /\bdetox(ifies|ifying|ification)?\b|\bcleanse[sd]?\b[^.]{0,30}\b(body|system|toxins?)\b/i,
  /\bburns?\s+(belly\s+)?fat\b|\bfat[-\s]?burning\b/i,
  /\bgood for (your )?(heart|bones|joints|gut|brain|skin|eyes|health)\b/i,
  /\bmay (help )?(reduce|prevent|treat|lower|improve|support|boost)\b[^.]{0,50}\b(inflammation|immunity|immune|cholesterol|blood pressure|blood sugar|diabetes|cancer|disease|recovery)\b/i,
];

/** True when the text contains at least one health claim. */
export function containsHealthClaim(text: string): boolean {
  if (!text) return false;
  return CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Remove every sentence that makes a health claim. Remaining
 * sentences keep their order and spacing (collapsed to single
 * spaces). Returns '' when nothing clean remains.
 */
export function scrubHealthClaims(text: string): string {
  if (!text) return text;
  if (!containsHealthClaim(text)) return text;
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const kept = sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !containsHealthClaim(s));
  return kept.join(' ').trim();
}
