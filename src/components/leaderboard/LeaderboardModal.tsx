import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { LeaderboardService, PublicLeaderboardEntry } from '../../services/leaderboard/LeaderboardService';

interface LeaderboardModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  visible,
  userId,
  onClose,
}) => {
  const [entries, setEntries] = useState<PublicLeaderboardEntry[]>([]);
  const [isOptedIn, setIsOptedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedScope, setSelectedScope] = useState<'GLOBAL' | 'FRIENDS'>('GLOBAL');

  const loadLeaderboard = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [optIn, list] = await Promise.all([
        LeaderboardService.getOptInStatus(userId),
        LeaderboardService.getWeeklyLeaderboard(userId, selectedScope),
      ]);
      setIsOptedIn(optIn);
      setEntries(list);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, selectedScope]);

  useEffect(() => {
    if (visible) {
      loadLeaderboard();
    }
  }, [visible, loadLeaderboard]);

  const toggleOptIn = async () => {
    const newStatus = !isOptedIn;
    try {
      await LeaderboardService.setOptIn(userId, newStatus);
      setIsOptedIn(newStatus);
      await loadLeaderboard();
      Alert.alert(
        newStatus ? 'Leaderboard Active' : 'Opted Out',
        newStatus
          ? 'Your callsign, avatar, and weekly XP are now visible on the weekly leaderboard.'
          : 'You have been removed from the public leaderboard. Your data is strictly private.'
      );
    } catch (err) {
      Alert.alert('Update Error', (err as Error).message);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="WEEKLY TACTICAL LEADERBOARD">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Privacy-First Opt-In Card */}
        <Card variant="surface" accentBorder={isOptedIn ? THEME.colors.emerald : THEME.colors.amber} style={styles.optInCard}>
          <View style={styles.optInHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Heading level={3} style={styles.optInTitle}>
                {isOptedIn ? 'LEADERBOARD STATUS: ACTIVE' : 'LEADERBOARD: OPTED OUT'}
              </Heading>
              <Caption style={styles.optInSub}>
                {isOptedIn
                  ? 'Your weekly XP is visible to fellow operatives. Private biometrics, notes, and workouts are never exposed.'
                  : 'You are currently hidden from public ranking. Enable opt-in below to benchmark weekly XP.'}
              </Caption>
            </View>
            <Button
              title={isOptedIn ? 'OPT OUT' : 'OPT IN'}
              variant={isOptedIn ? 'outline' : 'primary'}
              size="sm"
              onPress={toggleOptIn}
            />
          </View>
        </Card>

        {/* Scope Selector: GLOBAL vs FRIENDS */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12 }}>
          <Button
            title="GLOBAL SECTOR"
            variant={selectedScope === 'GLOBAL' ? 'primary' : 'outline'}
            size="sm"
            style={{ flex: 1 }}
            onPress={() => setSelectedScope('GLOBAL')}
          />
          <Button
            title="MUTUAL ALLIES"
            variant={selectedScope === 'FRIENDS' ? 'primary' : 'outline'}
            size="sm"
            style={{ flex: 1 }}
            onPress={() => setSelectedScope('FRIENDS')}
          />
        </View>

        {/* Leaderboard Table */}
        <Caption upper style={styles.sectionHeader}>
          {selectedScope === 'GLOBAL' ? 'TOP GLOBAL OPERATIVES' : 'TOP ALLIED OPERATIVES'} (THIS CALENDAR WEEK)
        </Caption>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={THEME.colors.cyan} />
            <Caption color={THEME.colors.cyan} style={{ marginTop: 6 }}>SYNCING TELEMETRY...</Caption>
          </View>
        ) : entries.length === 0 ? (
          <Card variant="surface" style={styles.emptyCard}>
            <Heading level={3} align="center" style={{ marginBottom: 4 }}>No Operatives Broadcasting</Heading>
            <Caption align="center">
              Be the first to opt in and establish this week's XP benchmark.
            </Caption>
          </Card>
        ) : (
          entries.map((entry, idx) => {
            const rankNum = idx + 1;
            const isTop3 = rankNum <= 3;
            const rankColor = rankNum === 1 ? '#FFD700' : rankNum === 2 ? '#C0C0C0' : rankNum === 3 ? '#CD7F32' : THEME.colors.textMuted;

            return (
              <Card
                key={entry.id}
                variant="surface"
                accentBorder={entry.isCurrentUser ? THEME.colors.cyan : THEME.colors.borderSubtle}
                style={[styles.entryCard, entry.isCurrentUser && styles.entryCurrentUser]}
              >
                <View style={styles.entryLeft}>
                  <MonoText color={rankColor} style={styles.rankNumText}>
                    #{rankNum}
                  </MonoText>
                  <Text style={styles.avatarText}>{entry.avatarUrl}</Text>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Heading level={3} style={styles.entryName}>{entry.displayName}</Heading>
                      {entry.isCurrentUser && <Badge label="YOU" variant="cyan" size="sm" />}
                    </View>
                    <Caption color={THEME.colors.textMuted}>
                      LVL {entry.level} • {entry.rankTier}-RANK DIV {entry.rankDivision}
                    </Caption>
                  </View>
                </View>

                <View style={styles.entryRight}>
                  <MonoText color={THEME.colors.cyan} style={styles.xpText}>
                    {entry.weeklyXp.toLocaleString()} XP
                  </MonoText>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: THEME.spacing.xs,
  },
  optInCard: {
    padding: 12,
    marginBottom: THEME.spacing.md,
  },
  optInHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optInTitle: {
    fontSize: 13,
    marginBottom: 2,
  },
  optInSub: {
    fontSize: 11,
    lineHeight: 16,
  },
  sectionHeader: {
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: THEME.spacing.xs,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: THEME.spacing.xs,
  },
  entryCurrentUser: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankNumText: {
    fontSize: 14,
    fontWeight: '900',
    width: 28,
  },
  avatarText: {
    fontSize: 20,
  },
  entryName: {
    fontSize: 14,
  },
  entryRight: {
    alignItems: 'flex-end',
  },
  xpText: {
    fontSize: 13,
    fontWeight: '900',
  },
});
