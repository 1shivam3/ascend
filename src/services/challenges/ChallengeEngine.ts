import { ChallengeRepository } from '../../database/repositories/ChallengeRepository';
import { FriendRepository } from '../../database/repositories/FriendRepository';
import { XpRepository } from '../../database/repositories/XpRepository';
import { SyncQueueRepository } from '../../database/repositories/SyncQueueRepository';
import { TitleRepository } from '../../database/repositories/TitleRepository';
import { SocialFeedService } from '../social/SocialFeedService';
import {
  Challenge,
  ChallengeParticipant,
  ChallengeLeaderboardEntry,
  ChallengeEventPayload,
  ChallengeProgressUpdate,
} from '../../types/challenge.types';

export class ChallengeEngine {
  /**
   * Evaluate mathematical contribution of an athletic event toward a challenge.
   * Pure, deterministic function — immune to client tampering.
   */
  static evaluateContribution(
    challenge: Challenge,
    event: ChallengeEventPayload
  ): number {
    // 1. Temporal Validity Check: event must fall strictly within [startAt, endAt]
    const eventTime = new Date(event.timestamp).getTime();
    const startTime = new Date(challenge.startAt).getTime();
    const endTime = new Date(challenge.endAt).getTime();

    if (isNaN(eventTime) || eventTime < startTime || eventTime > endTime) {
      return 0;
    }

    // 2. Metric evaluation
    switch (challenge.metric) {
      case 'WORKOUTS':
        // Only whole workout sessions count, not exercise sub-events
        if (event.exerciseId) return 0;
        return event.eventType === 'WORKOUT' ? 1 : 0;

      case 'XP':
        return Math.max(0, event.xpEarned || 0);

      case 'VOLUME_KG':
        return Math.max(0, event.volumeKg || 0);

      case 'STEPS':
        return Math.max(0, event.stepsCount || 0);

      case 'DISTANCE_KM':
        return Math.max(0, event.distanceKm || 0);

      case 'DURATION_MINUTES':
        return Math.max(0, event.durationMinutes || 0);

      case 'EXERCISE_VOLUME_KG':
        if (
          challenge.config?.exerciseId &&
          challenge.config.exerciseId === event.exerciseId
        ) {
          return Math.max(0, event.exerciseVolumeKg || 0);
        }
        return 0;

      case 'EXERCISE_REPS':
        if (
          challenge.config?.exerciseId &&
          challenge.config.exerciseId === event.exerciseId
        ) {
          return Math.max(0, event.exerciseReps || 0);
        }
        return 0;

      case 'DAYS_ACTIVE':
        // Only whole sessions count, not exercise sub-events
        if (event.exerciseId) return 0;
        return 1;

      case 'SESSIONS':
        // Qualifying strength sessions meeting progressive overload threshold
        return event.isQualifyingStrength ? 1 : 0;

      default:
        return 0;
    }
  }

  /**
   * Ingest and process an athletic event across all active challenges joined by an operative.
   * Guarantees:
   * - Deterministic calculation
   * - Strict duplicate event prevention (idempotency)
   * - Automatic completion detection & XP rewarding
   * - Non-blocking social feed broadcast
   */
  static async processEvent(
    userId: string,
    event: ChallengeEventPayload
  ): Promise<ChallengeProgressUpdate[]> {
    const joined = await ChallengeRepository.getJoinedChallenges(userId);
    const updates: ChallengeProgressUpdate[] = [];

    for (const { challenge, participant } of joined) {
      // Skip if challenge is not active or participant is not actively participating
      if (challenge.status !== 'ACTIVE' || participant.status !== 'ACTIVE') {
        continue;
      }

      // For DAYS_ACTIVE challenges, deduplicate by calendar day so multiple workouts on the same day count as 1 day active
      const effectiveEventId =
        challenge.metric === 'DAYS_ACTIVE' && event.timestamp
          ? `day-${event.timestamp.substring(0, 10)}`
          : event.eventId;

      // Check duplicate event processing (anti-tamper / idempotency)
      const alreadyProcessed = await ChallengeRepository.hasEventBeenProcessed(
        challenge.id,
        userId,
        effectiveEventId
      );
      if (alreadyProcessed) {
        continue;
      }

      const contribution = this.evaluateContribution(challenge, event);
      if (contribution <= 0) {
        continue;
      }

      const previousProgress = participant.progress;
      const newProgress = previousProgress + contribution;
      const wasCompletedBefore = participant.completedAt !== null || previousProgress >= challenge.target;
      const isNewlyCompleted = !wasCompletedBefore && newProgress >= challenge.target;
      const completedAt = isNewlyCompleted ? new Date().toISOString() : participant.completedAt;

      // Persist event audit stamp and update progress
      await ChallengeRepository.recordEventAndProgress(
        challenge.id,
        userId,
        effectiveEventId,
        event.eventType,
        contribution,
        newProgress,
        isNewlyCompleted || wasCompletedBefore,
        completedAt
      );

      // Unlock title reward if configured
      if (isNewlyCompleted && challenge.rewardTitleId) {
        try {
          await TitleRepository.unlockTitle(userId, challenge.rewardTitleId);
        } catch (err) {
          console.warn('[ChallengeEngine] Title reward unlock warning:', err);
        }
      }

      let rewardXpEarned = 0;
      if (isNewlyCompleted && challenge.rewardXp) {
        rewardXpEarned = challenge.rewardXp;
        // Record bonus XP reward via ledger
        try {
          await XpRepository.recordTransaction(
            userId,
            'CHALLENGE',
            challenge.id,
            rewardXpEarned,
            `Challenge Completed: ${challenge.title}`
          );
        } catch (err) {
          console.warn('[ChallengeEngine] XP reward transaction warning:', err);
        }

        // Broadcast to activity feed (privacy-gated)
        try {
          await SocialFeedService.publishEvent(userId, {
            eventType: 'CHALLENGE_COMPLETED',
            title: `Challenge Completed: ${challenge.title}`,
            summary: `Conquered target of ${challenge.target} ${challenge.metric.toLowerCase()} (+${rewardXpEarned} XP)`,
            metadata: {
              challengeId: challenge.id,
              challengeTitle: challenge.title,
              challengeXp: rewardXpEarned,
            },
          });
        } catch (err) {
          console.warn('[ChallengeEngine] Social feed publish warning:', err);
        }
      }

      // Enqueue sync mutation
      try {
        await SyncQueueRepository.enqueue(
          'challenge_participant',
          participant.id,
          'UPDATE',
          {
            challenge_id: challenge.id,
            user_id: userId,
            progress: newProgress,
            status: isNewlyCompleted || wasCompletedBefore ? 'COMPLETED' : 'ACTIVE',
            completed_at: completedAt,
          },
          `challenge_participant:${challenge.id}:${userId}:progress`
        );
      } catch {
        // Non-blocking sync enqueue
      }

      updates.push({
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        previousProgress,
        newProgress,
        target: challenge.target,
        contribution,
        wasCompletedBefore,
        isNewlyCompleted,
        rewardXpEarned,
      });
    }

    return updates;
  }

  /**
   * Join a challenge with visibility and permission verification.
   */
  static async joinChallenge(
    userId: string,
    challengeId: string
  ): Promise<ChallengeParticipant> {
    const challenge = await ChallengeRepository.getChallenge(challengeId);
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    if (challenge.status === 'EXPIRED' || challenge.status === 'CANCELLED') {
      throw new Error('Challenge is no longer active');
    }

    // Visibility checks
    if (challenge.visibility === 'FRIENDS' && challenge.createdBy !== 'SYSTEM') {
      const isFriend = await FriendRepository.areFriends(userId, challenge.createdBy);
      const isCreator = userId === challenge.createdBy;
      if (!isFriend && !isCreator) {
        throw new Error('This challenge is reserved for squadmates of the creator');
      }
    }

    const participant = await ChallengeRepository.joinChallenge(challengeId, userId);

    // Enqueue sync operation
    try {
      await SyncQueueRepository.enqueue(
        'challenge_participant',
        participant.id,
        'INSERT',
        {
          id: participant.id,
          challenge_id: challengeId,
          user_id: userId,
          progress: participant.progress,
          rank: participant.rank,
          status: 'ACTIVE',
          joined_at: participant.joinedAt,
        },
        `challenge_participant:${challengeId}:${userId}:join`
      );
    } catch {
      // Non-blocking sync
    }

    return participant;
  }

  /**
   * Leave a challenge.
   */
  static async leaveChallenge(userId: string, challengeId: string): Promise<void> {
    await ChallengeRepository.leaveChallenge(challengeId, userId);

    try {
      await SyncQueueRepository.enqueue(
        'challenge_participant',
        `${challengeId}-${userId}`,
        'UPDATE',
        {
          challenge_id: challengeId,
          user_id: userId,
          status: 'LEFT',
        },
        `challenge_participant:${challengeId}:${userId}:leave`
      );
    } catch {
      // Non-blocking sync
    }
  }

  /**
   * Get public, privacy-safe leaderboard for a challenge.
   */
  static async getLeaderboard(
    challengeId: string,
    currentUserId: string
  ): Promise<ChallengeLeaderboardEntry[]> {
    return ChallengeRepository.getLeaderboard(challengeId, currentUserId);
  }

  /**
   * Get all active and available challenges for an operative.
   */
  static async getAvailableChallenges(
    userId: string,
    filter: 'ALL' | 'ACTIVE' | 'UPCOMING' = 'ACTIVE'
  ): Promise<Challenge[]> {
    return ChallengeRepository.getAvailableChallenges(userId, filter);
  }

  /**
   * Get joined challenges for an operative with progress.
   */
  static async getJoinedChallenges(
    userId: string
  ): Promise<{ challenge: Challenge; participant: ChallengeParticipant }[]> {
    return ChallengeRepository.getJoinedChallenges(userId);
  }

  /**
   * Pause participation in a challenge.
   */
  static async pauseChallenge(userId: string, challengeId: string): Promise<void> {
    await ChallengeRepository.pauseChallenge(challengeId, userId);

    try {
      await SyncQueueRepository.enqueue(
        'challenge_participant',
        `${challengeId}-${userId}`,
        'UPDATE',
        {
          challenge_id: challengeId,
          user_id: userId,
          status: 'PAUSED',
        },
        `challenge_participant:${challengeId}:${userId}:pause`
      );
    } catch {
      // Non-blocking sync
    }
  }

  /**
   * Resume participation in a paused challenge.
   */
  static async resumeChallenge(userId: string, challengeId: string): Promise<void> {
    await ChallengeRepository.resumeChallenge(challengeId, userId);

    try {
      await SyncQueueRepository.enqueue(
        'challenge_participant',
        `${challengeId}-${userId}`,
        'UPDATE',
        {
          challenge_id: challengeId,
          user_id: userId,
          status: 'ACTIVE',
        },
        `challenge_participant:${challengeId}:${userId}:resume`
      );
    } catch {
      // Non-blocking sync
    }
  }

  /**
   * Cancel participation in a challenge.
   */
  static async cancelChallenge(userId: string, challengeId: string): Promise<void> {
    await ChallengeRepository.cancelChallenge(challengeId, userId);

    try {
      await SyncQueueRepository.enqueue(
        'challenge_participant',
        `${challengeId}-${userId}`,
        'UPDATE',
        {
          challenge_id: challengeId,
          user_id: userId,
          status: 'CANCELLED',
        },
        `challenge_participant:${challengeId}:${userId}:cancel`
      );
    } catch {
      // Non-blocking sync
    }
  }

  /**
   * Manually mark a challenge complete if conditions met.
   */
  static async completeChallenge(userId: string, challengeId: string): Promise<void> {
    const challenge = await ChallengeRepository.getChallenge(challengeId);
    if (!challenge) throw new Error('Challenge not found');

    await ChallengeRepository.completeChallenge(challengeId, userId);

    if (challenge.rewardTitleId) {
      try {
        await TitleRepository.unlockTitle(userId, challenge.rewardTitleId);
      } catch (err) {
        console.warn('[ChallengeEngine] Title reward unlock warning:', err);
      }
    }

    if (challenge.rewardXp) {
      try {
        await XpRepository.recordTransaction(
          userId,
          'CHALLENGE',
          challenge.id,
          challenge.rewardXp,
          `Challenge Completed: ${challenge.title}`
        );
      } catch (err) {
        console.warn('[ChallengeEngine] XP reward warning:', err);
      }
    }

    try {
      await SyncQueueRepository.enqueue(
        'challenge_participant',
        `${challengeId}-${userId}`,
        'UPDATE',
        {
          challenge_id: challengeId,
          user_id: userId,
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
        },
        `challenge_participant:${challengeId}:${userId}:complete`
      );
    } catch {
      // Non-blocking sync
    }
  }

  /**
   * Fetch all challenges visible to the user along with their participation status.
   */
  static async getAllChallengesWithUserStatus(userId: string) {
    return ChallengeRepository.getAllChallengesWithUserStatus(userId);
  }
}

