/**
 * ASCEND Form Coach — Feature Entry Point
 */

export { default as FormCoachModal } from './components/FormCoachModal';
export { useFormCoach } from './hooks/useFormCoach';
export { FormSessionRepository } from './repositories/FormSessionRepository';
export { SquatAnalyzer } from './analyzers/SquatAnalyzer';
export type { FormSessionSummary, FormRep, FormCoachConfig } from './models/form-session.types';
export type { FormCue, FormObservation, MovementPhase } from './models/form-feedback.types';
export type { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from './models/pose.types';
