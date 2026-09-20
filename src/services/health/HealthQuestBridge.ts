import { ChallengeEngine } from '../challenges/ChallengeEngine';
import { ChallengeEventPayload } from '../../types/challenge.types';
import { HealthRecord } from '../../types/health.types';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';

export interface HealthQuestBridgeResult {
  stepsDispatched: number;
  cardioSessionsDispatched: number;
  weightUpdated: number | null;
  challengeUpdatesCount: number;
}

export class HealthQuestBridge {
  /**
   * Evaluates ingested health records against active challenges and quests.
   * STRICT GUARD: Never awards gym workout XP or strength mastery for raw health records.
   */
  static async evaluateHealthRecords(
    userId: string,
    records: HealthRecord[]
  ): Promise<HealthQuestBridgeResult> {
    let stepsDispatched = 0;
    let cardioSessionsDispatched = 0;
    let weightUpdated: number | null = null;
    let challengeUpdatesCount = 0;

    // Filter to non-deduplicated records only
    const validRecords = records.filter(r => !r.isDeduplicated);

    // 1. Group steps by day for daily step challenge progress
    const stepsByDay = new Map<string, number>();
    for (const r of validRecords) {
      if (r.recordType === 'STEPS') {
        const day = r.startTime.substring(0, 10); // YYYY-MM-DD
        stepsByDay.set(day, (stepsByDay.get(day) || 0) + r.value);
      }
    }

    for (const [day, totalSteps] of stepsByDay.entries()) {
      if (totalSteps > 0) {
        stepsDispatched += totalSteps;
        const payload: ChallengeEventPayload = {
          eventId: `hc-steps-${userId}-${day}`,
          eventType: 'STEPS',
          timestamp: `${day}T23:59:59Z`,
          stepsCount: totalSteps,
        };

        const updates = await ChallengeEngine.processEvent(userId, payload);
        challengeUpdatesCount += updates.length;
      }
    }

    // 2. Process Exercise Sessions (Qualifying Cardio Only)
    for (const r of validRecords) {
      if (r.recordType === 'EXERCISE_SESSION') {
        const exerciseType = (r.metadata?.exerciseType || '').toUpperCase();
        const durationMin = Number(r.metadata?.durationMinutes || 0);
        const distanceM = Number(r.metadata?.distanceMeters || 0);
        const distanceKm = distanceM > 0 ? distanceM / 1000 : Number(r.metadata?.distanceKm || 0);

        // Define which Health Connect sessions count:
        // Must be endurance/cardio and have >= 10 minutes duration
        const isQualifyingCardio =
          ['RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'WALKING', 'HIKING'].includes(exerciseType) &&
          durationMin >= 10;

        if (isQualifyingCardio) {
          cardioSessionsDispatched++;
          const payload: ChallengeEventPayload = {
            eventId: r.id,
            eventType: 'CARDIO',
            timestamp: r.startTime,
            distanceKm,
            durationMinutes: durationMin,
          };

          const updates = await ChallengeEngine.processEvent(userId, payload);
          challengeUpdatesCount += updates.length;
        }
      }
    }

    // 3. Process Latest Weight Record (Profile Physique Trend)
    const weightRecords = validRecords
      .filter(r => r.recordType === 'WEIGHT')
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    if (weightRecords.length > 0) {
      const latestWeight = weightRecords[0].value;
      if (latestWeight > 20 && latestWeight < 350) {
        // Valid human weight range in kg
        weightUpdated = latestWeight;
        try {
          await ProfileRepository.updateWeight(userId, latestWeight);
        } catch (err) {
          console.warn('[HealthQuestBridge] Failed to update profile weight:', err);
        }
      }
    }

    return {
      stepsDispatched,
      cardioSessionsDispatched,
      weightUpdated,
      challengeUpdatesCount,
    };
  }
}
