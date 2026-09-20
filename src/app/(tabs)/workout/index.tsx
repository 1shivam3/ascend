import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, RefreshControl, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../../constants/theme';
import { useWorkoutStore } from '../../../store/useWorkoutStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { TemplateRepository } from '../../../database/repositories/TemplateRepository';
import { WorkoutTemplate } from '../../../types/domain.types';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { Heading, Text, Caption, MonoText } from '../../../components/ui/Typography';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { TemplateBuilderModal } from '../../../components/workout/TemplateBuilderModal';
import { DEFAULT_USER_ID } from '../../../database/migrations/init';

type TabFilter = 'ALL' | 'CUSTOM' | 'PRESETS';

export default function WorkoutScreen() {
  const router = useRouter();
  const profile = useAuthStore(s => s.profile);
  const userId = profile?.id || DEFAULT_USER_ID;

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
          { text: 'Resume Active', onPress: () => router.push('/modals/active-workout' as any) },
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

  const filteredTemplates = templates.filter(t => {
    if (selectedTab === 'CUSTOM') return !t.isPreset;
    if (selectedTab === 'PRESETS') return t.isPreset;
    return true;
  });

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <ScreenContainer scrollable refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.colors.cyan} />}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Heading level={1} style={styles.title}>WORKOUT PROTOCOLS</Heading>
            <Caption style={styles.subtitle}>Custom training routines, combat splits & supersets</Caption>
          </View>
          <TouchableOpacity onPress={() => handleOpenBuilder()} style={styles.createBtn}>
            <Text style={styles.createBtnText}>+ CREATE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Workout Resume Card */}
      {isActive && (
        <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <View style={styles.activeIndicatorRow}>
              <View style={styles.activeDot} />
              <Heading level={3} color={THEME.colors.textPrimary}>SESSION IN PROGRESS</Heading>
            </View>
            <Badge label="ACTIVE" variant="cyan" size="sm" />
          </View>

          <Text color={THEME.colors.textSecondary} style={styles.activeMeta}>
            {activeWorkout?.title} • {formattedDuration} elapsed • {activeWorkout?.exercises.length || 0} exercises
          </Text>

          <Button
            title="RESUME ACTIVE WORKOUT →"
            variant="primary"
            size="md"
            onPress={() => router.push('/modals/active-workout' as any)}
            style={{ marginTop: 10 }}
          />
        </Card>
      )}

      {/* Quick Launch & Filter Navigation */}
      <View style={styles.filterSection}>
        <View style={styles.tabsRow}>
          {(['ALL', 'CUSTOM', 'PRESETS'] as TabFilter[]).map(tab => {
            const isSelected = selectedTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setSelectedTab(tab)}
                style={[styles.tabBtn, isSelected && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, isSelected && styles.tabBtnTextActive]}>
                  {tab === 'CUSTOM' ? 'MY ROUTINES' : tab === 'PRESETS' ? 'SYSTEM PRESETS' : 'ALL ROUTINES'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Free-form Quick Start Card */}
      <TouchableOpacity onPress={handleStartCustom} activeOpacity={0.8}>
        <Card variant="elevated" style={styles.quickStartCard}>
          <View style={styles.quickStartLeft}>
            <Text style={styles.quickStartIcon}>⚡</Text>
            <View>
              <Text style={styles.quickStartTitle}>QUICK EMPTY SESSION</Text>
              <Caption style={styles.quickStartSub}>Ad-hoc deployment • Add exercises on the fly</Caption>
            </View>
          </View>
          <Badge label="LAUNCH →" variant="cyan" size="sm" />
        </Card>
      </TouchableOpacity>

      {/* Routine Templates List */}
      <View style={styles.templateListSection}>
        {filteredTemplates.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No routines found</Text>
            <Caption style={styles.emptySub}>
              Tap "+ CREATE" in the header to construct your first custom workout routine with supersets.
            </Caption>
          </Card>
        ) : (
          filteredTemplates.map(tpl => {
            const hasSupersets = tpl.exercises.some(e => Boolean(e.supersetId));
            return (
              <Card key={tpl.id} variant="elevated" style={styles.templateCard}>
                <View style={styles.templateCardHeader}>
                  <View style={styles.templateTitleCol}>
                    <View style={styles.templateBadgeRow}>
                      <Badge label={tpl.splitType} variant="cyan" size="sm" />
                      {tpl.isPreset && <Badge label="PRESET" variant="neutral" size="sm" />}
                      {hasSupersets && <Badge label="SUPERSET" variant="amber" size="sm" />}
                    </View>
                    <Heading level={3} style={styles.templateName}>{tpl.name}</Heading>
                  </View>

                  <View style={styles.templateMetaCol}>
                    <MonoText style={styles.templateDuration}>{tpl.estimatedDurationMin} MIN</MonoText>
                    <Caption style={styles.templateCount}>{tpl.exercises.length} Exercises</Caption>
                  </View>
                </View>

                {tpl.description ? (
                  <Caption style={styles.templateDesc}>{tpl.description}</Caption>
                ) : null}

                {/* Exercise Preview Chips */}
                <View style={styles.exercisePreviewBox}>
                  {tpl.exercises.map((e, idx) => (
                    <View key={e.id || idx} style={styles.exercisePreviewItem}>
                      <Text style={styles.previewBullet}>•</Text>
                      <Text style={styles.previewName}>{e.exercise?.name || 'Exercise'}</Text>
                      <Caption style={styles.previewSets}>
                        {e.targetSets}×{e.targetReps}
                      </Caption>
                      {e.supersetId && (
                        <View style={styles.previewSsBadge}>
                          <Text style={styles.previewSsText}>{e.supersetId}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                {/* Action Row */}
                <View style={styles.templateActionsRow}>
                  <Button
                    title="START ROUTINE"
                    variant="primary"
                    size="sm"
                    onPress={() => handleStartTemplate(tpl)}
                    style={styles.startRoutineBtn}
                  />

                  <View style={styles.secondaryActions}>
                    {!tpl.isPreset && (
                      <TouchableOpacity
                        onPress={() => handleOpenBuilder(tpl)}
                        style={styles.actionIconBtn}
                      >
                        <Text style={styles.actionIconText}>EDIT</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => handleCloneTemplate(tpl.id)}
                      style={styles.actionIconBtn}
                    >
                      <Text style={styles.actionIconText}>CLONE</Text>
                    </TouchableOpacity>
                    {!tpl.isPreset && (
                      <TouchableOpacity
                        onPress={() => handleDeleteTemplate(tpl.id, tpl.name)}
                        style={[styles.actionIconBtn, styles.deleteActionBtn]}
                      >
                        <Text style={styles.deleteActionText}>DEL</Text>
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: THEME.spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    letterSpacing: 1.5,
  },
  subtitle: {
    marginTop: 2,
  },
  createBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 240, 255, 0.15)',
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.cyan,
  },
  createBtnText: {
    color: THEME.colors.cyan,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activeCard: {
    marginBottom: THEME.spacing.md,
    padding: THEME.spacing.md,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  activeIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.cyan,
  },
  activeMeta: {
    fontSize: 13,
    marginBottom: 4,
  },
  filterSection: {
    marginBottom: THEME.spacing.md,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: THEME.borderRadius.sharp,
  },
  tabBtnActive: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 0.5,
  },
  tabBtnTextActive: {
    color: THEME.colors.cyan,
  },
  quickStartCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.25)',
    backgroundColor: 'rgba(0, 240, 255, 0.04)',
  },
  quickStartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickStartIcon: {
    fontSize: 22,
  },
  quickStartTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: THEME.colors.textPrimary,
  },
  quickStartSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  templateListSection: {
    gap: THEME.spacing.md,
  },
  emptyCard: {
    padding: THEME.spacing.xl,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 15,
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    textAlign: 'center',
  },
  templateCard: {
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  templateCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  templateTitleCol: {
    flex: 1,
  },
  templateBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  templateName: {
    fontSize: 17,
    fontWeight: '900',
  },
  templateMetaCol: {
    alignItems: 'flex-end',
  },
  templateDuration: {
    color: THEME.colors.cyan,
    fontSize: 12,
    fontWeight: '900',
  },
  templateCount: {
    fontSize: 10,
    marginTop: 2,
  },
  templateDesc: {
    marginBottom: THEME.spacing.sm,
  },
  exercisePreviewBox: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sm,
    padding: THEME.spacing.sm,
    marginVertical: THEME.spacing.sm,
    gap: 4,
  },
  exercisePreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewBullet: {
    color: THEME.colors.cyan,
    fontSize: 10,
  },
  previewName: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  previewSets: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
  },
  previewSsBadge: {
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.3)',
  },
  previewSsText: {
    color: THEME.colors.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  templateActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: THEME.spacing.xs,
    gap: 8,
  },
  startRoutineBtn: {
    flex: 1,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  actionIconText: {
    color: THEME.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  deleteActionBtn: {
    borderColor: 'rgba(255, 51, 102, 0.3)',
    backgroundColor: 'rgba(255, 51, 102, 0.08)',
  },
  deleteActionText: {
    color: THEME.colors.crimson,
    fontSize: 10,
    fontWeight: '800',
  },
});
