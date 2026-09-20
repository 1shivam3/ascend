import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { THEME } from '../../constants/theme';
import { PublicUserProfile } from '../../types/social.types';
import { FriendProfileService } from '../../services/social/FriendProfileService';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { Heading, Text, Caption, MonoText, StatText } from '../ui/Typography';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface FriendProfileModalProps {
  visible: boolean;
  currentUserId: string;
  targetUserId: string | null;
  onClose: () => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onAcceptRequest?: (userId: string) => Promise<void>;
  onRejectRequest?: (userId: string) => Promise<void>;
  onRemoveFriend?: (userId: string) => Promise<void>;
  onBlockUser?: (userId: string) => Promise<void>;
}

export const FriendProfileModal: React.FC<FriendProfileModalProps> = ({
  visible,
  currentUserId,
  targetUserId,
  onClose,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onRemoveFriend,
  onBlockUser,
}) => {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadDossier = useCallback(async () => {
    if (!targetUserId) return;
    setIsLoading(true);
    try {
      const data = await FriendProfileService.getPublicProfile(currentUserId, targetUserId);
      setProfile(data);
    } catch (err) {
      console.error('Failed to load operative dossier:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, targetUserId]);

  useEffect(() => {
    if (visible && targetUserId) {
      loadDossier();
    }
  }, [visible, targetUserId, loadDossier]);

  if (!targetUserId) return null;

  return (
    <Modal visible={visible} onClose={onClose} title="OPERATIVE DOSSIER">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={THEME.colors.cyan} />
            <Caption color={THEME.colors.cyan} style={{ marginTop: 8 }}>
              DECRYPTING OPERATIVE DOSSIER...
            </Caption>
          </View>
        ) : !profile ? (
          <Card variant="surface" style={styles.emptyCard}>
            <Heading level={3} align="center" style={{ marginBottom: 4 }}>
              Dossier Restricted
            </Heading>
            <Caption align="center">
              This operative's telemetry is classified or unavailable.
            </Caption>
          </Card>
        ) : (
          <>
            {/* Header Hero Card */}
            <Card variant="elevated" accentBorder={THEME.colors.cyan} style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <Text style={styles.heroAvatar}>{profile.avatarUrl || '⚔️'}</Text>
                <View style={{ flex: 1 }}>
                  <Heading level={2} style={styles.heroName}>
                    {profile.displayName}
                  </Heading>
                  <Caption color={THEME.colors.cyan}>@{profile.username}</Caption>
                  <View style={styles.badgeRow}>
                    <Badge
                      label={`RANK ${profile.rankTier}-${profile.rankDivision}`}
                      variant="amber"
                      size="sm"
                    />
                    <Badge
                      label={`LVL ${profile.globalLevel}`}
                      variant="cyan"
                      size="sm"
                    />
                    {profile.evolutionStage && (
                      <Badge
                        label={profile.evolutionStage.title}
                        variant="violet"
                        size="sm"
                      />
                    )}
                  </View>
                </View>
              </View>

              {/* Friend Code & Relationship Strip */}
              <View style={styles.codeStrip}>
                <View>
                  <Caption upper color={THEME.colors.textMuted}>TACTICAL CODE</Caption>
                  <MonoText color={THEME.colors.textPrimary} style={styles.codeText}>
                    {profile.friendCode}
                  </MonoText>
                </View>
                <Badge
                  label={
                    profile.relationship === 'FRIEND'
                      ? 'SQUADMATE'
                      : profile.relationship === 'REQUEST_SENT'
                      ? 'PENDING HANDSHAKE'
                      : profile.relationship === 'REQUEST_RECEIVED'
                      ? 'INCOMING RECRUIT'
                      : profile.relationship === 'SELF'
                      ? 'SELF'
                      : 'OPERATIVE'
                  }
                  variant={profile.relationship === 'FRIEND' ? 'emerald' : 'neutral'}
                  size="sm"
                />
              </View>
            </Card>

            {/* Tactical Combat Stats (Public) */}
            <Caption upper style={styles.sectionHeader}>COMBAT TELEMETRY</Caption>
            <View style={styles.statsGrid}>
              <Card variant="surface" style={styles.statBox}>
                <Caption upper style={styles.statLabel}>SESSIONS</Caption>
                <StatText size="md" color={THEME.colors.cyan}>
                  {profile.totalWorkoutsCompleted || 0}
                </StatText>
              </Card>

              <Card variant="surface" style={styles.statBox}>
                <Caption upper style={styles.statLabel}>TOTAL TONNAGE</Caption>
                <StatText size="md">
                  {(profile.lifetimeTonnageKg || 0) > 999
                    ? `${((profile.lifetimeTonnageKg || 0) / 1000).toFixed(1)}k kg`
                    : `${profile.lifetimeTonnageKg || 0} kg`}
                </StatText>
              </Card>

              <Card variant="surface" style={styles.statBox}>
                <Caption upper style={styles.statLabel}>DIRECTIVES</Caption>
                <StatText size="md" color={THEME.colors.emerald}>
                  {profile.challengesCompletedCount || 0}
                </StatText>
              </Card>

              {profile.currentStreak !== undefined && (
                <Card variant="surface" style={styles.statBox}>
                  <Caption upper style={styles.statLabel}>STREAK</Caption>
                  <StatText size="md" color={THEME.colors.amber}>
                    {profile.currentStreak} D
                  </StatText>
                </Card>
              )}
            </View>

            {/* Selected Compound Lifts Mastery */}
            <Caption upper style={styles.sectionHeader}>KEY LIFT MASTERY (PUBLIC BENCHMARKS)</Caption>
            {profile.selectedMastery.length === 0 ? (
              <Card variant="surface" style={styles.infoCard}>
                <Caption align="center">Mastery records hidden or none established.</Caption>
              </Card>
            ) : (
              profile.selectedMastery.map(m => (
                <Card key={m.exerciseId} variant="surface" style={styles.masteryCard}>
                  <View style={styles.masteryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.masteryName}>{m.exerciseName}</Text>
                      <Caption color={THEME.colors.textMuted}>Lift Level {m.masteryLevel}</Caption>
                    </View>
                    <Badge label={`RANK ${m.rank}`} variant="amber" size="sm" />
                  </View>
                  <View style={styles.masteryTelemetryRow}>
                    <View style={styles.masteryCol}>
                      <Caption upper style={styles.colLabel}>ESTIMATED 1RM</Caption>
                      <MonoText color={THEME.colors.cyan} style={styles.colVal}>
                        {m.estimated1RmKg} kg
                      </MonoText>
                    </View>
                    <View style={styles.masteryCol}>
                      <Caption upper style={styles.colLabel}>BEST WEIGHT</Caption>
                      <MonoText style={styles.colVal}>{m.bestWeightKg} kg</MonoText>
                    </View>
                    {m.relativeStrength ? (
                      <View style={styles.masteryCol}>
                        <Caption upper style={styles.colLabel}>REL. STRENGTH</Caption>
                        <MonoText color={THEME.colors.emerald} style={styles.colVal}>
                          {m.relativeStrength}x BW
                        </MonoText>
                      </View>
                    ) : null}
                  </View>
                </Card>
              ))
            )}

            {/* Selected Achievements Unlocked */}
            <Caption upper style={styles.sectionHeader}>COMBAT BADGES & COMMENDATIONS</Caption>
            {profile.selectedAchievements.length === 0 ? (
              <Card variant="surface" style={styles.infoCard}>
                <Caption align="center">No badges displayed on public record.</Caption>
              </Card>
            ) : (
              <View style={styles.achievementsGrid}>
                {profile.selectedAchievements.map(ach => (
                  <Card key={ach.id} variant="surface" style={styles.achievementBox}>
                    <Text style={styles.achIcon}>{ach.icon}</Text>
                    <Text style={styles.achTitle}>{ach.title}</Text>
                    <Caption style={styles.achDesc}>{ach.description}</Caption>
                  </Card>
                ))}
              </View>
            )}

            {/* Actions Strip */}
            {profile.relationship !== 'SELF' && (
              <View style={styles.actionStrip}>
                {profile.relationship === 'NONE' && onSendRequest && (
                  <Button
                    title="RECRUIT TO SQUAD"
                    variant="primary"
                    size="md"
                    onPress={async () => {
                      await onSendRequest(profile.id);
                      Alert.alert('Transmission Sent', `Friend request sent to ${profile.displayName}`);
                      await loadDossier();
                    }}
                    style={{ flex: 1 }}
                  />
                )}

                {profile.relationship === 'REQUEST_RECEIVED' && (
                  <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                    <Button
                      title="ACCEPT SQUAD REQUEST"
                      variant="primary"
                      size="md"
                      onPress={async () => {
                        await onAcceptRequest?.(profile.id);
                        await loadDossier();
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button
                      title="DECLINE"
                      variant="ghost"
                      size="md"
                      onPress={async () => {
                        await onRejectRequest?.(profile.id);
                        await loadDossier();
                      }}
                      style={{ flex: 1 }}
                    />
                  </View>
                )}

                {profile.relationship === 'FRIEND' && onRemoveFriend && (
                  <Button
                    title="DISMISS FROM SQUAD"
                    variant="ghost"
                    size="md"
                    onPress={async () => {
                      Alert.alert(
                        'Dismiss Squadmate',
                        `Are you sure you want to remove ${profile.displayName} from your squad?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Dismiss',
                            style: 'destructive',
                            onPress: async () => {
                              await onRemoveFriend(profile.id);
                              await loadDossier();
                            },
                          },
                        ]
                      );
                    }}
                    style={{ flex: 1 }}
                  />
                )}

                {onBlockUser && (
                  <Button
                    title="BLOCK"
                    variant="outline"
                    size="md"
                    onPress={() => {
                      Alert.alert(
                        'Block Operative',
                        `Block ${profile.displayName}? They will not be able to search, view, or interact with you.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Block',
                            style: 'destructive',
                            onPress: async () => {
                              await onBlockUser(profile.id);
                              onClose();
                            },
                          },
                        ]
                      );
                    }}
                  />
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: THEME.spacing.xs,
    paddingBottom: 24,
  },
  loadingContainer: {
    padding: 36,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  heroCard: {
    padding: 14,
    marginBottom: THEME.spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  heroAvatar: {
    fontSize: 36,
  },
  heroName: {
    fontSize: 16,
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  codeStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 8,
    marginTop: 4,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sectionHeader: {
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: THEME.spacing.xs,
    marginTop: THEME.spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: THEME.spacing.md,
  },
  statBox: {
    flex: 1,
    minWidth: '22%',
    padding: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    marginBottom: 2,
  },
  infoCard: {
    padding: 14,
    marginBottom: THEME.spacing.sm,
  },
  masteryCard: {
    padding: 12,
    marginBottom: THEME.spacing.xs,
  },
  masteryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  masteryName: {
    fontSize: 13,
    fontWeight: '800',
  },
  masteryTelemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 6,
  },
  masteryCol: {
    alignItems: 'center',
  },
  colLabel: {
    fontSize: 9,
    marginBottom: 2,
  },
  colVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: THEME.spacing.md,
  },
  achievementBox: {
    width: '48%',
    padding: 10,
  },
  achIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  achTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  achDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  actionStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: THEME.spacing.sm,
  },
});
