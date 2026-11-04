/**
 * ASCEND Form Coach — Real-Time Feedback Engine
 *
 * Evaluates deterministic, evidence-based rules with strict confidence gates,
 * cooldown timers, and message smoothing to avoid UI flicker.
 */

import { FormCue, FormObservation, MovementPhase } from '../../models/form-feedback.types';

export interface FeedbackRule {
  id: string;
  exerciseId: string;
  title: string;
  message: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  cooldownMs: number;
  limitation?: string;
  evaluate: (ctx: RuleEvaluationContext) => boolean;
  formatEvidence?: (ctx: RuleEvaluationContext) => string;
}

export interface RuleEvaluationContext {
  exerciseId: string;
  phase: MovementPhase;
  currentKneeAngleDeg: number | null;
  minKneeAngleDeg: number | null;
  torsoInclinationDeg: number | null;
  trackingConfidence: number;
  feetVisible: boolean;
  anklesVisible: boolean;
  /**
   * Sustained-dropout flags (D2): true only when the feet/ankles have been
   * out of frame for a substantial share of a recent window — a momentary
   * visibility dip must not raise the out-of-frame alert. Optional so
   * older contexts keep compiling; the squat rules read these.
   */
  feetSustainedOut?: boolean;
  anklesSustainedOut?: boolean;
  sideViewDetected: boolean;
  depthTargetDeg: number;
  currentRepNumber: number;
  timestampMs: number;
}

export class FormFeedbackEngine {
  private rules: FeedbackRule[] = [];
  private lastTriggeredTimes: Map<string, number> = new Map();
  private observationCounts: Map<
    string,
    { rule: FeedbackRule; count: number; reps: Set<number>; evidence?: string }
  > = new Map();

  private activeCue: FormCue | null = null;
  private cueExpiryMs = 0;
  private readonly MIN_CUE_DISPLAY_MS = 2500;

  constructor(rules: FeedbackRule[] = []) {
    this.rules = rules;
  }

  registerRule(rule: FeedbackRule) {
    this.rules.push(rule);
  }

  reset() {
    this.lastTriggeredTimes.clear();
    this.observationCounts.clear();
    this.activeCue = null;
    this.cueExpiryMs = 0;
  }

  getActiveCue(): FormCue | null {
    return this.activeCue;
  }

  evaluate(ctx: RuleEvaluationContext): FormCue | null {
    const now = ctx.timestampMs;
    const canReplaceCue = now >= this.cueExpiryMs;

    // Evaluate rules sorted by priority: critical -> high -> medium -> low
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const sortedRules = [...this.rules].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    for (const rule of sortedRules) {
      const lastTriggered = this.lastTriggeredTimes.get(rule.id) ?? 0;
      // Cooldown applies only if the rule was previously triggered
      if (lastTriggered > 0 && now - lastTriggered < rule.cooldownMs) {
        // Evidence freshness (D3 fix): a rule already on the observation
        // ledger keeps its EVIDENCE current while it still matches, even
        // though the cue itself stays on cooldown. Depth rules used to
        // freeze their evidence at the trigger frame — the first frame
        // the running rep minimum crossed the threshold (≈95°) — while
        // the rep went on to bottom out far deeper (≈46–50°), so the
        // report cited the threshold as if it were the measurement.
        const existing = this.observationCounts.get(rule.id);
        if (existing && rule.formatEvidence && rule.evaluate(ctx)) {
          existing.evidence = rule.formatEvidence(ctx);
        }
        continue;
      }

      const isMatch = rule.evaluate(ctx);
      if (isMatch) {
        this.lastTriggeredTimes.set(rule.id, now);

        // Record observation in aggregated ledger
        const obs = this.observationCounts.get(rule.id) ?? {
          rule,
          count: 0,
          reps: new Set<number>(),
        };
        obs.count += 1;
        if (ctx.currentRepNumber > 0) {
          obs.reps.add(ctx.currentRepNumber);
        }
        if (rule.formatEvidence) {
          obs.evidence = rule.formatEvidence(ctx);
        }
        this.observationCounts.set(rule.id, obs);

        // Check if this cue should become active
        const isCritical = rule.priority === 'critical';
        const isCurrentCritical = this.activeCue?.priority === 'critical';

        if (canReplaceCue || (isCritical && !isCurrentCritical)) {
          this.activeCue = {
            id: rule.id,
            exerciseId: ctx.exerciseId,
            title: rule.title,
            message: rule.message,
            priority: rule.priority,
            confidence: ctx.trackingConfidence,
            triggeredAt: now,
            evidence: rule.formatEvidence ? rule.formatEvidence(ctx) : undefined,
            limitation: rule.limitation,
          };
          this.cueExpiryMs = now + this.MIN_CUE_DISPLAY_MS;
          return this.activeCue;
        }
      }
    }

    if (now >= this.cueExpiryMs) {
      this.activeCue = null;
    }

    return this.activeCue;
  }

  getAggregatedObservations(): FormObservation[] {
    const list: FormObservation[] = [];
    for (const [id, data] of this.observationCounts.entries()) {
      list.push({
        id,
        ruleId: data.rule.id,
        title: data.rule.title,
        message: data.rule.message,
        severity:
          data.rule.priority === 'critical'
            ? 'alert'
            : data.rule.priority === 'high'
            ? 'warning'
            : 'info',
        count: data.count,
        evidence: data.evidence,
        repsTriggered: Array.from(data.reps),
        limitation: data.rule.limitation,
      });
    }
    return list;
  }
}
