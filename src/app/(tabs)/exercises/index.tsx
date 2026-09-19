import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../../constants/theme';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { useAuthStore } from '../../../store/useAuthStore';
import { Exercise, ExerciseMastery } from '../../../types/domain.types';
import { TacticalCard } from '../../../components/ui/TacticalCard';
import { TacticalBadge } from '../../../components/ui/TacticalBadge';
import { getMasteryTierForLevel } from '../../../constants/ranks';

const MUSCLE_FILTERS = ['ALL', 'Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Abs'];
const EQUIPMENT_FILTERS = ['ALL', 'BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'];

export default function ExercisesScreen() {
  const router = useRouter();
  const userId = useAuthStore(s => s.userId);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [masteryMap, setMasteryMap] = useState<Record<string, ExerciseMastery>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('ALL');
  const [selectedEquipment, setSelectedEquipment] = useState('ALL');

  useEffect(() => {
    loadData();
  }, [searchQuery, selectedMuscle, selectedEquipment]);

  const loadData = async () => {
    const list = await ExerciseRepository.search(
      searchQuery,
      selectedMuscle === 'ALL' ? undefined : selectedMuscle,
      selectedEquipment === 'ALL' ? undefined : selectedEquipment
    );
    setExercises(list);

    if (userId) {
      const masteries = await MasteryRepository.getAllMasteries(userId);
      const map: Record<string, ExerciseMastery> = {};
      masteries.forEach(m => {
        map[m.exerciseId] = m;
      });
      setMasteryMap(map);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>EXERCISE MASTERY</Text>
        <Text style={styles.subtitle}>Track individual lift levels, 1RMs, and movement proficiency</Text>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises or muscles..."
            placeholderTextColor={THEME.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Muscle Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {MUSCLE_FILTERS.map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => setSelectedMuscle(m)}
              style={[
                styles.filterPill,
                selectedMuscle === m && styles.filterPillActive,
              ]}
            >
              <Text style={[styles.filterText, selectedMuscle === m && styles.filterTextActive]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Exercise List */}
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.resultsCount}>{exercises.length} MOVEMENTS FOUND</Text>

        {exercises.map(ex => {
          const mastery = masteryMap[ex.id];
          const level = mastery ? mastery.masteryLevel : 1;
          const tierInfo = getMasteryTierForLevel(level);

          return (
            <TouchableOpacity
              key={ex.id}
              activeOpacity={0.8}
              onPress={() => router.push(`/exercises/${ex.id}` as any)}
            >
              <TacticalCard style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={styles.nameContainer}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <View style={styles.badgeRow}>
                      <TacticalBadge label={ex.primaryMuscle} size="sm" color={THEME.colors.cyan} />
                      <TacticalBadge label={ex.equipment} size="sm" color={THEME.colors.textMuted} />
                    </View>
                  </View>

                  {/* Lift Level Emblem */}
                  <View style={[styles.masteryPill, { borderColor: tierInfo.color }]}>
                    <Text style={[styles.masteryLvlText, { color: tierInfo.color }]}>
                      LVL {level}
                    </Text>
                    <Text style={styles.masteryTierText}>{tierInfo.title}</Text>
                  </View>
                </View>

                {/* Telemetry snippet if trained */}
                {mastery && mastery.totalSessions > 0 ? (
                  <View style={styles.telemetryRow}>
                    <Text style={styles.telemetryText}>
                      Est. 1RM: <Text style={styles.telemetryHighlight}>{mastery.estimated1RmKg} kg</Text>
                    </Text>
                    <Text style={styles.telemetryText}>
                      Sessions: <Text style={styles.telemetryHighlight}>{mastery.totalSessions}</Text>
                    </Text>
                    <Text style={styles.telemetryText}>
                      Tonnage: <Text style={styles.telemetryHighlight}>{Math.round(mastery.totalVolumeKg)} kg</Text>
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.untrainedText}>Unranked • Log sets to initiate mastery</Text>
                )}
              </TacticalCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  header: {
    paddingHorizontal: THEME.spacing.md,
    paddingTop: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
    paddingBottom: THEME.spacing.sm,
  },
  title: {
    color: THEME.colors.cyan,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: THEME.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.sm,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
  },
  clearText: {
    color: THEME.colors.textMuted,
    fontSize: 14,
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterPill: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 8,
  },
  filterPillActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
  },
  filterText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  filterTextActive: {
    color: THEME.colors.cyan,
  },
  listContent: {
    padding: THEME.spacing.md,
    paddingBottom: 40,
  },
  resultsCount: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: THEME.spacing.sm,
  },
  card: {
    marginBottom: THEME.spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  exerciseName: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  masteryPill: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    backgroundColor: THEME.colors.surfaceElevated,
    minWidth: 70,
  },
  masteryLvlText: {
    fontSize: 13,
    fontWeight: '900',
  },
  masteryTierText: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  telemetryText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  telemetryHighlight: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  untrainedText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
  },
});
