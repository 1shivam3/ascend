import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { THEME } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { SyncQueueRepository } from '../../../database/repositories/SyncQueueRepository';
import { TacticalCard } from '../../../components/ui/TacticalCard';
import { TacticalButton } from '../../../components/ui/TacticalButton';
import { TacticalBadge } from '../../../components/ui/TacticalBadge';
import { AttributeRadar } from '../../../components/hud/AttributeRadar';
import { getRankForLevel } from '../../../constants/ranks';

export default function ProfileScreen() {
  const { profile, loadProfile } = useAuthStore();
  const { settings, setUnit, toggleSound, toggleHaptics } = useSettingsStore();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    SyncQueueRepository.getPending().then(items => setPendingSyncCount(items.length));
  }, []);

  const level = profile?.globalLevel || 1;
  const rank = getRankForLevel(level);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Dossier Header */}
        <View style={styles.headerCard}>
          <View style={[styles.avatarBox, { borderColor: rank.definition.color }]}>
            <Text style={styles.avatarGlyph}>⚔️</Text>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.displayName}>{profile?.displayName || 'Vanguard'}</Text>
            <Text style={[styles.rankTitle, { color: rank.definition.color }]}>
              {rank.definition.title.toUpperCase()} {rank.tier !== 'ASCENDANT' ? `DIV ${rank.division}` : ''}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Global Lvl {level}</Text>
              <Text style={styles.metaText}>•</Text>
              <Text style={styles.metaText}>{(profile?.totalXp || 0).toLocaleString()} Total XP</Text>
            </View>
          </View>
        </View>

        {/* Tactical Attributes Radar */}
        {profile && <AttributeRadar attributes={profile.attributes} />}

        {/* Lifetime Telemetry */}
        <Text style={styles.sectionHeader}>LIFETIME ATHLETIC RECORD</Text>
        <View style={styles.statsRow}>
          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>CURRENT STREAK</Text>
            <Text style={[styles.statValue, { color: THEME.colors.amber }]}>
              {profile?.currentStreak || 0} DAYS
            </Text>
          </TacticalCard>

          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>LONGEST STREAK</Text>
            <Text style={styles.statValue}>
              {profile?.longestStreak || 0} DAYS
            </Text>
          </TacticalCard>

          <TacticalCard style={styles.statBox}>
            <Text style={styles.statLabel}>FREEZE TOKENS</Text>
            <Text style={[styles.statValue, { color: THEME.colors.cyan }]}>
              {profile?.streakFreezeTokens || 0} / 2
            </Text>
          </TacticalCard>
        </View>

        {/* System Settings */}
        <Text style={styles.sectionHeader}>SYSTEM PREFERENCES</Text>
        <TacticalCard style={styles.settingsCard}>
          {/* Unit Toggle */}
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Weight Measurement Unit</Text>
              <Text style={styles.settingSub}>Stored in KG internally; displayed per selection</Text>
            </View>
            <View style={styles.unitToggleGroup}>
              <TouchableOpacity
                onPress={() => setUnit('kg')}
                style={[styles.unitBtn, settings.preferredUnit === 'kg' && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, settings.preferredUnit === 'kg' && styles.unitBtnTextActive]}>
                  KG
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setUnit('lbs')}
                style={[styles.unitBtn, settings.preferredUnit === 'lbs' && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, settings.preferredUnit === 'lbs' && styles.unitBtnTextActive]}>
                  LBS
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sound FX Toggle */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Audio Alerts</Text>
            <TouchableOpacity onPress={toggleSound} style={styles.toggleBtn}>
              <Text style={[styles.toggleText, { color: settings.soundEnabled ? THEME.colors.emerald : THEME.colors.textMuted }]}>
                {settings.soundEnabled ? 'ENABLED' : 'DISABLED'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Haptic Feedback Toggle */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Tactile Haptic Vibration</Text>
            <TouchableOpacity onPress={toggleHaptics} style={styles.toggleBtn}>
              <Text style={[styles.toggleText, { color: settings.hapticsEnabled ? THEME.colors.emerald : THEME.colors.textMuted }]}>
                {settings.hapticsEnabled ? 'ENABLED' : 'DISABLED'}
              </Text>
            </TouchableOpacity>
          </View>
        </TacticalCard>

        {/* Offline Sync Telemetry */}
        <Text style={styles.sectionHeader}>DATA INTEGRITY & SYNC STATUS</Text>
        <TacticalCard style={styles.syncCard}>
          <View style={styles.syncRow}>
            <View>
              <Text style={styles.syncTitle}>Local SQLite Database</Text>
              <Text style={styles.syncSubtitle}>
                {pendingSyncCount} pending operations in local queue
              </Text>
            </View>
            <TacticalBadge
              label={pendingSyncCount === 0 ? 'SYNCED' : 'QUEUED'}
              color={pendingSyncCount === 0 ? THEME.colors.emerald : THEME.colors.amber}
              size="sm"
            />
          </View>

          <TacticalButton
            title="REFRESH PROFILE TELEMETRY"
            variant="secondary"
            size="sm"
            onPress={() => {
              loadProfile();
              SyncQueueRepository.getPending().then(items => setPendingSyncCount(items.length));
              Alert.alert('Refreshed', 'Local database verified and state reloaded.');
            }}
            style={{ marginTop: 12 }}
          />
        </TacticalCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContent: {
    padding: THEME.spacing.md,
    paddingBottom: 40,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: THEME.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: THEME.spacing.md,
  },
  avatarGlyph: {
    fontSize: 28,
  },
  headerInfo: {
    flex: 1,
  },
  displayName: {
    color: THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  rankTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
  },
  statLabel: {
    color: THEME.colors.textMuted,
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  statValue: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  settingsCard: {
    padding: THEME.spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  settingLabel: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  settingSub: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  unitToggleGroup: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unitBtnActive: {
    backgroundColor: THEME.colors.cyan,
  },
  unitBtnText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  unitBtnTextActive: {
    color: '#000000',
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  syncCard: {
    padding: THEME.spacing.md,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  syncSubtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});
