import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, StatText, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { ProgressBar } from '../ui/ProgressBar';
import {
  Challenge,
  ChallengeParticipant,
  ChallengeLeaderboardEntry,
} from '../../types/challenge.types';
import { ChallengeEngine } from '../../services/challenges/ChallengeEngine';

interface ChallengeHubModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
}

export const ChallengeHubModal: React.FC<ChallengeHubModalProps> = ({
  visible,
  userId,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'JOINED' | 'DISCOVER'>('JOINED');
  const [joinedChallenges, setJoinedChallenges] = useState<
    { challenge: Challenge; participant: ChallengeParticipant }[]
  >([]);
  const [availableChallenges, setAvailableChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [joined, available] = await Promise.all([
        ChallengeEngine.getJoinedChallenges(userId),
        ChallengeEngine.getAvailableChallenges(userId, 'ACTIVE'),
      ]);
      setJoinedChallenges(joined);
      // Filter out challenges already joined from discover list
      const joinedIds = new Set(joined.map(j => j.challenge.id));
      setAvailableChallenges(available.filter(a => !joinedIds.has(a.id)));
    } catch (err) {
      console.error('Failed to load challenges:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const loadLeaderboard = async (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setIsLeaderboardLoading(true);
    try {
      const entries = await ChallengeEngine.getLeaderboard(challenge.id, userId);
      setLeaderboard(entries);
    } catch (err) {
      console.error('Failed to load challenge leaderboard:', err);
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const handleJoin = async (challengeId: string) => {
    try {
      await ChallengeEngine.joinChallenge(userId, challengeId);
      Alert.alert('Directive Accepted', 'You have enlisted in this challenge. All verified sessions will contribute automatically.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Enlistment Error', err.message || 'Failed to join challenge');
    }
  };

  const handleLeave = (challengeId: string) => {
    Alert.alert(
      'Leave Challenge',
      'Are you sure you want to withdraw from this challenge? Your current progress will be preserved if you re-join.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChallengeEngine.leaveChallenge(userId, challengeId);
              if (selectedChallenge?.id === challengeId) {
                setSelectedChallenge(null);
              }
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to leave challenge');
            }
          },
        },
      ]
    );
  };

  const formatMetricUnit = (metric: string) => {
    switch (metric) {
      case 'WORKOUTS': return 'workouts';
      case 'VOLUME_KG': return 'kg';
      case 'DISTANCE_KM': return 'km';
      case 'STEPS': return 'steps';
      case 'DURATION_MINUTES': return 'mins';
      case 'XP': return 'XP';
      case 'DAYS_ACTIVE': return 'days';
      case 'SESSIONS': return 'sessions';
      default: return '';
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="SQUAD CHALLENGES">
      <View style={styles.container}>
        {/* Navigation Tabs */}
        {!selectedChallenge && (
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'JOINED' && styles.activeTab]}
              onPress={() => setActiveTab('JOINED')}
            >
              <Text style={[styles.tabText, activeTab === 'JOINED' && styles.activeTabText]}>
                ACTIVE DIRECTIVES ({joinedChallenges.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'DISCOVER' && styles.activeTab]}
              onPress={() => setActiveTab('DISCOVER')}
            >
              <Text style={[styles.tabText, activeTab === 'DISCOVER' && styles.activeTabText]}>
                DISCOVER ({availableChallenges.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={THEME.colors.cyan} />
            <Text style={styles.loadingText}>Retrieving tactical directives...</Text>
          </View>
        ) : selectedChallenge ? (
          /* Challenge Detail & Leaderboard View */
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSelectedChallenge(null)}
            >
              <Text style={styles.backButtonText}>← BACK TO CHALLENGES</Text>
            </TouchableOpacity>

            <Card style={styles.detailHeaderCard}>
              <View style={styles.headerRow}>
                <Badge label={selectedChallenge.type.replace(/_/g, ' ')} variant="cyan" />
                {selectedChallenge.rewardXp && (
                  <Badge label={`+${selectedChallenge.rewardXp} XP`} variant="amber" />
                )}
              </View>
              <Heading level={3} style={styles.detailTitle}>
                {selectedChallenge.title}
              </Heading>
              <Text style={styles.detailDescription}>{selectedChallenge.description}</Text>
              
              <View style={styles.targetBanner}>
                <Caption>OBJECTIVE TARGET</Caption>
                <StatText size="md" color="primary">
                  {selectedChallenge.target.toLocaleString()} {formatMetricUnit(selectedChallenge.metric)}
                </StatText>
              </View>
            </Card>

            <View style={styles.leaderboardSection}>
              <Heading level={3} style={styles.sectionTitle}>
                OPERATIVE LEADERBOARD
              </Heading>
              <Caption style={styles.privacyNotice}>
                🛡️ Zero Health Leakage: Leaderboards expose athletic progress only. Biometrics and notes remain private.
              </Caption>

              {isLeaderboardLoading ? (
                <ActivityIndicator size="small" color={THEME.colors.cyan} style={{ marginTop: 16 }} />
              ) : leaderboard.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No operatives have engaged this directive yet.</Text>
                </Card>
              ) : (
                leaderboard.map((entry) => (
                  <Card
                    key={entry.userId}
                    style={[styles.entryCard, entry.isCurrentUser && styles.currentUserCard]}
                  >
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankNumber}>#{entry.rank}</Text>
                    </View>

                    <View style={styles.operativeInfo}>
                      <View style={styles.callsignRow}>
                        <Text style={styles.avatarGlyph}>{entry.avatarUrl || '⚔️'}</Text>
                        <Text style={styles.callsignText}>{entry.displayName}</Text>
                        <Badge label={`RANK ${entry.rankTier}`} variant="neutral" size="sm" />
                      </View>
                      <View style={styles.progressRow}>
                        <ProgressBar
                          progressPercent={entry.percentage}
                          color={entry.isCompleted ? THEME.colors.emerald : THEME.colors.cyan}
                          size="sm"
                        />
                      </View>
                    </View>

                    <View style={styles.scoreBox}>
                      <Text style={styles.scoreText}>
                        {Math.round(entry.progress).toLocaleString()}
                      </Text>
                      <Caption style={styles.unitText}>
                        /{selectedChallenge.target.toLocaleString()}
                      </Caption>
                    </View>
                  </Card>
                ))
              )}
            </View>

            <View style={styles.actionFooter}>
              <Button
                title="LEAVE DIRECTIVE"
                variant="outline"
                onPress={() => handleLeave(selectedChallenge.id)}
              />
            </View>
          </ScrollView>
        ) : activeTab === 'JOINED' ? (
          /* Active / Joined Challenges Tab */
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {joinedChallenges.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🎯</Text>
                <Heading level={3} style={styles.emptyTitle}>
                  No Active Directives
                </Heading>
                <Text style={styles.emptyText}>
                  Enlist in an available challenge from the Discover tab to test your discipline against your squad.
                </Text>
                <Button
                  title="EXPLORE CHALLENGES"
                  variant="primary"
                  style={{ marginTop: 16 }}
                  onPress={() => setActiveTab('DISCOVER')}
                />
              </Card>
            ) : (
              joinedChallenges.map(({ challenge, participant }) => {
                const target = challenge.target || 1;
                const percent = Math.min(100, Math.round((participant.progress / target) * 100));
                const isCompleted = participant.status === 'COMPLETED' || participant.progress >= target;

                return (
                  <Card key={challenge.id} style={styles.challengeCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.badgeRow}>
                        <Badge
                          label={isCompleted ? 'COMPLETED' : 'IN PROGRESS'}
                          variant={isCompleted ? 'emerald' : 'cyan'}
                        />
                        <Badge label={`RANK #${participant.rank}`} variant="neutral" />
                      </View>
                      {challenge.rewardXp && (
                        <Badge label={`+${challenge.rewardXp} XP`} variant="amber" />
                      )}
                    </View>

                    <Heading level={3} style={styles.challengeTitle}>
                      {challenge.title}
                    </Heading>
                    <Text style={styles.challengeDescription}>{challenge.description}</Text>

                    <View style={styles.progressContainer}>
                      <View style={styles.progressHeader}>
                        <Caption>PROGRESS</Caption>
                        <MonoText style={styles.progressValue}>
                          {Math.round(participant.progress).toLocaleString()} / {challenge.target.toLocaleString()} {formatMetricUnit(challenge.metric)} ({percent}%)
                        </MonoText>
                      </View>
                      <ProgressBar
                        progressPercent={percent}
                        color={isCompleted ? THEME.colors.emerald : THEME.colors.cyan}
                      />
                    </View>

                    <View style={styles.cardActions}>
                      <Button
                        title="LEADERBOARD"
                        variant="secondary"
                        size="sm"
                        onPress={() => loadLeaderboard(challenge)}
                      />
                    </View>
                  </Card>
                );
              })
            )}
          </ScrollView>
        ) : (
          /* Discover Challenges Tab */
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {availableChallenges.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>⚡</Text>
                <Heading level={3} style={styles.emptyTitle}>
                  All Directives Claimed
                </Heading>
                <Text style={styles.emptyText}>
                  You have enrolled in all currently active directives. Complete your active protocols to claim rewards.
                </Text>
              </Card>
            ) : (
              availableChallenges.map((challenge) => (
                <Card key={challenge.id} style={styles.challengeCard}>
                  <View style={styles.cardHeader}>
                    <Badge label={challenge.type.replace(/_/g, ' ')} variant="cyan" />
                    {challenge.rewardXp && (
                      <Badge label={`+${challenge.rewardXp} XP`} variant="amber" />
                    )}
                  </View>

                  <Heading level={3} style={styles.challengeTitle}>
                    {challenge.title}
                  </Heading>
                  <Text style={styles.challengeDescription}>{challenge.description}</Text>

                  <View style={styles.objectiveRow}>
                    <Caption>OBJECTIVE</Caption>
                    <Text style={styles.objectiveValue}>
                      {challenge.target.toLocaleString()} {formatMetricUnit(challenge.metric)}
                    </Text>
                  </View>

                  <View style={styles.cardActions}>
                    <Button
                      title="ENLIST DIRECTIVE"
                      variant="primary"
                      size="sm"
                      onPress={() => handleJoin(challenge.id)}
                    />
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: THEME.colors.cyan,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    letterSpacing: 1,
  },
  activeTabText: {
    color: THEME.colors.cyan,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  centerContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: THEME.colors.textSecondary,
  },
  challengeCard: {
    marginBottom: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  challengeTitle: {
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  challengeDescription: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  progressContainer: {
    marginTop: 6,
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressValue: {
    fontSize: 12,
    color: THEME.colors.cyan,
  },
  objectiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  objectiveValue: {
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    marginTop: 24,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.cyan,
    letterSpacing: 1,
  },
  detailHeaderCard: {
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailTitle: {
    marginBottom: 8,
  },
  detailDescription: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  targetBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 240, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.15)',
  },
  leaderboardSection: {
    marginTop: 8,
  },
  sectionTitle: {
    marginBottom: 4,
    letterSpacing: 1,
  },
  privacyNotice: {
    marginBottom: 12,
    color: THEME.colors.textMuted,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  currentUserCard: {
    borderColor: THEME.colors.cyan,
    borderWidth: 1,
    backgroundColor: 'rgba(0, 240, 255, 0.04)',
  },
  rankBadge: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontWeight: '800',
    fontSize: 14,
    color: THEME.colors.cyan,
  },
  operativeInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },
  callsignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  avatarGlyph: {
    fontSize: 14,
  },
  callsignText: {
    fontWeight: '700',
    fontSize: 13,
    color: THEME.colors.textPrimary,
  },
  progressRow: {
    width: '100%',
  },
  scoreBox: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  unitText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
  actionFooter: {
    marginTop: 20,
    alignItems: 'center',
  },
});
