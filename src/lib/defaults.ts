/**
 * Shared product defaults.
 *
 * DEFAULT_BODYWEIGHT_KG — the single canonical fallback bodyweight,
 * used wherever a computation needs a bodyweight and the profile has
 * none recorded. The codebase historically split between 75 kg (the
 * large majority of sites) and 70 kg (ProfileView's lift levels), so
 * the same profile-less user was a different weight on different
 * screens. Every fallback now reads this constant; the pin test in
 * tests/bodyweight-default.test.ts fails if a numeric literal
 * fallback creeps back in.
 */
export const DEFAULT_BODYWEIGHT_KG = 75;
