import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../constants/theme';
import { useWorkoutStore } from '../../../store/useWorkoutStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { TemplateRepository } from '../../../database/repositories/TemplateRepository';
import { WorkoutTemplate } from '../../../types/domain.types';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Card } from '../../../components/ui/Card';
import { Button, PrimaryButton } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Divider } from '../../../components/ui/Divider';
import { TemplateBuilderModal } from '../../../components/workout/TemplateBuilderModal';
import { ProgramGenerationModal } from '../../../components/workout/ProgramGenerationModal';

type TabFilter = 'ALL' | 'CUSTOM' | 'PRESETS';

export default function WorkoutScreen() {
  const router = useRouter();
  const { colors, borderRadius, shadows, isDark } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id || '';

  const {
    isActive,
    activeWorkout,
    elapsedSeconds,
    startWorkout,
    startWorkoutFromTemplate,
  } = useWorkoutStore();

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [selectedTab, setSelectedTab] = useState<TabFilter>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  // Template Builder State
  const [builderVisible, setBuilderVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null);

  // Program Generator State
  const [programGenVisible, setProgramGenVisible] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await TemplateRepository.getUserTemplates(userId);
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load workout templates:', err);
    }
  }, [userId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTemplates();
    setRefreshing(false);
  };

  const handleStartTemplate = async (tpl: WorkoutTemplate) => {
    if (isActive) {
      Alert.alert(
        'Session in Progress',
        'You already have an active workout in progress. Discard or finish it before starting a new routine.',
        [
          {
            text: 'Resume Active',
            onPress: () => router.push('/modals/active-workout' as any),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    await startWorkoutFromTemplate(tpl);
    router.push('/modals/active-workout' as any);
  };

  const handleStartCustom = async () => {
    if (isActive) {
      router.push('/modals/active-workout' as any);
      return;
    }
    await startWorkout('Custom Tactical Session');
    router.push('/modals/active-workout' as any);
  };

  const handleCloneTemplate = async (templateId: string) => {
    try {
      const cloned = await TemplateRepository.cloneTemplate(userId, templateId);
      if (cloned) {
        await loadTemplates();
        Alert.alert('Routine Cloned', `Created duplicate: "${cloned.name}"`);
      }
    } catch (err) {
      console.error('Clone failed:', err);
    }
  };

  const handleDeleteTemplate = (templateId: string, name: string) => {
    Alert.alert(
      'Delete Routine',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await TemplateRepository.deleteTemplate(userId, templateId);
            if (success) {
              await loadTemplates();
            } else {
              Alert.alert('Cannot Delete', 'System presets cannot be deleted.');
            }
          },
        },
      ]
    );
  };

  const handleOpenBuilder = (template?: WorkoutTemplate) => {
    setEditingTemplate(template || null);
    setBuilderVisible(true);
  };

  const filteredTemplates = templates.filter((t) => {
    if (selectedTab === 'CUSTOM') return !t.isPreset;
    if (selectedTab === 'PRESETS') return t.isPreset;
    return true;
  });

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(
    seconds
  ).padStart(2, '0')}`;

  return (
    <ScreenContainer
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header with Title & Action */}
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Heading level={1} style={styles.screenTitle}>
            Train
          </Heading>
          <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
            Structured routines, splits & supersets
          </Caption>
        </View>
        <Button
          title="Create"
          variant="secondary"
          size="sm"
          icon={<Ionicons name="add" size={16} color={colors.textPrimary} />}
          onPress={() => handleOpenBuilder()}
          accessibilityLabel="Create New Protocol"
        />
      </View>

      {/* Active Session Notification Banner */}
      {isActive && (
        <Card
          variant="surface"
          style={[
            styles.activeBanner,
            {
              borderColor: colors.accent,
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.activeTopRow}>
            <View style={styles.activeIndicatorGroup}>
              <View
                style={[
                  styles.activeDot,
                  { backgroundColor: colors.emerald },
                ]}
              />
              <Caption
                upper
                style={[
                  styles.activeBadgeText,
                  { color: colors.emerald },
                ]}
              >
                SESSION IN PROGRESS
              </Caption>
            </View>
            <MonoText
              style={[
                styles.activeTimerText,
                { color: isDark ? colors.textPrimary : colors.accent },
              ]}
            >
              {formattedDuration}
            </MonoText>
          </View>

          <Heading level={2} style={styles.activeTitle}>
            {activeWorkout?.name || 'Tactical Protocol'}
          </Heading>
          <Caption style={{ color: colors.textSecondary, marginBottom: 12 }}>
            {activeWorkout?.exercises.length || 0} exercises deployed • In-flight telemetry
          </Caption>

          <PrimaryButton
            title="Resume Session →"
            onPress={() => router.push('/modals/active-workout' as any)}
          />
        </Card>
      )}

      {/* Custom Program Generator / Architect Hero Card */}
      <TouchableOpacity
        onPress={() => setProgramGenVisible(true)}
        activeOpacity={0.85}
        style={{ marginBottom: 12 }}
      >
        <Card
          variant="surface"
          style={[
            styles.architectCard,
            {
              backgroundColor: colors.accentSubtle,
              borderColor: colors.accent,
              borderWidth: 1,
            },
          ]}
        >
          <View style={styles.architectLeft}>
            <View
              style={[
                styles.architectIconBox,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : '#FFFFFF',
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={20}
                color={colors.accent}
              />
            </View>
            <View style={styles.architectTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text
                  style={[
                    styles.architectTitle,
                    { color: colors.textPrimary },
                  ]}
                >
                  Custom Program Architect
                </Text>
                <Badge label="SMART" variant="accent" size="sm" />
              </View>
              <Caption style={{ color: colors.textSecondary }}>
                10-point questionnaire • Personalized split • 100% control
              </Caption>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.accent}
          />
        </Card>
      </TouchableOpacity>

      {/* Quick Launch / Ad-Hoc Session */}
      <TouchableOpacity onPress={handleStartCustom} activeOpacity={0.85}>
        <Card
          variant="surface"
          style={[
            styles.quickLaunchCard,
            {
              backgroundColor: colors.mint,
              borderColor: isDark ? colors.border : 'transparent',
              borderWidth: 1,
            },
          ]}
        >
          <View style={styles.quickLaunchLeft}>
            <View
              style={[
                styles.quickLaunchIconBox,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : colors.surfaceMuted,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons
                name="flash"
                size={20}
                color={colors.mintText}
              />
            </View>
            <View style={styles.quickLaunchTextCol}>
              <Text
                style={[
                  styles.quickLaunchTitle,
                  { color: colors.mintText },
                ]}
              >
                Free-Form Workout
              </Text>
              <Caption
                style={{
                  color: colors.mintText,
                  opacity: 0.85,
                }}
              >
                Start empty session • Add exercises on the fly
              </Caption>
            </View>
          </View>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={colors.mintText}
          />
        </Card>
      </TouchableOpacity>

      {/* Filter Segmented Control Bar */}
      <View style={styles.filterSection}>
        <View
          style={[
            styles.segmentedControl,
            {
              backgroundColor: isDark ? colors.surfaceElevated : '#E5E7EB',
              borderRadius: borderRadius.md,
            },
          ]}
        >
          {(['ALL', 'CUSTOM', 'PRESETS'] as TabFilter[]).map((tab) => {
            const isSelected = selectedTab === tab;
            const label =
              tab === 'CUSTOM'
                ? 'My Routines'
                : tab === 'PRESETS'
                ? 'Presets'
                : 'All Routines';
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setSelectedTab(tab)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: isSelected
                      ? colors.surface
                      : 'transparent',
                    borderRadius: borderRadius.sm,
                  },
                  isSelected ? shadows.card : null,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: isSelected
                        ? colors.textPrimary
                        : colors.textMuted,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Section Header */}
      <SectionHeader
        title={
          selectedTab === 'CUSTOM'
            ? 'MY ROUTINES'
            : selectedTab === 'PRESETS'
            ? 'STANDARD PRESETS'
            : 'ALL ROUTINES'
        }
      />

      {/* Routines List */}
      <View style={styles.templateListSection}>
        {filteredTemplates.length === 0 ? (
          <Card variant="surface" style={styles.emptyContainer}>
            <Ionicons
              name="barbell-outline"
              size={36}
              color={colors.textMuted}
              style={{ marginBottom: 8 }}
            />
            <Heading level={3} style={{ marginBottom: 4 }}>
              No Routines Found
            </Heading>
            <Caption style={{ textAlign: 'center', color: colors.textSecondary }}>
              Tap "+ Create" above to build a custom routine with personalized sets, reps, and supersets.
            </Caption>
          </Card>
        ) : (
          filteredTemplates.map((tpl) => {
            const hasSupersets = tpl.exercises.some((e) => Boolean(e.supersetId));
            return (
              <Card key={tpl.id} variant="surface" style={styles.templateCard}>
                {/* Header info */}
                <View style={styles.templateHeader}>
                  <View style={styles.templateInfo}>
                    <View style={styles.badgeRow}>
                      <Badge label={tpl.splitType} variant="accent" size="sm" />
                      {tpl.isPreset && (
                        <Badge label="SYSTEM" variant="neutral" size="sm" />
                      )}
                      {hasSupersets && (
                        <Badge label="SUPERSET" variant="amber" size="sm" />
                      )}
                    </View>
                    <Heading level={2} style={styles.templateName}>
                      {tpl.name}
                    </Heading>
                  </View>

                  <View style={styles.templateDurationCol}>
                    <View style={styles.durationRow}>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Caption style={{ color: colors.textSecondary, fontWeight: '700' }}>
                        {tpl.estimatedDurationMin} min
                      </Caption>
                    </View>
                    <Caption style={{ color: colors.textMuted, marginTop: 2 }}>
                      {tpl.exercises.length} exercises
                    </Caption>
                  </View>
                </View>

                {tpl.description ? (
                  <Caption style={{ color: colors.textSecondary, marginBottom: 8 }}>
                    {tpl.description}
                  </Caption>
                ) : null}

                {/* Exercise preview sequence */}
                <View
                  style={[
                    styles.exerciseSequence,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.04)'
                        : colors.surfaceElevated,
                      borderRadius: borderRadius.md,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  {tpl.exercises.slice(0, 4).map((e, idx) => (
                    <View key={e.id || idx} style={styles.sequenceItem}>
                      <View
                        style={[
                          styles.sequenceBullet,
                          {
                            backgroundColor: colors.accent,
                          },
                        ]}
                      />
                      <Text style={styles.sequenceName} numberOfLines={1}>
                        {e.exercise?.name || 'Exercise'}
                      </Text>
                      <MonoText
                        style={[styles.sequenceSets, { color: colors.textSecondary }]}
                      >
                        {e.targetSets} × {e.targetReps}
                      </MonoText>
                      {e.supersetId && (
                        <View
                          style={[
                            styles.supersetTag,
                            {
                              backgroundColor: `${colors.amber}20`,
                              borderColor: `${colors.amber}40`,
                            },
                          ]}
                        >
                          <MonoText style={{ color: colors.amber, fontSize: 9 }}>
                            {e.supersetId}
                          </MonoText>
                        </View>
                      )}
                    </View>
                  ))}
                  {tpl.exercises.length > 4 ? (
                    <Caption style={{ color: colors.textMuted, marginTop: 2 }}>
                      +{tpl.exercises.length - 4} more movements
                    </Caption>
                  ) : null}
                </View>

                <Divider marginVertical={10} />

                {/* Actions row */}
                <View style={styles.templateActionsRow}>
                  <Button
                    title="Start Routine"
                    variant="primary"
                    size="sm"
                    icon={
                      <Ionicons
                        name="play"
                        size={14}
                        color={colors.primaryButtonText}
                      />
                    }
                    onPress={() => handleStartTemplate(tpl)}
                    style={styles.launchBtn}
                  />

                  <View style={styles.secondaryActions}>
                    {!tpl.isPreset && (
                      <TouchableOpacity
                        onPress={() => handleOpenBuilder(tpl)}
                        style={[
                          styles.actionPill,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.border,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="pencil-outline"
                          size={14}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => handleCloneTemplate(tpl.id)}
                      style={[
                        styles.actionPill,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.border,
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="copy-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {!tpl.isPreset && (
                      <TouchableOpacity
                        onPress={() => handleDeleteTemplate(tpl.id, tpl.name)}
                        style={[
                          styles.actionPill,
                          {
                            backgroundColor: 'rgba(239, 68, 68, 0.08)',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={14}
                          color={colors.crimson}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />

      {/* Routine Builder Modal */}
      <TemplateBuilderModal
        visible={builderVisible}
        userId={userId}
        initialTemplate={editingTemplate}
        onClose={() => setBuilderVisible(false)}
        onSaved={async () => {
          await loadTemplates();
        }}
      />

      {/* Custom Program Generation & Architecture Modal */}
      <ProgramGenerationModal
        visible={programGenVisible}
        userId={userId}
        onClose={() => setProgramGenVisible(false)}
        onPlanCreated={async () => {
          setSelectedTab('CUSTOM');
          await loadTemplates();
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleCol: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeBanner: {
    marginBottom: 16,
    padding: 16,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  activeIndicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  activeTimerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  activeTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  architectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  architectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  architectIconBox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  architectTextCol: {
    flex: 1,
  },
  architectTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  quickLaunchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginBottom: 16,
  },
  quickLaunchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  quickLaunchIconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLaunchTextCol: {
    flex: 1,
  },
  quickLaunchTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  filterSection: {
    marginBottom: 14,
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 12,
  },
  templateListSection: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  templateCard: {
    padding: 16,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  templateInfo: {
    flex: 1,
    marginRight: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  templateName: {
    fontSize: 17,
    fontWeight: '800',
  },
  templateDurationCol: {
    alignItems: 'flex-end',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exerciseSequence: {
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    gap: 6,
  },
  sequenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sequenceBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sequenceName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  sequenceSets: {
    fontSize: 12,
  },
  supersetTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  templateActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  launchBtn: {
    flex: 1,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionPill: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
