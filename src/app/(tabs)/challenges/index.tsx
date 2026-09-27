import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { TitlesModal } from '../../../components/titles/TitlesModal';
import {
  Challenge,
  ChallengeParticipant,
  ChallengeLeaderboardEntry,
} from '../../../types/challenge.types';
import { ChallengeEngine } from '../../../services/challenges/ChallengeEngine';

type FilterTab = 'ALL' | 'ACTIVE' | 'AVAILABLE' | 'COMPLETED' | 'PAUSED';

interface ChallengeWithUserStatus extends Challenge {
  participant?: ChallengeParticipant;
  userStatus: 'AVAILABLE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  participantsCount: number;
}

export default function ChallengesScreen() {
  const router = useRouter();
  const { colors, borderRadius, isDark } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id || '';

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [challenges, setChallenges] = useState<ChallengeWithUserStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals
  const [titlesModalVisible, setTitlesModalVisible] = useState(false);
  const [selectedLeaderboardChallenge, setSelectedLeaderboardChallenge] = useState<Challenge | null>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<ChallengeLeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const loadChallenges = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await ChallengeEngine.getAllChallengesWithUserStatus(userId);
      setChallenges(data as ChallengeWithUserStatus[]);
    } catch (err) {
      console.error('[ChallengesScreen] Failed to load challenges:', err);
    }
  }, [userId]);

  useEffect(() => {
    setIsLoading(true);
    loadChallenges().finally(() => setIsLoading(false));
  }, [loadChallenges]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChallenges();
    setRefreshing(false);
  };

  // Challenge Lifecycle Actions
  const handleJoin = async (challenge: ChallengeWithUserStatus) => {
    if (!userId) return;
    setActionLoadingId(challenge.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await ChallengeEngine.joinChallenge(userId, challenge.id);
      Alert.alert('Directive Accepted', `You have joined "${challenge.title}". All qualifying training sessions will now contribute.`);
      await loadChallenges();
    } catch (err: any) {
      Alert.alert('Join Error', err.message || 'Failed to join challenge');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePause = (challenge: ChallengeWithUserStatus) => {
    Alert.alert(
      'Pause Challenge',
      `Pausing "${challenge.title}" allows you to prioritize rest, recovery, or other training blocks. Your accumulated progress is preserved. Workouts will not count until resumed.`,
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Pause Challenge',
          style: 'default',
          onPress: async () => {
            setActionLoadingId(challenge.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
              await ChallengeEngine.pauseChallenge(userId, challenge.id);
              await loadChallenges();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to pause challenge');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleResume = async (challenge: ChallengeWithUserStatus) => {
    setActionLoadingId(challenge.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await ChallengeEngine.resumeChallenge(userId, challenge.id);
      Alert.alert('Challenge Resumed', `Participation in "${challenge.title}" is now active again.`);
      await loadChallenges();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to resume challenge');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = (challenge: ChallengeWithUserStatus) => {
    Alert.alert(
      'Cancel Participation',
      `Are you sure you want to cancel "${challenge.title}"? You can re-enlist at any time to resume.`,
      [
        { text: 'Keep Challenge', style: 'cancel' },
        {
          text: 'Cancel Participation',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(challenge.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              await ChallengeEngine.cancelChallenge(userId, challenge.id);
              await loadChallenges();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel challenge');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const openLeaderboard = async (challenge: Challenge) => {
    setSelectedLeaderboardChallenge(challenge);
    setIsLeaderboardLoading(true);
    try {
      const entries = await ChallengeEngine.getLeaderboard(challenge.id, userId);
      setLeaderboardEntries(entries);
    } catch (err) {
      console.error('[ChallengesScreen] Failed to load leaderboard:', err);
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  // Filter Challenges
  const filteredChallenges = challenges.filter((c) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'ACTIVE') return c.userStatus === 'ACTIVE';
    if (activeTab === 'AVAILABLE') return c.userStatus === 'AVAILABLE' || c.userStatus === 'CANCELLED';
    if (activeTab === 'COMPLETED') return c.userStatus === 'COMPLETED';
    if (activeTab === 'PAUSED') return c.userStatus === 'PAUSED';
    return true;
  });

  const activeCount = challenges.filter((c) => c.userStatus === 'ACTIVE').length;
  const availableCount = challenges.filter((c) => c.userStatus === 'AVAILABLE' || c.userStatus === 'CANCELLED').length;
  const completedCount = challenges.filter((c) => c.userStatus === 'COMPLETED').length;
  const pausedCount = challenges.filter((c) => c.userStatus === 'PAUSED').length;

  return (
    <ScreenContainer scrollable={false}>
      {/* Top Header */}
      <View style={[styles.headerContainer, { borderBottomColor: colors.borderSubtle }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceElevated }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Heading level={3} style={{ color: colors.textPrimary, letterSpacing: 0.5 }}>
            CHALLENGES & DIRECTIVES
          </Heading>
          <Caption style={{ color: colors.textSecondary }}>
            Squad and solo performance milestones
          </Caption>
        </View>
        <TouchableOpacity
          onPress={() => setTitlesModalVisible(true)}
          style={[styles.titlesIconButton, { backgroundColor: colors.surfaceElevated }]}
        >
          <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Titles Quick Access Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTitlesModalVisible(true)}
          style={[
            styles.titlesCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.titlesIconBox, { backgroundColor: colors.surfaceGlass }]}>
            <Ionicons name="trophy-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.titlesInfoBox}>
            <View style={styles.titlesHeaderRow}>
              <Heading level={3} style={{ color: colors.textPrimary, fontSize: 15 }}>
                TITLES & ACCOLADES
              </Heading>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
            <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
              Equip titles unlocked through challenges, streaks, and strength milestones.
            </Caption>
          </View>
        </TouchableOpacity>

        {/* Safe Training & Recovery Callout */}
        <View
          style={[
            styles.safetyCard,
            {
              backgroundColor: colors.surfaceGlassHeavy,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <Ionicons name="shield-checkmark" size={18} color={colors.accent} style={styles.safetyIcon} />
          <View style={{ flex: 1 }}>
            <MonoText style={[styles.safetyTitle, { color: colors.textPrimary }]}>
              ASCEND TRAINING PRINCIPLES
            </MonoText>
            <Caption style={[styles.safetyText, { color: colors.textSecondary }]}>
              Prioritize progressive overload and adequate recovery. Avoid excessive volume or lifting through sharp joint pain. Use the <Caption style={{ fontWeight: '700', color: colors.textPrimary }}>Pause</Caption> action anytime your body needs recovery.
            </Caption>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabsRow}>
          {(
            [
              { key: 'ALL', label: `ALL (${challenges.length})` },
              { key: 'ACTIVE', label: `ACTIVE (${activeCount})` },
              { key: 'AVAILABLE', label: `AVAILABLE (${availableCount})` },
              { key: 'PAUSED', label: `PAUSED (${pausedCount})` },
              { key: 'COMPLETED', label: `COMPLETED (${completedCount})` },
            ] as const
          ).map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveTab(tab.key);
                }}
                style={[
                  styles.filterTabButton,
                  {
                    borderColor: isSelected ? 'transparent' : colors.border,
                    backgroundColor: isSelected ? colors.primaryButton : colors.surface,
                  },
                ]}
              >
                <MonoText
                  style={[
                    styles.filterTabText,
                    { color: isSelected ? colors.primaryButtonText : colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </MonoText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Challenges List */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Caption style={{ marginTop: 8, color: colors.textSecondary }}>Loading directives...</Caption>
          </View>
        ) : filteredChallenges.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No Directives Found
            </Text>
            <Caption style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 4 }}>
              {activeTab === 'ACTIVE'
                ? 'You do not have any active challenges right now. Browse AVAILABLE challenges to enlist.'
                : activeTab === 'COMPLETED'
                ? 'No completed challenges yet. Complete active directives to unlock rewards and titles.'
                : 'No challenges match this filter category.'}
            </Caption>
          </View>
        ) : (
          filteredChallenges.map((challenge) => {
            const participant = challenge.participant;
            const progress = participant ? participant.progress : 0;
            const target = challenge.target || 1;
            const percentage = Math.min(100, Math.round((progress / target) * 100));
            const isComplete = challenge.userStatus === 'COMPLETED';
            const isActive = challenge.userStatus === 'ACTIVE';
            const isPaused = challenge.userStatus === 'PAUSED';
            const isAvailable = challenge.userStatus === 'AVAILABLE' || challenge.userStatus === 'CANCELLED';

            return (
              <Card
                key={challenge.id}
                style={[
                  styles.challengeCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isActive ? colors.accent : colors.border,
                  },
                ]}
              >
                {/* Header: Type, Status, Visibility */}
                <View style={styles.cardTopRow}>
                  <View style={styles.badgeGroup}>
                    <Badge
                      label={challenge.type}
                      variant="neutral"
                      size="sm"
                    />
                    <Badge
                      label={challenge.visibility}
                      variant="accent"
                      size="sm"
                      style={{ marginLeft: 6 }}
                    />
                    {isComplete && (
                      <Badge
                        label="COMPLETED"
                        variant="emerald"
                        size="sm"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                    {isPaused && (
                      <Badge
                        label="PAUSED"
                        variant="amber"
                        size="sm"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                    {isActive && (
                      <Badge
                        label="ACTIVE"
                        variant="accent"
                        size="sm"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </View>

                  <Caption style={[styles.participantsCount, { color: colors.textMuted }]}>
                    👥 {challenge.participantsCount || 1}
                  </Caption>
                </View>

                {/* Title & Description */}
                <Heading level={3} style={[styles.challengeTitle, { color: colors.textPrimary }]}>
                  {challenge.title}
                </Heading>
                <Text style={[styles.challengeDesc, { color: colors.textSecondary }]}>
                  {challenge.description}
                </Text>

                {/* Objective & Progress */}
                <View style={[styles.progressBox, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={styles.progressHeaderRow}>
                    <MonoText style={[styles.progressLabel, { color: colors.textSecondary }]}>
                      PROGRESS ({challenge.metric.replace('_', ' ')})
                    </MonoText>
                    <MonoText style={[styles.progressValues, { color: colors.textPrimary }]}>
                      {progress.toLocaleString()} / {target.toLocaleString()} ({percentage}%)
                    </MonoText>
                  </View>
                  <ProgressBar
                    progressPercent={percentage}
                    color={isComplete ? colors.emerald : isPaused ? colors.amber : colors.accent}
                  />
                </View>

                {/* Rewards Row */}
                <View style={styles.rewardsRow}>
                  <Caption style={[styles.rewardsPrefix, { color: colors.textMuted }]}>
                    REWARDS:
                  </Caption>
                  {challenge.rewardTitleName ? (
                    <View style={[styles.rewardPill, { backgroundColor: colors.peach }]}>
                      <Ionicons name="ribbon-outline" size={12} color={colors.peachText} style={{ marginRight: 4 }} />
                      <MonoText style={[styles.rewardPillText, { color: colors.peachText }]}>
                        Title: {challenge.rewardTitleName}
                      </MonoText>
                    </View>
                  ) : null}

                  {challenge.rewardXp ? (
                    <View style={[styles.rewardPill, { backgroundColor: colors.mint }]}>
                      <Ionicons name="sparkles-outline" size={12} color={colors.mintText} style={{ marginRight: 4 }} />
                      <MonoText style={[styles.rewardPillText, { color: colors.mintText }]}>
                        +{challenge.rewardXp} XP
                      </MonoText>
                    </View>
                  ) : null}
                </View>

                {/* Card Actions */}
                <View style={[styles.cardFooter, { borderTopColor: colors.borderSubtle }]}>
                  {isAvailable && (
                    <Button
                      title="ENLIST IN CHALLENGE"
                      variant="primary"
                      loading={actionLoadingId === challenge.id}
                      disabled={actionLoadingId === challenge.id}
                      onPress={() => handleJoin(challenge)}
                      fullWidth
                    />
                  )}

                  {isActive && (
                    <View style={styles.actionButtonGroup}>
                      <Button
                        title="PAUSE"
                        variant="outline"
                        size="sm"
                        icon={<Ionicons name="pause" size={13} color={colors.warning} />}
                        disabled={actionLoadingId === challenge.id}
                        onPress={() => handlePause(challenge)}
                        style={{ flex: 1, borderColor: colors.warning }}
                        textStyle={{ color: colors.warning }}
                      />
                      <Button
                        title="CANCEL"
                        variant="outline"
                        size="sm"
                        icon={<Ionicons name="close" size={13} color={colors.crimson} />}
                        disabled={actionLoadingId === challenge.id}
                        onPress={() => handleCancel(challenge)}
                        style={{ flex: 1, borderColor: colors.crimson }}
                        textStyle={{ color: colors.crimson }}
                      />
                      <IconButton
                        icon={<Ionicons name="podium-outline" size={16} color={colors.textPrimary} />}
                        onPress={() => openLeaderboard(challenge)}
                        variant="surface"
                      />
                    </View>
                  )}

                  {isPaused && (
                    <View style={styles.actionButtonGroup}>
                      <Button
                        title="RESUME CHALLENGE"
                        variant="primary"
                        size="sm"
                        loading={actionLoadingId === challenge.id}
                        disabled={actionLoadingId === challenge.id}
                        onPress={() => handleResume(challenge)}
                        style={{ flex: 2 }}
                      />
                      <Button
                        title="CANCEL"
                        variant="outline"
                        size="sm"
                        icon={<Ionicons name="close" size={13} color={colors.crimson} />}
                        disabled={actionLoadingId === challenge.id}
                        onPress={() => handleCancel(challenge)}
                        style={{ flex: 1, borderColor: colors.crimson }}
                        textStyle={{ color: colors.crimson }}
                      />
                    </View>
                  )}

                  {isComplete && (
                    <View style={styles.completedFooterRow}>
                      <View style={styles.completedBadgeRow}>
                        <Ionicons name="checkmark-done-circle" size={16} color={colors.emerald} />
                        <Caption style={[styles.completedDateText, { color: colors.emerald }]}>
                          Completed on {participant?.completedAt ? new Date(participant.completedAt).toLocaleDateString() : 'Target Reached'}
                        </Caption>
                      </View>
                      <TouchableOpacity
                        onPress={() => openLeaderboard(challenge)}
                        style={[styles.iconActionBtn, { backgroundColor: colors.surfaceElevated }]}
                      >
                        <Ionicons name="podium-outline" size={16} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Titles Catalog & Equipping Modal */}
      <TitlesModal
        visible={titlesModalVisible}
        userId={userId}
        onClose={() => setTitlesModalVisible(false)}
      />

      {/* Leaderboard Modal */}
      <Modal
        visible={selectedLeaderboardChallenge !== null}
        onClose={() => setSelectedLeaderboardChallenge(null)}
        title={selectedLeaderboardChallenge ? `LEADERBOARD: ${selectedLeaderboardChallenge.title}` : 'LEADERBOARD'}
        contentStyle={{ maxHeight: 560 }}
      >
        {isLeaderboardLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Caption style={{ marginTop: 8 }}>Fetching rankings...</Caption>
          </View>
        ) : leaderboardEntries.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={{ color: colors.textSecondary }}>No rankings recorded yet for this challenge.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {leaderboardEntries.map((entry) => (
              <View
                key={entry.userId}
                style={[
                  styles.leaderboardRow,
                  {
                    backgroundColor: entry.isCurrentUser ? colors.surfaceElevated : colors.surface,
                    borderColor: entry.isCurrentUser ? colors.primary : colors.borderSubtle,
                  },
                ]}
              >
                <View style={styles.rankNumBox}>
                  <MonoText
                    style={[
                      styles.rankNumText,
                      { color: entry.rank <= 3 ? colors.accent : colors.textMuted },
                    ]}
                  >
                    #{entry.rank}
                  </MonoText>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.leaderboardName, { color: colors.textPrimary }]}>
                    {entry.displayName || entry.username}
                    {entry.isCurrentUser ? ' (You)' : ''}
                  </Text>
                  <Caption style={{ color: colors.textSecondary }}>
                    Level {entry.globalLevel} • Rank {entry.rankTier}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <MonoText style={[styles.leaderboardProgress, { color: colors.textPrimary }]}>
                    {entry.progress.toLocaleString()}
                  </MonoText>
                  <Caption style={{ color: entry.isCompleted ? colors.emerald : colors.textMuted }}>
                    {entry.isCompleted ? '✓ Completed' : `${entry.percentage}%`}
                  </Caption>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  titlesIconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  titlesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  titlesIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titlesInfoBox: {
    flex: 1,
  },
  titlesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  safetyCard: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  safetyIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  safetyTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  safetyText: {
    fontSize: 11,
    lineHeight: 16,
  },
  filterTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  filterTabButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 10,
    fontWeight: '700',
  },
  centerContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  challengeCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantsCount: {
    fontSize: 11,
  },
  challengeTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  challengeDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  progressBox: {
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressValues: {
    fontSize: 11,
    fontWeight: '700',
  },
  rewardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  rewardsPrefix: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  rewardPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
  },
  primaryActionBtn: {
    paddingVertical: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
  },
  secondaryActionBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completedDateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankNumBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rankNumText: {
    fontSize: 13,
    fontWeight: '700',
  },
  leaderboardName: {
    fontSize: 13,
    fontWeight: '600',
  },
  leaderboardProgress: {
    fontSize: 13,
    fontWeight: '700',
  },
});
