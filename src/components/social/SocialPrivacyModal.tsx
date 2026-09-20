import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { THEME } from '../../constants/theme';
import { PrivacySettings, SocialVisibility } from '../../types/social.types';
import { PrivacyService } from '../../services/social/PrivacyService';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { Heading, Text, Caption } from '../ui/Typography';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface SocialPrivacyModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSaved?: (updated: PrivacySettings) => void;
}

export const SocialPrivacyModal: React.FC<SocialPrivacyModalProps> = ({
  visible,
  userId,
  onClose,
  onSaved,
}) => {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      PrivacyService.getSettings(userId).then(setSettings);
    }
  }, [visible, userId]);

  if (!settings) return null;

  const toggleField = (key: keyof PrivacySettings) => {
    setSettings(prev => (prev ? { ...prev, [key]: !prev[key] } : null));
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const updated = await PrivacyService.updateSettings(userId, settings);
      setSettings(updated);
      onSaved?.(updated);
      Alert.alert('Transmissions Configured', 'Your privacy protocols have been calibrated.');
      onClose();
    } catch (err) {
      Alert.alert('Update Error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const VISIBILITY_OPTIONS: { label: string; value: SocialVisibility }[] = [
    { label: 'PUBLIC', value: 'PUBLIC' },
    { label: 'SQUAD ONLY', value: 'FRIENDS' },
    { label: 'PRIVATE', value: 'PRIVATE' },
  ];

  return (
    <Modal visible={visible} onClose={onClose} title="PRIVACY & BROADCAST PROTOCOLS">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Profile Visibility Selector */}
        <Card variant="surface" style={styles.sectionCard}>
          <Heading level={3} style={styles.cardHeader}>
            OPERATIVE DOSSIER VISIBILITY
          </Heading>
          <Caption style={styles.cardSub}>
            Controls who can inspect your public training benchmarks, ranks, and badges.
          </Caption>
          <View style={styles.visibilityRow}>
            {VISIBILITY_OPTIONS.map(opt => {
              const isSelected = settings.profileVisibility === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.visBtn, isSelected && styles.visBtnActive]}
                  onPress={() => setSettings({ ...settings, profileVisibility: opt.value })}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.visBtnText,
                      isSelected ? { color: THEME.colors.cyan, fontWeight: '800' } : {},
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Granular Activity Feed Broadcasts */}
        <Card variant="surface" style={styles.sectionCard}>
          <Heading level={3} style={styles.cardHeader}>
            AUTOMATIC FEED TRANSMISSIONS
          </Heading>
          <Caption style={styles.cardSub}>
            Choose which personal athletic breakthroughs are transmitted to fellow operatives.
          </Caption>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Workouts Completed</Text>
              <Caption>Share high-level volume & duration summary</Caption>
            </View>
            <Switch
              value={settings.showWorkoutsInFeed}
              onValueChange={() => toggleField('showWorkoutsInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.cyanSubtle }}
              thumbColor={settings.showWorkoutsInFeed ? THEME.colors.cyan : THEME.colors.textDisabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Personal Records (PRs)</Text>
              <Caption>Celebrate newly established kinetic benchmarks</Caption>
            </View>
            <Switch
              value={settings.showPrsInFeed}
              onValueChange={() => toggleField('showPrsInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.amberSubtle }}
              thumbColor={settings.showPrsInFeed ? THEME.colors.amber : THEME.colors.textDisabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Level Elevations</Text>
              <Caption>Broadcast global operative level increases</Caption>
            </View>
            <Switch
              value={settings.showLevelUpsInFeed}
              onValueChange={() => toggleField('showLevelUpsInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.cyanSubtle }}
              thumbColor={settings.showLevelUpsInFeed ? THEME.colors.cyan : THEME.colors.textDisabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Rank Ascensions</Text>
              <Caption>Broadcast promotions across athletic rank tiers</Caption>
            </View>
            <Switch
              value={settings.showRankUpsInFeed}
              onValueChange={() => toggleField('showRankUpsInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.violetSubtle }}
              thumbColor={settings.showRankUpsInFeed ? THEME.colors.violet : THEME.colors.textDisabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Combat Badges Unlocked</Text>
              <Caption>Share milestone achievement unlocks</Caption>
            </View>
            <Switch
              value={settings.showAchievementsInFeed}
              onValueChange={() => toggleField('showAchievementsInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.emeraldSubtle }}
              thumbColor={settings.showAchievementsInFeed ? THEME.colors.emerald : THEME.colors.textDisabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Challenge Directives Fulfilled</Text>
              <Caption>Broadcast quest and mission completions</Caption>
            </View>
            <Switch
              value={settings.showChallengesInFeed}
              onValueChange={() => toggleField('showChallengesInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.cyanSubtle }}
              thumbColor={settings.showChallengesInFeed ? THEME.colors.cyan : THEME.colors.textDisabled}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Character Evolution</Text>
              <Caption>Broadcast avatar progression & morphology shifts</Caption>
            </View>
            <Switch
              value={settings.showEvolutionInFeed}
              onValueChange={() => toggleField('showEvolutionInFeed')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.violetSubtle }}
              thumbColor={settings.showEvolutionInFeed ? THEME.colors.violet : THEME.colors.textDisabled}
            />
          </View>
        </Card>

        {/* Squad Interaction Permissions */}
        <Card variant="surface" style={styles.sectionCard}>
          <Heading level={3} style={styles.cardHeader}>
            SQUAD HANDSHAKES
          </Heading>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.toggleTitle}>Accept Friend Requests</Text>
              <Caption>Allow operatives to send you recruitment handshakes</Caption>
            </View>
            <Switch
              value={settings.allowFriendRequests}
              onValueChange={() => toggleField('allowFriendRequests')}
              trackColor={{ false: THEME.colors.surface, true: THEME.colors.cyanSubtle }}
              thumbColor={settings.allowFriendRequests ? THEME.colors.cyan : THEME.colors.textDisabled}
            />
          </View>
        </Card>

        {/* Save Button */}
        <Button
          title={isSaving ? 'UPDATING...' : 'APPLY PRIVACY PROTOCOLS'}
          variant="primary"
          size="md"
          onPress={handleSave}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: THEME.spacing.xs,
    paddingBottom: 24,
  },
  sectionCard: {
    padding: 14,
    marginBottom: THEME.spacing.sm,
  },
  cardHeader: {
    fontSize: 13,
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  visBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  visBtnActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.cyanSubtle,
  },
  visBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
});
