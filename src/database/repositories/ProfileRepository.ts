import { getDatabase } from '../sqlite';
import { UserProfile, UserSettings, CharacterAttributes, RankTier, PrimaryGoal } from '../../types/domain.types';
import { SqliteProfileRow, SqliteUserSettingsRow } from '../types';
import { normalizeGoal } from '../../utils/validation/onboardingSchema';
import { PublicUserSummary } from '../../types/social.types';
import { generateDefaultFriendCode } from '../migrations/init';

export class ProfileRepository {
  static async getProfile(userId: string): Promise<UserProfile | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteProfileRow>(
      `SELECT * FROM profiles WHERE id = ?;`,
      [userId]
    );

    if (!row) return null;

    let attributes: CharacterAttributes = {
      strength: 10,
      endurance: 10,
      agility: 10,
      consistency: 10,
      stamina: 10,
      discipline: 10,
      vitality: 10,
    };
    try {
      attributes = { ...attributes, ...JSON.parse(row.attributes) };
    } catch {
      // fallback
    }

    let trainingPreferences: any = {
      daysPerWeek: 4,
      sessionDurationMinutes: 60,
      equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
      trainingLocation: 'COMMERCIAL_GYM',
      preferredExerciseIds: [],
      excludedExerciseIds: [],
      limitations: [],
    };
    try {
      if (row.training_preferences) {
        trainingPreferences = JSON.parse(row.training_preferences);
      }
    } catch {
      // fallback
    }

    const primaryGoal: PrimaryGoal = row.primary_goal
      ? normalizeGoal(row.primary_goal)
      : normalizeGoal(row.goal || 'GET_STRONGER');

    let secondaryGoals: PrimaryGoal[] = [];
    try {
      if (row.secondary_goals) {
        const parsed = JSON.parse(row.secondary_goals);
        if (Array.isArray(parsed)) {
          secondaryGoals = parsed.map((g: string) => normalizeGoal(g));
        }
      }
    } catch {
      // fallback
    }

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      goal: row.goal || 'STRENGTH',
      primaryGoal,
      primary_goal: primaryGoal,
      secondaryGoals,
      secondary_goals: secondaryGoals,
      experience: row.experience || 'INTERMEDIATE',
      age: Number(row.age) || 25,
      heightCm: Number(row.height_cm) || 175.0,
      weightKg: Number(row.weight_kg) || 75.0,
      trainingPreferences,
      globalLevel: row.global_level,
      totalXp: row.total_xp,
      rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(row.rank_tier) ? row.rank_tier : 'E') as RankTier,
      rankDivision: row.rank_division,
      attributes,
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      streakFreezeTokens: row.streak_freeze_tokens,
      lastWorkoutDate: row.last_workout_date,
      isGuest: Boolean(row.is_guest),
      onboardingCompleted: Boolean(row.onboarding_completed),
      authId: row.auth_id || null,
      friendCode: row.friend_code || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async updateProgression(
    userId: string,
    globalLevel: number,
    totalXp: number,
    rankTier: RankTier,
    rankDivision: number,
    attributes: CharacterAttributes,
    currentStreak: number,
    longestStreak: number,
    streakFreezeTokens: number,
    lastWorkoutDate: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE profiles SET
        global_level = ?,
        total_xp = ?,
        rank_tier = ?,
        rank_division = ?,
        attributes = ?,
        current_streak = ?,
        longest_streak = ?,
        streak_freeze_tokens = ?,
        last_workout_date = ?,
        updated_at = ?
      WHERE id = ?;`,
      [
        globalLevel,
        totalXp,
        rankTier,
        rankDivision,
        JSON.stringify(attributes),
        currentStreak,
        longestStreak,
        streakFreezeTokens,
        lastWorkoutDate,
        now,
        userId,
      ]
    );
  }

  static async getSettings(userId: string): Promise<UserSettings | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteUserSettingsRow>(
      `SELECT * FROM user_settings WHERE user_id = ?;`,
      [userId]
    );

    if (!row) return null;

    return {
      userId: row.user_id,
      preferredUnit: row.preferred_unit as 'kg' | 'lbs',
      soundEnabled: Boolean(row.sound_enabled),
      hapticsEnabled: Boolean(row.haptics_enabled),
      defaultRestSeconds: row.default_rest_seconds,
      pushNotificationsEnabled: Boolean(row.push_notifications_enabled),
      streakFreezeAutoUse: Boolean(row.streak_freeze_auto_use),
    };
  }

  static async updateUnit(userId: string, unit: 'kg' | 'lbs'): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE user_settings SET preferred_unit = ?, updated_at = ? WHERE user_id = ?;`,
      [unit, now, userId]
    );
  }

  static async updateWeight(userId: string, weightKg: number): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE profiles SET weight_kg = ?, updated_at = ? WHERE id = ?;`,
      [weightKg, now, userId]
    );
  }

  static async createOrUpdateProfile(profile: UserProfile): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const primaryGoal = profile.primary_goal || profile.primaryGoal || normalizeGoal(profile.goal);
    const secondaryGoals = profile.secondary_goals || profile.secondaryGoals || [];
    const friendCode = profile.friendCode || generateDefaultFriendCode();

    await db.runAsync(
      `INSERT OR REPLACE INTO profiles (
        id, username, display_name, avatar_url, goal, primary_goal, secondary_goals, experience, age, height_cm, weight_kg,
        training_preferences, global_level, total_xp, rank_tier, rank_division,
        attributes, current_streak, longest_streak, streak_freeze_tokens, last_workout_date,
        is_guest, onboarding_completed, auth_id, friend_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        profile.id,
        profile.username,
        profile.displayName,
        profile.avatarUrl,
        profile.goal,
        primaryGoal,
        JSON.stringify(secondaryGoals),
        profile.experience,
        profile.age,
        profile.heightCm,
        profile.weightKg,
        JSON.stringify(profile.trainingPreferences),
        profile.globalLevel,
        profile.totalXp,
        profile.rankTier,
        profile.rankDivision,
        JSON.stringify(profile.attributes),
        profile.currentStreak,
        profile.longestStreak,
        profile.streakFreezeTokens,
        profile.lastWorkoutDate,
        profile.isGuest ? 1 : 0,
        profile.onboardingCompleted ? 1 : 0,
        profile.authId || null,
        friendCode,
        profile.createdAt || now,
        now,
      ]
    );
  }

  static async completeOnboarding(
    userId: string,
    params: {
      username: string;
      displayName?: string;
      avatarUrl?: string;
      goal: string;
      primaryGoal?: PrimaryGoal;
      primary_goal?: PrimaryGoal;
      secondaryGoals?: PrimaryGoal[];
      secondary_goals?: PrimaryGoal[];
      experience: string;
      age: number;
      heightCm: number;
      weightKg: number;
      trainingPreferences: any;
      attributes: CharacterAttributes;
    }
  ): Promise<UserProfile> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const existing = await this.getProfile(userId);
    const globalLevel = existing?.globalLevel || 1;
    const totalXp = existing?.totalXp ? existing.totalXp + 150 : 150; // +150 XP starting bonus
    const rankTier: RankTier = existing?.rankTier && ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(existing.rankTier)
      ? existing.rankTier
      : 'E';
    const rankDivision = existing?.rankDivision || 4;
    const currentStreak = existing?.currentStreak || 0;
    const longestStreak = existing?.longestStreak || 0;
    const streakFreezeTokens = existing?.streakFreezeTokens || 1;
    const friendCode = existing?.friendCode || generateDefaultFriendCode();

    const primaryGoal = params.primary_goal || params.primaryGoal || normalizeGoal(params.goal);
    const secondaryGoals = params.secondary_goals || params.secondaryGoals || [];

    const profile: UserProfile = {
      id: userId,
      username: params.username,
      displayName: params.displayName || params.username,
      avatarUrl: params.avatarUrl || '⚔️',
      goal: params.goal,
      primaryGoal,
      primary_goal: primaryGoal,
      secondaryGoals,
      secondary_goals: secondaryGoals,
      experience: params.experience,
      age: params.age,
      heightCm: params.heightCm,
      weightKg: params.weightKg,
      trainingPreferences: params.trainingPreferences,
      globalLevel,
      totalXp,
      rankTier,
      rankDivision,
      attributes: params.attributes,
      currentStreak,
      longestStreak,
      streakFreezeTokens,
      lastWorkoutDate: null,
      isGuest: true,
      onboardingCompleted: true,
      authId: null,
      friendCode,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await this.createOrUpdateProfile(profile);
    return profile;
  }

  static async getPublicSummary(userId: string): Promise<PublicUserSummary | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteProfileRow>(
      `SELECT id, username, display_name, avatar_url, friend_code, global_level, rank_tier, rank_division, current_streak
       FROM profiles WHERE id = ?;`,
      [userId]
    );
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      friendCode: row.friend_code || 'ASC-0000',
      globalLevel: row.global_level,
      rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(row.rank_tier) ? row.rank_tier : 'E') as RankTier,
      rankDivision: row.rank_division,
      currentStreak: row.current_streak,
    };
  }

  static async migrateGuestUser(
    guestId: string,
    authId: string,
    email?: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Check if a profile with authId already exists
    const existingAuthProfile = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM profiles WHERE id = ?;`,
      [authId]
    );

    if (existingAuthProfile) {
      // Profile exists on authId: update it with guest data and remove old guest row
      const guestProfile = await this.getProfile(guestId);
      if (guestProfile) {
        await db.runAsync(
          `UPDATE profiles SET
            username = ?,
            avatar_url = ?,
            goal = ?,
            primary_goal = ?,
            secondary_goals = ?,
            experience = ?,
            age = ?,
            height_cm = ?,
            weight_kg = ?,
            training_preferences = ?,
            global_level = MAX(global_level, ?),
            total_xp = total_xp + ?,
            attributes = ?,
            is_guest = 0,
            onboarding_completed = 1,
            auth_id = ?,
            updated_at = ?
          WHERE id = ?;`,
          [
            guestProfile.username,
            guestProfile.avatarUrl,
            guestProfile.goal,
            guestProfile.primaryGoal || normalizeGoal(guestProfile.goal),
            JSON.stringify(guestProfile.secondaryGoals || []),
            guestProfile.experience,
            guestProfile.age,
            guestProfile.heightCm,
            guestProfile.weightKg,
            JSON.stringify(guestProfile.trainingPreferences),
            guestProfile.globalLevel,
            guestProfile.totalXp,
            JSON.stringify(guestProfile.attributes),
            authId,
            now,
            authId,
          ]
        );
      }
      await db.runAsync(`DELETE FROM profiles WHERE id = ?;`, [guestId]);
    } else {
      // Update the guest row directly to the new authId
      await db.runAsync(
        `UPDATE profiles SET
          id = ?,
          auth_id = ?,
          is_guest = 0,
          onboarding_completed = 1,
          updated_at = ?
        WHERE id = ?;`,
        [authId, authId, now, guestId]
      );
    }

    // Cascade update all dependent tables
    await db.runAsync(`UPDATE user_settings SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE workout_plans SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE workouts SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE exercise_logs SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE set_logs SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE exercise_mastery SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE personal_records SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE xp_transactions SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE workout_templates SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE user_achievements SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE user_quests SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE user_milestones SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE nutrition_logs SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);

    // Social & Privacy Tables
    await db.runAsync(`UPDATE friendships SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE friendships SET friend_id = ? WHERE friend_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE friend_requests SET sender_id = ?, updated_at = ? WHERE sender_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE friend_requests SET receiver_id = ?, updated_at = ? WHERE receiver_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE blocks SET blocker_id = ? WHERE blocker_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE blocks SET blocked_id = ? WHERE blocked_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE activity_feed SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE activity_reactions SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE privacy_settings SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);

    // Challenges & Health Connect Tables
    await db.runAsync(`UPDATE challenges SET created_by = ?, updated_at = ? WHERE created_by = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE challenge_participants SET user_id = ?, last_updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
    await db.runAsync(`UPDATE challenge_events SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE health_records SET user_id = ? WHERE user_id = ?;`, [authId, guestId]);
    await db.runAsync(`UPDATE health_sync_state SET user_id = ?, updated_at = ? WHERE user_id = ?;`, [authId, now, guestId]);
  }
}
