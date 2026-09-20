import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { THEME } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { QuestRepository } from '../../../database/repositories/QuestRepository';
import { UserQuestProgress, QuestState } from '../../../types/quest.types';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';

type FilterTab = 'ALL' | 'IN_PROGRESS' | 'AVAILABLE' | 'COMPLETED' | 'LOCKED';

const FILTER_TABS: { label: string; key: FilterTab }[] = [
  { label: 'ALL', key: 'ALL' },
  { label: 'ACTIVE', key: 'IN_PROGRESS' },
  { label: 'AVAILABLE', key: 'AVAILABLE' },
  { label: 'COMPLETED', key: 'COMPLETED' },
  { label: 'LOCKED', key: 'LOCKED' },
];

export default function QuestsScreen() {
  const profile = useAuthStore(s => s.profile);
  const [quests, setQuests] = useState<UserQuestProgress[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState('');

  // Real-time calculation of daily reset countdown (Midnight UTC/Local)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diffMs = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      setTimeUntilReset(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadQuests = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const userLevel = profile.globalLevel || 1;
      const data = await QuestRepository.getQuestsWithState(profile.id, userLevel);
      setQuests(data);
    } catch (err) {
      console.error('Failed to load quests with state:', err);
    }
  }, [profile?.id, profile?.globalLevel]);

  useEffect(() => {
    loadQuests();
  }, [loadQuests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadQuests();
    setRefreshing(false);
  };

  const filteredQuests = quests.filter(q => {
    if (selectedFilter === 'ALL') return true;
    return q.state === selectedFilter;
  });

  const getStateBadgeVariant = (state?: QuestState) => {
    switch (state) {
      case 'COMPLETED':
        return 'emerald';
      case 'IN_PROGRESS':
        return 'amber';
      case 'AVAILABLE':
        return 'cyan';
      case 'LOCKED':
        return 'neutral';
      case 'EXPIRED':
        return 'crimson';
      default:
        return 'cyan';
    }
  };

  return (
    <ScreenContainer scrollable={false}>
      {/* Directives Header */}
      <View style={styles.header}>
        <Heading level={1} style={styles.title}>TACTICAL DIRECTIVES</Heading>
        <Caption style={styles.subtitle}>
          Daily mission parameters, weekly feats, and ascension campaigns
        </Caption>

        <View style={styles.resetRow}>
          <Caption upper color={THEME.colors.textMuted}>DAILY PROTOCOL RESET IN:</Caption>
          <MonoText color={THEME.colors.cyan} style={styles.resetTimer}>
            {timeUntilReset || '00:00:00'}
          </MonoText>
        </View>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {FILTER_TABS.map(tab => {
            const count = tab.key === 'ALL'
              ? quests.length
              : quests.filter(q => q.state === tab.key).length;

            const isSelected = selectedFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setSelectedFilter(tab.key)}
                style={[styles.filterPill, isSelected && styles.filterPillActive]}
              >
                <Text
                  color={isSelected ? THEME.colors.cyan : THEME.colors.textSecondary}
                  style={styles.filterText}
                >
                  {tab.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Directives List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.cyan}
            colors={[THEME.colors.cyan]}
          />
        }
      >
        {filteredQuests.length === 0 ? (
          <Card variant="surface" style={styles.emptyCard}>
            <Heading level={3} align="center" style={styles.emptyTitle}>
              No Directives in {selectedFilter} State
            </Heading>
            <Caption align="center" style={styles.emptyDesc}>
              Complete workouts to advance in-progress directives or wait for the next daily cycle reset.
            </Caption>
          </Card>
        ) : (
          filteredQuests.map(uq => {
            const quest = uq.quest;
            const state = uq.state || 'AVAILABLE';
            const percent = Math.min(100, Math.round((uq.currentProgress / uq.targetValue) * 100));
            const isLocked = state === 'LOCKED';
            const isCompleted = state === 'COMPLETED';

            return (
              <Card
                key={uq.id}
                variant="surface"
                accentBorder={isCompleted ? THEME.colors.emerald : isLocked ? THEME.colors.borderSubtle : THEME.colors.border}
                style={[styles.questCard, isLocked && styles.cardLocked]}
              >
                <View style={styles.questTopRow}>
                  <View style={styles.titleGroup}>
                    <Heading
                      level={3}
                      color={isLocked ? THEME.colors.textMuted : THEME.colors.textPrimary}
                      style={styles.questTitle}
                    >
                      {quest?.title}
                    </Heading>
                    <View style={styles.badgeRow}>
                      <Badge
                        label={state}
                        variant={getStateBadgeVariant(state)}
                        size="sm"
                        dot={state === 'IN_PROGRESS'}
                      />
                      <Badge
                        label={quest?.type || 'MISSION'}
                        variant="neutral"
                        size="sm"
                      />
                    </View>
                  </View>

                  <Badge
                    label={`+${quest?.xpReward} XP`}
                    variant={isLocked ? 'neutral' : (quest?.badgeVariant || 'cyan')}
                    size="sm"
                  />
                </View>

                <Text
                  color={isLocked ? THEME.colors.textMuted : THEME.colors.textSecondary}
                  style={styles.questDesc}
                >
                  {quest?.description}
                </Text>

                {isLocked ? (
                  <View style={styles.lockedRow}>
                    <Caption color={THEME.colors.textMuted}>🔒 REQUIRES GLOBAL LEVEL {quest?.minLevelRequired || 5}</Caption>
                  </View>
                ) : isCompleted ? (
                  <View style={styles.completedRow}>
                    <Caption color={THEME.colors.emerald}>✓ DIRECTIVE SECURED • XP MINTED</Caption>
                  </View>
                ) : (
                  <ProgressBar
                    progressPercent={percent}
                    color={state === 'IN_PROGRESS' ? THEME.colors.amber : THEME.colors.cyan}
                    size="sm"
                    label={`${uq.currentProgress.toLocaleString()} / ${uq.targetValue.toLocaleString()} ${quest?.unit}`}
                    showPercent
                  />
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  title: {
    letterSpacing: 1.5,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: THEME.spacing.xs,
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.sm,
  },
  resetTimer: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterPill: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 8,
  },
  filterPillActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.cyanSubtle,
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: THEME.spacing.sm,
    paddingBottom: 40,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    marginBottom: 6,
  },
  emptyDesc: {
    maxWidth: 280,
    lineHeight: 18,
  },
  questCard: {
    marginBottom: THEME.spacing.sm,
    padding: THEME.spacing.md,
  },
  cardLocked: {
    opacity: 0.65,
  },
  questTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  titleGroup: {
    flex: 1,
    marginRight: 10,
  },
  questTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  questDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  lockedRow: {
    paddingVertical: 4,
  },
  completedRow: {
    paddingVertical: 4,
  },
});
