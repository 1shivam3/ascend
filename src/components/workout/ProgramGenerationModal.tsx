import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { Exercise, PrimaryGoal } from '../../types/domain.types';
import {
  AIWorkoutPlan,
  AIWorkoutDay,
  AIExercisePrescription,
  GenerationInput,
} from '../../services/ai/schemas';
import { AIGenerationService } from '../../services/ai/AIGenerationService';
import { PlanRepository } from '../../database/repositories/PlanRepository';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { ExerciseAlternativeService } from '../../services/workout/ExerciseAlternativeService';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Button, PrimaryButton } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Divider } from '../ui/Divider';
import { ExerciseDetailModal } from './ExerciseDetailModal';

interface ProgramGenerationModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onPlanCreated: (plan: AIWorkoutPlan) => void;
}

type WizardStep = 'GOALS' | 'SCHEDULE' | 'LIMITATIONS';
type ModalMode = 'QUESTIONNAIRE' | 'GENERATING' | 'REVIEW';

const GOAL_OPTIONS: { id: PrimaryGoal; label: string; desc: string; icon: any }[] = [
  {
    id: 'BUILD_MUSCLE',
    label: 'Muscle Building',
    desc: 'Maximize hypertrophy, muscular density & volume',
    icon: 'barbell-outline',
  },
  {
    id: 'GET_STRONGER',
    label: 'Strength & Power',
    desc: 'Heavy compounds, force production & neurological drive',
    icon: 'flash-outline',
  },
  {
    id: 'LOSE_FAT',
    label: 'Fat Loss',
    desc: 'Metabolic conditioning, work capacity & density',
    icon: 'flame-outline',
  },
  {
    id: 'GENERAL_FITNESS',
    label: 'General Fitness',
    desc: 'Well-rounded physical health, stamina & longevity',
    icon: 'heart-outline',
  },
  {
    id: 'CALISTHENICS',
    label: 'Calisthenics',
    desc: 'Bodyweight control, lever progressions & core stability',
    icon: 'body-outline',
  },
  {
    id: 'ATHLETIC_PERFORMANCE',
    label: 'Athletic Performance',
    desc: 'Explosiveness, rotational speed, agility & power',
    icon: 'speedometer-outline',
  },
  {
    id: 'MOBILITY',
    label: 'Mobility & Recovery',
    desc: 'Joint resilience, full range of motion & posture',
    icon: 'leaf-outline',
  },
  {
    id: 'COMBINATION',
    label: 'Hybrid Progression',
    desc: 'Concurrent strength + endurance + functional athleticism',
    icon: 'infinite-outline',
  },
];

const EXPERIENCE_OPTIONS = [
  { id: 'BEGINNER', label: 'Beginner', desc: '< 1 year regular training' },
  { id: 'INTERMEDIATE', label: 'Intermediate', desc: '1 - 3 years structured lifting' },
  { id: 'ADVANCED', label: 'Advanced', desc: '3+ years continuous progression' },
];

const EQUIPMENT_PRESETS = [
  {
    id: 'FULL_GYM',
    label: 'Full Commercial Gym',
    items: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
  },
  {
    id: 'BARBELL_DUMBBELL',
    label: 'Barbell & Dumbbells',
    items: ['BARBELL', 'DUMBBELL', 'BODYWEIGHT'],
  },
  {
    id: 'DUMBBELL_ONLY',
    label: 'Dumbbells & Bench',
    items: ['DUMBBELL', 'BODYWEIGHT'],
  },
  {
    id: 'CALISTHENICS_ONLY',
    label: 'Bodyweight & Pull-up Bar',
    items: ['BODYWEIGHT'],
  },
  {
    id: 'KETTLEBELL_BANDS',
    label: 'Kettlebells & Bands',
    items: ['KETTLEBELL', 'BODYWEIGHT'],
  },
];

const TRAINING_STYLES = [
  { id: 'FULL_BODY', label: 'Full Body', desc: 'Hit every major muscle group each session' },
  { id: 'UPPER_LOWER', label: 'Upper / Lower', desc: 'Alternating upper and lower power/hypertrophy' },
  { id: 'PUSH_PULL_LEGS', label: 'Push / Pull / Legs', desc: 'Movement pattern split for maximum recovery' },
  { id: 'CALISTHENICS_PROGRESSION', label: 'Bodyweight Progression', desc: 'Lever, dip, chin & gymnastic skill blocks' },
];

const LIMITATION_CHIPS = [
  'Lower Back',
  'Shoulders',
  'Knees',
  'Wrists',
  'Neck',
  'None (Fully Healthy)',
];

const DISLIKED_CHIPS = [
  'Conventional Deadlift',
  'Barbell Back Squat',
  'Barbell Overhead Press',
  'Burpees',
  'Bulgarian Split Squat',
  'Running',
];

export const ProgramGenerationModal: React.FC<ProgramGenerationModalProps> = ({
  visible,
  userId,
  onClose,
  onPlanCreated,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  // Mode & Wizard Step
  const [modalMode, setModalMode] = useState<ModalMode>('QUESTIONNAIRE');
  const [wizardStep, setWizardStep] = useState<WizardStep>('GOALS');

  // 10 Questionnaire Variables
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('BUILD_MUSCLE');
  const [experience, setExperience] = useState<string>('INTERMEDIATE');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [sessionDuration, setSessionDuration] = useState<number>(60);
  const [equipmentPreset, setEquipmentPreset] = useState<string>('FULL_GYM');
  const [preferredStyle, setPreferredStyle] = useState<string>('UPPER_LOWER');
  const [exercisePreferences, setExercisePreferences] = useState<string[]>(['Compound Power Focus']);
  const [dislikedExercises, setDislikedExercises] = useState<string[]>([]);
  const [customDisliked, setCustomDisliked] = useState<string>('');
  const [limitations, setLimitations] = useState<string[]>([]);
  const [customLimitation, setCustomLimitation] = useState<string>('');
  const [bench1RM, setBench1RM] = useState<string>('');
  const [squat1RM, setSquat1RM] = useState<string>('');
  const [deadlift1RM, setDeadlift1RM] = useState<string>('');
  const [ohp1RM, setOhp1RM] = useState<string>('');

  // Generated Plan & Customization State
  const [generatedPlan, setGeneratedPlan] = useState<AIWorkoutPlan | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Exercise Swap & Detail Modals
  const [selectedDetailExercise, setSelectedDetailExercise] = useState<Exercise | null>(null);
  const [replacingTarget, setReplacingTarget] = useState<{
    dayIndex: number;
    exerciseIndex: number;
    prescription: AIExercisePrescription;
  } | null>(null);
  const [replacingAlternatives, setReplacingAlternatives] = useState<Exercise[]>([]);
  const [isPickerVisible, setIsPickerVisible] = useState<boolean>(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [pickerSearchQuery, setPickerSearchQuery] = useState<string>('');

  // Inline edit modal for prescription
  const [editingPrescription, setEditingPrescription] = useState<{
    dayIndex: number;
    exerciseIndex: number;
    sets: number;
    reps: string;
    restSeconds: number;
  } | null>(null);

  // Reset states when opened
  useEffect(() => {
    if (visible) {
      setModalMode('QUESTIONNAIRE');
      setWizardStep('GOALS');
      setGeneratedPlan(null);
      setSelectedDayIndex(0);
      ExerciseRepository.getAll().then(setAllExercises).catch(() => {});
    }
  }, [visible]);

  // Handle limitation chip toggle
  const toggleLimitation = (chip: string) => {
    if (chip === 'None (Fully Healthy)') {
      setLimitations(['None (Fully Healthy)']);
      return;
    }
    const filtered = limitations.filter((l) => l !== 'None (Fully Healthy)');
    if (filtered.includes(chip)) {
      setLimitations(filtered.filter((l) => l !== chip));
    } else {
      setLimitations([...filtered, chip]);
    }
  };

  // Handle disliked chip toggle
  const toggleDisliked = (chip: string) => {
    if (dislikedExercises.includes(chip)) {
      setDislikedExercises(dislikedExercises.filter((d) => d !== chip));
    } else {
      setDislikedExercises([...dislikedExercises, chip]);
    }
  };

  // Add custom disliked
  const addCustomDisliked = () => {
    if (customDisliked.trim()) {
      setDislikedExercises([...dislikedExercises, customDisliked.trim()]);
      setCustomDisliked('');
    }
  };

  // Add custom limitation
  const addCustomLimitation = () => {
    if (customLimitation.trim()) {
      setLimitations([...limitations.filter((l) => l !== 'None (Fully Healthy)'), customLimitation.trim()]);
      setCustomLimitation('');
    }
  };

  // Generation Trigger
  const handleGenerate = async () => {
    setModalMode('GENERATING');

    const equipmentList =
      EQUIPMENT_PRESETS.find((p) => p.id === equipmentPreset)?.items || [
        'BARBELL',
        'DUMBBELL',
        'CABLE',
        'MACHINE',
        'BODYWEIGHT',
      ];

    const allExcluded = [...dislikedExercises];
    if (customDisliked.trim()) allExcluded.push(customDisliked.trim());

    const allLimits = [...limitations];
    if (customLimitation.trim()) allLimits.push(customLimitation.trim());

    const generationInput: GenerationInput = {
      goal: primaryGoal,
      primary_goal: primaryGoal,
      secondary_goals: exercisePreferences,
      experience,
      days_per_week: daysPerWeek,
      session_duration: sessionDuration,
      equipment: equipmentList,
      training_location: equipmentPreset === 'FULL_GYM' ? 'COMMERCIAL_GYM' : 'HOME_GYM',
      preferred_exercises: [],
      excluded_exercises: allExcluded,
      limitations: allLimits,
      age: 25,
      height: 175,
      weight: 75,
    };

    try {
      const plan = await AIGenerationService.generatePlan(userId, generationInput);
      setGeneratedPlan(plan);
      setSelectedDayIndex(0);
      setModalMode('REVIEW');
    } catch (err) {
      console.error('Program generation failed:', err);
      Alert.alert('Generation Error', 'Unable to generate program. Please try again.');
      setModalMode('QUESTIONNAIRE');
    }
  };

  // Open Alternative Picker for an exercise in review
  const handleStartReplace = async (dayIndex: number, exerciseIndex: number, prescription: AIExercisePrescription) => {
    setReplacingTarget({ dayIndex, exerciseIndex, prescription });
    setIsPickerVisible(true);
    setPickerSearchQuery('');

    // Find exercise in catalog
    const catalogEx = allExercises.find((e) => e.id === prescription.exercise_id || e.name === prescription.name);
    if (catalogEx) {
      const alts = await ExerciseAlternativeService.getSuitableAlternatives(catalogEx);
      setReplacingAlternatives(alts);
    } else {
      setReplacingAlternatives([]);
    }
  };

  // Apply replacement
  const handleApplyReplacement = (newExercise: Exercise) => {
    if (!generatedPlan || !replacingTarget) return;

    const updatedPlan = { ...generatedPlan };
    const targetDay = { ...updatedPlan.days[replacingTarget.dayIndex] };
    const updatedExercises = [...targetDay.exercises];

    updatedExercises[replacingTarget.exerciseIndex] = {
      ...replacingTarget.prescription,
      exercise_id: newExercise.id,
      name: newExercise.name,
      instructions: newExercise.instructions || null,
    };

    targetDay.exercises = updatedExercises;
    updatedPlan.days[replacingTarget.dayIndex] = targetDay;

    setGeneratedPlan(updatedPlan);
    setReplacingTarget(null);
    setIsPickerVisible(false);
  };

  // Remove exercise from a day
  const handleRemoveExercise = (dayIndex: number, exerciseIndex: number) => {
    if (!generatedPlan) return;
    const targetDay = generatedPlan.days[dayIndex];
    if (targetDay.exercises.length <= 1) {
      Alert.alert('Cannot Remove', 'Each training day must contain at least 1 exercise.');
      return;
    }

    const updatedPlan = { ...generatedPlan };
    const updatedDay = { ...targetDay };
    updatedDay.exercises = updatedDay.exercises.filter((_, idx) => idx !== exerciseIndex);
    updatedPlan.days[dayIndex] = updatedDay;
    setGeneratedPlan(updatedPlan);
  };

  // Open inline edit for sets/reps/rest
  const handleOpenEdit = (dayIndex: number, exerciseIndex: number, p: AIExercisePrescription) => {
    setEditingPrescription({
      dayIndex,
      exerciseIndex,
      sets: p.sets,
      reps: String(p.target_reps),
      restSeconds: p.rest_seconds || 90,
    });
  };

  // Save edited prescription
  const handleSaveEdit = () => {
    if (!generatedPlan || !editingPrescription) return;

    const updatedPlan = { ...generatedPlan };
    const targetDay = { ...updatedPlan.days[editingPrescription.dayIndex] };
    const updatedExercises = [...targetDay.exercises];

    const currentP = updatedExercises[editingPrescription.exerciseIndex];
    updatedExercises[editingPrescription.exerciseIndex] = {
      ...currentP,
      sets: editingPrescription.sets,
      target_reps: editingPrescription.reps,
      rest_seconds: editingPrescription.restSeconds,
    };

    targetDay.exercises = updatedExercises;
    updatedPlan.days[editingPrescription.dayIndex] = targetDay;
    setGeneratedPlan(updatedPlan);
    setEditingPrescription(null);
  };

  // Add new day to plan
  const handleAddDay = () => {
    if (!generatedPlan) return;
    const newDayNum = generatedPlan.days.length + 1;
    if (newDayNum > 7) {
      Alert.alert('Max Days Reached', 'A weekly program cannot exceed 7 training days.');
      return;
    }

    // Grab first 3 exercises from catalog as starter
    const starters = allExercises.slice(0, 3).map((e, idx) => ({
      exercise_id: e.id,
      name: e.name,
      order: idx + 1,
      sets: 3,
      target_reps: '8-12',
      rest_seconds: 90,
      alternatives: [],
    }));

    const newDay: AIWorkoutDay = {
      day_number: newDayNum,
      name: `Day ${newDayNum} - Accessory Protocol`,
      focus: 'HYPERTROPHY & ACCESSORY',
      estimated_duration_min: 45,
      exercises: starters,
    };

    const updatedPlan: AIWorkoutPlan = {
      ...generatedPlan,
      days_per_week: newDayNum,
      days: [...generatedPlan.days, newDay],
    };

    setGeneratedPlan(updatedPlan);
    setSelectedDayIndex(newDayNum - 1);
  };

  // Remove a day from plan
  const handleRemoveDay = (dayIndex: number) => {
    if (!generatedPlan) return;
    if (generatedPlan.days.length <= 2) {
      Alert.alert('Cannot Remove', 'Program must have at least 2 training days.');
      return;
    }

    const updatedDays = generatedPlan.days
      .filter((_, idx) => idx !== dayIndex)
      .map((d, idx) => ({ ...d, day_number: idx + 1 }));

    setGeneratedPlan({
      ...generatedPlan,
      days_per_week: updatedDays.length,
      days: updatedDays,
    });
    setSelectedDayIndex(Math.max(0, dayIndex - 1));
  };

  // Final Save & Activation
  const handleSaveAndActivate = async () => {
    if (!generatedPlan) return;
    setIsSaving(true);

    try {
      // 1. Save master plan to SQLite
      await PlanRepository.savePlan(userId, generatedPlan, true);

      // 2. Save each day as a standalone reusable WorkoutTemplate
      for (const day of generatedPlan.days) {
        await TemplateRepository.saveTemplate(
          userId,
          {
            name: `${generatedPlan.name}: ${day.name}`,
            description: `${day.focus} • Generated & Customized Protocol`,
            splitType: generatedPlan.split_type.toUpperCase().includes('UPPER')
              ? 'UPPER'
              : generatedPlan.split_type.toUpperCase().includes('PUSH')
              ? 'PUSH'
              : 'FULL_BODY',
            estimatedDurationMin: day.estimated_duration_min,
          },
          day.exercises.map((p, idx) => ({
            exerciseId: p.exercise_id,
            orderIndex: idx + 1,
            targetSets: p.sets,
            targetReps: String(p.target_reps),
            restSeconds: p.rest_seconds,
            notes: p.instructions || null,
          }))
        );
      }

      Alert.alert(
        'Protocol Activated!',
        `"${generatedPlan.name}" is now your active progression program and has been saved to My Routines.`,
        [
          {
            text: 'View Routines',
            onPress: () => {
              onPlanCreated(generatedPlan);
              onClose();
            },
          },
        ]
      );
    } catch (err) {
      console.error('Failed to save plan and templates:', err);
      Alert.alert('Save Error', 'Failed to save workout protocol. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPickerExercises = allExercises.filter((e) => {
    if (!pickerSearchQuery.trim()) return true;
    const query = pickerSearchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(query) ||
      e.primaryMuscle.toLowerCase().includes(query) ||
      e.equipment.toLowerCase().includes(query)
    );
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header Bar */}
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerCenterCol}>
            <Heading level={2} style={styles.headerTitle}>
              {modalMode === 'REVIEW' ? 'Review & Customize Protocol' : 'Custom Program Architect'}
            </Heading>
            <Caption style={{ color: colors.textSecondary }}>
              {modalMode === 'REVIEW'
                ? 'User has 100% control • Edit, swap, or reorder'
                : '10-Point Biomechanical Questionnaire'}
            </Caption>
          </View>

          <View style={{ width: 28 }} />
        </View>

        {/* MODE 1: QUESTIONNAIRE */}
        {modalMode === 'QUESTIONNAIRE' && (
          <View style={{ flex: 1 }}>
            {/* Step Navigation Pill Tabs */}
            <View style={[styles.stepTabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
              {(['GOALS', 'SCHEDULE', 'LIMITATIONS'] as WizardStep[]).map((step, idx) => {
                const isCurrent = wizardStep === step;
                const label = step === 'GOALS' ? '1. Goals' : step === 'SCHEDULE' ? '2. Schedule' : '3. Biomechanics';
                return (
                  <TouchableOpacity
                    key={step}
                    onPress={() => setWizardStep(step)}
                    style={[
                      styles.stepTabBtn,
                      {
                        borderBottomColor: isCurrent ? (isDark ? colors.cyan : colors.primary) : 'transparent',
                        borderBottomWidth: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepTabText,
                        {
                          color: isCurrent ? (isDark ? colors.cyan : colors.primary) : colors.textMuted,
                          fontWeight: isCurrent ? '800' : '600',
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* STEP 1: GOALS & EXPERIENCE */}
              {wizardStep === 'GOALS' && (
                <View>
                  <View style={styles.sectionHeadingWrap}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      VARIABLE 1 OF 10
                    </Caption>
                    <Heading level={2} style={styles.sectionHeadingTitle}>
                      What is your primary training goal?
                    </Heading>
                    <Caption style={{ color: colors.textSecondary }}>
                      Your exercises, sets, reps, and volume distribution will align with this core focus.
                    </Caption>
                  </View>

                  <View style={styles.goalCardsGrid}>
                    {GOAL_OPTIONS.map((g) => {
                      const isSelected = primaryGoal === g.id;
                      return (
                        <TouchableOpacity
                          key={g.id}
                          onPress={() => setPrimaryGoal(g.id)}
                          activeOpacity={0.8}
                          style={[
                            styles.goalCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.borderSubtle,
                              borderWidth: isSelected ? 2 : 1,
                              borderRadius: borderRadius.md,
                            },
                          ]}
                        >
                          <View style={styles.goalCardHeader}>
                            <View
                              style={[
                                styles.goalIconBox,
                                {
                                  backgroundColor: isSelected
                                    ? isDark
                                      ? 'rgba(0, 229, 255, 0.15)'
                                      : `${colors.primary}15`
                                    : colors.surfaceElevated,
                                  borderRadius: borderRadius.sm,
                                },
                              ]}
                            >
                              <Ionicons
                                name={g.icon}
                                size={18}
                                color={isSelected ? (isDark ? colors.cyan : colors.primary) : colors.textSecondary}
                              />
                            </View>
                            {isSelected && <Badge label="SELECTED" variant="cyan" size="sm" />}
                          </View>

                          <Heading level={3} style={styles.goalCardTitle}>
                            {g.label}
                          </Heading>
                          <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>{g.desc}</Caption>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Divider marginVertical={18} />

                  <View style={styles.sectionHeadingWrap}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      VARIABLE 2 OF 10
                    </Caption>
                    <Heading level={2} style={styles.sectionHeadingTitle}>
                      What is your training experience?
                    </Heading>
                  </View>

                  <View style={styles.expOptionsList}>
                    {EXPERIENCE_OPTIONS.map((e) => {
                      const isSelected = experience === e.id;
                      return (
                        <TouchableOpacity
                          key={e.id}
                          onPress={() => setExperience(e.id)}
                          style={[
                            styles.expOptionCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.borderSubtle,
                              borderWidth: isSelected ? 1.5 : 1,
                              borderRadius: borderRadius.md,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Heading level={3} style={{ fontSize: 15 }}>
                              {e.label}
                            </Heading>
                            <Caption style={{ color: colors.textSecondary }}>{e.desc}</Caption>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color={isDark ? colors.cyan : colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <PrimaryButton
                    title="Continue to Schedule →"
                    onPress={() => setWizardStep('SCHEDULE')}
                    style={{ marginTop: 24 }}
                  />
                </View>
              )}

              {/* STEP 2: SCHEDULE & EQUIPMENT */}
              {wizardStep === 'SCHEDULE' && (
                <View>
                  <View style={styles.sectionHeadingWrap}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      VARIABLE 3 & 4 OF 10
                    </Caption>
                    <Heading level={2} style={styles.sectionHeadingTitle}>
                      Days per week & Session duration
                    </Heading>
                  </View>

                  {/* Days per week */}
                  <Caption style={{ color: colors.textSecondary, marginBottom: 8, fontWeight: '700' }}>
                    TRAINING DAYS PER WEEK
                  </Caption>
                  <View style={styles.numberRow}>
                    {[2, 3, 4, 5, 6].map((num) => {
                      const isSelected = daysPerWeek === num;
                      return (
                        <TouchableOpacity
                          key={num}
                          onPress={() => setDaysPerWeek(num)}
                          style={[
                            styles.numberBox,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.surface,
                              borderColor: colors.border,
                              borderRadius: borderRadius.md,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.numberText,
                              {
                                color: isSelected
                                  ? isDark
                                    ? '#000000'
                                    : '#FFFFFF'
                                  : colors.textPrimary,
                              },
                            ]}
                          >
                            {num}d
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Duration */}
                  <Caption style={{ color: colors.textSecondary, marginTop: 16, marginBottom: 8, fontWeight: '700' }}>
                    PREFERRED SESSION DURATION
                  </Caption>
                  <View style={styles.numberRow}>
                    {[30, 45, 60, 75, 90].map((dur) => {
                      const isSelected = sessionDuration === dur;
                      return (
                        <TouchableOpacity
                          key={dur}
                          onPress={() => setSessionDuration(dur)}
                          style={[
                            styles.numberBox,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.surface,
                              borderColor: colors.border,
                              borderRadius: borderRadius.md,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.numberText,
                              {
                                color: isSelected
                                  ? isDark
                                    ? '#000000'
                                    : '#FFFFFF'
                                  : colors.textPrimary,
                              },
                            ]}
                          >
                            {dur}m
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Divider marginVertical={18} />

                  <View style={styles.sectionHeadingWrap}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      VARIABLE 5 & 6 OF 10
                    </Caption>
                    <Heading level={2} style={styles.sectionHeadingTitle}>
                      Available equipment & Training style
                    </Heading>
                  </View>

                  {/* Equipment Presets */}
                  <Caption style={{ color: colors.textSecondary, marginBottom: 8, fontWeight: '700' }}>
                    AVAILABLE EQUIPMENT
                  </Caption>
                  <View style={styles.expOptionsList}>
                    {EQUIPMENT_PRESETS.map((p) => {
                      const isSelected = equipmentPreset === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setEquipmentPreset(p.id)}
                          style={[
                            styles.expOptionCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.borderSubtle,
                              borderWidth: isSelected ? 1.5 : 1,
                              borderRadius: borderRadius.md,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Heading level={3} style={{ fontSize: 14 }}>
                              {p.label}
                            </Heading>
                            <Caption style={{ color: colors.textSecondary }}>
                              {p.items.join(' • ')}
                            </Caption>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color={isDark ? colors.cyan : colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Training Style */}
                  <Caption style={{ color: colors.textSecondary, marginTop: 14, marginBottom: 8, fontWeight: '700' }}>
                    PREFERRED TRAINING SPLIT STYLE
                  </Caption>
                  <View style={styles.expOptionsList}>
                    {TRAINING_STYLES.map((s) => {
                      const isSelected = preferredStyle === s.id;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          onPress={() => setPreferredStyle(s.id)}
                          style={[
                            styles.expOptionCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.borderSubtle,
                              borderWidth: isSelected ? 1.5 : 1,
                              borderRadius: borderRadius.md,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Heading level={3} style={{ fontSize: 14 }}>
                              {s.label}
                            </Heading>
                            <Caption style={{ color: colors.textSecondary }}>{s.desc}</Caption>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color={isDark ? colors.cyan : colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.wizardBtnRow}>
                    <Button title="← Back" variant="secondary" onPress={() => setWizardStep('GOALS')} style={{ flex: 1 }} />
                    <PrimaryButton
                      title="Next: Biomechanics →"
                      onPress={() => setWizardStep('LIMITATIONS')}
                      style={{ flex: 2 }}
                    />
                  </View>
                </View>
              )}

              {/* STEP 3: BIOMECHANICS & LIMITATIONS */}
              {wizardStep === 'LIMITATIONS' && (
                <View>
                  <View style={styles.sectionHeadingWrap}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      VARIABLE 7 & 8 OF 10
                    </Caption>
                    <Heading level={2} style={styles.sectionHeadingTitle}>
                      Physical limitations & Disliked exercises
                    </Heading>
                    <Caption style={{ color: colors.textSecondary }}>
                      The algorithm will avoid irritating restricted joints and strictly exclude any disliked exercises.
                    </Caption>
                  </View>

                  {/* Physical Limitations */}
                  <Caption style={{ color: colors.textSecondary, marginBottom: 8, fontWeight: '700' }}>
                    PHYSICAL LIMITATIONS (AVOID AGGRAVATING)
                  </Caption>
                  <View style={styles.chipsRow}>
                    {LIMITATION_CHIPS.map((chip) => {
                      const isSelected = limitations.includes(chip);
                      return (
                        <TouchableOpacity
                          key={chip}
                          onPress={() => toggleLimitation(chip)}
                          style={[
                            styles.chipBtn,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? 'rgba(0, 229, 255, 0.15)'
                                  : `${colors.primary}15`
                                : colors.surface,
                              borderColor: isSelected
                                ? isDark
                                  ? colors.cyan
                                  : colors.primary
                                : colors.border,
                              borderRadius: borderRadius.full,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              {
                                color: isSelected
                                  ? isDark
                                    ? colors.cyan
                                    : colors.primary
                                  : colors.textSecondary,
                                fontWeight: isSelected ? '700' : '500',
                              },
                            ]}
                          >
                            {chip}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Disliked Exercises */}
                  <Caption style={{ color: colors.textSecondary, marginTop: 14, marginBottom: 8, fontWeight: '700' }}>
                    DISLIKED EXERCISES (NEVER PRESCRIBE)
                  </Caption>
                  <View style={styles.chipsRow}>
                    {DISLIKED_CHIPS.map((chip) => {
                      const isSelected = dislikedExercises.includes(chip);
                      return (
                        <TouchableOpacity
                          key={chip}
                          onPress={() => toggleDisliked(chip)}
                          style={[
                            styles.chipBtn,
                            {
                              backgroundColor: isSelected
                                ? 'rgba(255, 51, 102, 0.12)'
                                : colors.surface,
                              borderColor: isSelected ? colors.crimson : colors.border,
                              borderRadius: borderRadius.full,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              {
                                color: isSelected ? colors.crimson : colors.textSecondary,
                                fontWeight: isSelected ? '700' : '500',
                              },
                            ]}
                          >
                            {isSelected ? '✕ ' : ''}{chip}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.customAddRow}>
                    <TextInput
                      style={[
                        styles.customInput,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                      placeholder="Add other disliked exercise..."
                      placeholderTextColor={colors.textMuted}
                      value={customDisliked}
                      onChangeText={setCustomDisliked}
                    />
                    <TouchableOpacity
                      onPress={addCustomDisliked}
                      style={[styles.customAddBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                    >
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>+ Add</Text>
                    </TouchableOpacity>
                  </View>

                  <Divider marginVertical={18} />

                  {/* Strength baselines */}
                  <View style={styles.sectionHeadingWrap}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      VARIABLE 9 & 10 OF 10 (OPTIONAL)
                    </Caption>
                    <Heading level={2} style={styles.sectionHeadingTitle}>
                      Current Strength Levels
                    </Heading>
                    <Caption style={{ color: colors.textSecondary }}>
                      Estimated 1-rep max or working weight (kg). Used for prescription baseline calibration.
                    </Caption>
                  </View>

                  <View style={styles.strengthGrid}>
                    <View style={styles.strengthCol}>
                      <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>BENCH PRESS (KG)</Caption>
                      <TextInput
                        style={[
                          styles.strengthInput,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                        keyboardType="numeric"
                        placeholder="e.g. 80"
                        placeholderTextColor={colors.textMuted}
                        value={bench1RM}
                        onChangeText={setBench1RM}
                      />
                    </View>

                    <View style={styles.strengthCol}>
                      <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>BACK SQUAT (KG)</Caption>
                      <TextInput
                        style={[
                          styles.strengthInput,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                        keyboardType="numeric"
                        placeholder="e.g. 110"
                        placeholderTextColor={colors.textMuted}
                        value={squat1RM}
                        onChangeText={setSquat1RM}
                      />
                    </View>

                    <View style={styles.strengthCol}>
                      <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>DEADLIFT (KG)</Caption>
                      <TextInput
                        style={[
                          styles.strengthInput,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                        keyboardType="numeric"
                        placeholder="e.g. 140"
                        placeholderTextColor={colors.textMuted}
                        value={deadlift1RM}
                        onChangeText={setDeadlift1RM}
                      />
                    </View>

                    <View style={styles.strengthCol}>
                      <Caption style={{ color: colors.textMuted, marginBottom: 4 }}>OVERHEAD PRESS (KG)</Caption>
                      <TextInput
                        style={[
                          styles.strengthInput,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                        keyboardType="numeric"
                        placeholder="e.g. 50"
                        placeholderTextColor={colors.textMuted}
                        value={ohp1RM}
                        onChangeText={setOhp1RM}
                      />
                    </View>
                  </View>

                  <View style={styles.wizardBtnRow}>
                    <Button title="← Back" variant="secondary" onPress={() => setWizardStep('SCHEDULE')} style={{ flex: 1 }} />
                    <PrimaryButton
                      title="Synthesize Program ⚡"
                      onPress={handleGenerate}
                      style={{ flex: 2 }}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* MODE 2: GENERATING (LOADING SCREEN) */}
        {modalMode === 'GENERATING' && (
          <View style={styles.generatingContainer}>
            <ActivityIndicator size="large" color={isDark ? colors.cyan : colors.primary} />
            <Heading level={2} style={{ marginTop: 18, marginBottom: 6 }}>
              Synthesizing Optimal Protocol...
            </Heading>
            <Caption style={{ textAlign: 'center', maxWidth: 300, color: colors.textSecondary }}>
              Structuring weekly split, calculating volume balance, avoiding joint restrictions, and assigning biomechanically matched exercises.
            </Caption>
          </View>
        )}

        {/* MODE 3: REVIEW & FULL USER CUSTOMIZATION */}
        {modalMode === 'REVIEW' && generatedPlan && (
          <View style={{ flex: 1 }}>
            {/* Control & Reassurance Banner */}
            <View
              style={[
                styles.reviewBanner,
                {
                  backgroundColor: isDark ? 'rgba(0, 229, 255, 0.08)' : `${colors.primary}12`,
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <Ionicons name="shield-checkmark" size={16} color={isDark ? colors.cyan : colors.primary} />
              <Text
                style={[
                  styles.reviewBannerText,
                  { color: isDark ? colors.cyan : colors.primary },
                ]}
              >
                You are in 100% control • Tap any exercise to edit, swap, or skip
              </Text>
            </View>

            {/* Plan Overview & Day Selector */}
            <View style={[styles.planHeaderSection, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
              <View style={styles.planHeaderTopRow}>
                <View style={{ flex: 1 }}>
                  <Heading level={2} style={styles.planTitleText}>
                    {generatedPlan.name}
                  </Heading>
                  <Caption style={{ color: colors.textSecondary }}>
                    {generatedPlan.split_type} • {generatedPlan.days_per_week} days/wk • {generatedPlan.difficulty}
                  </Caption>
                </View>

                <TouchableOpacity
                  onPress={handleAddDay}
                  style={[styles.addDayBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: '700' }}>+ ADD DAY</Text>
                </TouchableOpacity>
              </View>

              {/* Day Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabsRow}>
                {generatedPlan.days.map((day, idx) => {
                  const isSelected = selectedDayIndex === idx;
                  return (
                    <TouchableOpacity
                      key={day.day_number || idx}
                      onPress={() => setSelectedDayIndex(idx)}
                      style={[
                        styles.dayTabPill,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? colors.cyan
                              : colors.primary
                            : colors.surfaceElevated,
                          borderColor: colors.border,
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayTabText,
                          {
                            color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary,
                            fontWeight: isSelected ? '800' : '600',
                          },
                        ]}
                      >
                        Day {day.day_number}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Current Day Exercise List */}
            {generatedPlan.days[selectedDayIndex] && (
              <ScrollView contentContainerStyle={styles.reviewContent} showsVerticalScrollIndicator={false}>
                <View style={styles.dayFocusRow}>
                  <View style={{ flex: 1 }}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800' }}>
                      DAY {generatedPlan.days[selectedDayIndex].day_number} PROTOCOL
                    </Caption>
                    <Heading level={3} style={styles.dayTitleText}>
                      {generatedPlan.days[selectedDayIndex].name}
                    </Heading>
                    <Caption style={{ color: colors.textSecondary }}>
                      Focus: {generatedPlan.days[selectedDayIndex].focus} • ~
                      {generatedPlan.days[selectedDayIndex].estimated_duration_min} min
                    </Caption>
                  </View>

                  {generatedPlan.days.length > 2 && (
                    <TouchableOpacity
                      onPress={() => handleRemoveDay(selectedDayIndex)}
                      style={styles.removeDayBtn}
                    >
                      <Text style={{ color: colors.crimson, fontSize: 11, fontWeight: '700' }}>Remove Day</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Exercises list */}
                <View style={styles.prescriptionList}>
                  {generatedPlan.days[selectedDayIndex].exercises.map((p, pIdx) => {
                    const matchedCatalogEx = allExercises.find(
                      (e) => e.id === p.exercise_id || e.name === p.name
                    );

                    return (
                      <Card key={p.exercise_id || pIdx} variant="surface" style={styles.prescriptionCard}>
                        <View style={styles.pCardHeader}>
                          <View style={styles.pOrderBadge}>
                            <MonoText style={styles.pOrderText}>{pIdx + 1}</MonoText>
                          </View>

                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => {
                              if (matchedCatalogEx) {
                                setSelectedDetailExercise(matchedCatalogEx);
                              }
                            }}
                          >
                            <Heading level={3} style={styles.pExerciseName}>
                              {p.name}
                            </Heading>
                            <Caption style={{ color: colors.textSecondary }}>
                              {matchedCatalogEx?.primaryMuscle || 'Target'} • {matchedCatalogEx?.equipment || 'Equipment'}
                            </Caption>
                          </TouchableOpacity>

                          {/* Action controls */}
                          <View style={styles.pActionsRow}>
                            <TouchableOpacity
                              onPress={() => handleOpenEdit(selectedDayIndex, pIdx, p)}
                              style={[styles.pActionBtn, { borderColor: colors.border }]}
                            >
                              <Ionicons name="create-outline" size={14} color={isDark ? colors.cyan : colors.primary} />
                              <Text style={[styles.pActionText, { color: isDark ? colors.cyan : colors.primary }]}>
                                EDIT
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => handleStartReplace(selectedDayIndex, pIdx, p)}
                              style={[styles.pActionBtn, { borderColor: colors.border }]}
                            >
                              <Ionicons name="swap-horizontal" size={14} color={colors.amber} />
                              <Text style={[styles.pActionText, { color: colors.amber }]}>SWAP</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => handleRemoveExercise(selectedDayIndex, pIdx)}
                              style={[styles.pActionBtn, { borderColor: colors.border }]}
                            >
                              <Ionicons name="trash-outline" size={14} color={colors.crimson} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Prescription specs bar */}
                        <View style={[styles.pSpecsBar, { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.sm }]}>
                          <Text style={[styles.pSpecsText, { color: colors.textPrimary }]}>
                            <Text style={{ fontWeight: '800', color: isDark ? colors.cyan : colors.primary }}>
                              {p.sets} sets
                            </Text>{' '}
                            × {p.target_reps} reps
                          </Text>
                          <Text style={[styles.pSpecsRest, { color: colors.textMuted }]}>
                            • Rest: {p.rest_seconds}s
                          </Text>
                          {p.target_rpe ? (
                            <Badge label={`RPE ${p.target_rpe}`} variant="neutral" size="sm" />
                          ) : null}
                        </View>
                      </Card>
                    );
                  })}
                </View>

                {/* Add Movement to this Day */}
                <TouchableOpacity
                  onPress={() => {
                    setReplacingTarget({
                      dayIndex: selectedDayIndex,
                      exerciseIndex: generatedPlan.days[selectedDayIndex].exercises.length,
                      prescription: {
                        exercise_id: '',
                        name: '',
                        order: generatedPlan.days[selectedDayIndex].exercises.length + 1,
                        sets: 3,
                        target_reps: '8-12',
                        rest_seconds: 90,
                        alternatives: [],
                      },
                    });
                    setIsPickerVisible(true);
                  }}
                  style={[styles.addMovementBtn, { borderColor: colors.border, borderRadius: borderRadius.md }]}
                >
                  <Ionicons name="add" size={18} color={isDark ? colors.cyan : colors.primary} />
                  <Text style={[styles.addMovementText, { color: isDark ? colors.cyan : colors.primary }]}>
                    + ADD EXERCISE TO THIS DAY
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* Bottom Final Actions */}
            <View style={[styles.reviewBottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <Button
                title="Back to Questionnaire"
                variant="secondary"
                onPress={() => setModalMode('QUESTIONNAIRE')}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title={isSaving ? 'Activating Protocol...' : 'Save & Activate Protocol ✓'}
                onPress={handleSaveAndActivate}
                disabled={isSaving}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}

        {/* INLINE PRESCRIPTION EDITOR MODAL */}
        {editingPrescription && (
          <Modal visible={Boolean(editingPrescription)} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.editModalCard, { backgroundColor: colors.surface, borderRadius: borderRadius.lg }]}>
                <Heading level={2} style={{ marginBottom: 4 }}>
                  Customize Prescribed Volume
                </Heading>
                <Caption style={{ color: colors.textSecondary, marginBottom: 14 }}>
                  Change sets, target repetitions, or rest guidance.
                </Caption>

                {/* Sets */}
                <Caption style={{ fontWeight: '700', marginBottom: 4 }}>SETS</Caption>
                <View style={styles.editRow}>
                  {[2, 3, 4, 5, 6].map((num) => {
                    const isSelected = editingPrescription.sets === num;
                    return (
                      <TouchableOpacity
                        key={num}
                        onPress={() => setEditingPrescription({ ...editingPrescription, sets: num })}
                        style={[
                          styles.editPill,
                          {
                            backgroundColor: isSelected ? (isDark ? colors.cyan : colors.primary) : colors.surfaceElevated,
                            borderColor: colors.border,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                      >
                        <Text style={{ color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary, fontWeight: '700' }}>
                          {num}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Target Reps */}
                <Caption style={{ fontWeight: '700', marginTop: 12, marginBottom: 4 }}>TARGET REPS</Caption>
                <View style={styles.editRow}>
                  {['5', '6-8', '8-12', '12-15', 'AMRAP'].map((rep) => {
                    const isSelected = editingPrescription.reps === rep;
                    return (
                      <TouchableOpacity
                        key={rep}
                        onPress={() => setEditingPrescription({ ...editingPrescription, reps: rep })}
                        style={[
                          styles.editPill,
                          {
                            backgroundColor: isSelected ? (isDark ? colors.cyan : colors.primary) : colors.surfaceElevated,
                            borderColor: colors.border,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                      >
                        <Text style={{ color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary, fontWeight: '700' }}>
                          {rep}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Rest Seconds */}
                <Caption style={{ fontWeight: '700', marginTop: 12, marginBottom: 4 }}>REST DURATION</Caption>
                <View style={styles.editRow}>
                  {[45, 60, 90, 120, 180].map((sec) => {
                    const isSelected = editingPrescription.restSeconds === sec;
                    return (
                      <TouchableOpacity
                        key={sec}
                        onPress={() => setEditingPrescription({ ...editingPrescription, restSeconds: sec })}
                        style={[
                          styles.editPill,
                          {
                            backgroundColor: isSelected ? (isDark ? colors.cyan : colors.primary) : colors.surfaceElevated,
                            borderColor: colors.border,
                            borderRadius: borderRadius.sm,
                          },
                        ]}
                      >
                        <Text style={{ color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary, fontWeight: '700' }}>
                          {sec}s
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.editModalBtns}>
                  <Button title="Cancel" variant="secondary" onPress={() => setEditingPrescription(null)} style={{ flex: 1 }} />
                  <PrimaryButton title="Apply Changes" onPress={handleSaveEdit} style={{ flex: 1 }} />
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* EXERCISE REPLACEMENT & ADD PICKER MODAL */}
        {isPickerVisible && (
          <Modal visible={isPickerVisible} animationType="slide" onRequestClose={() => setIsPickerVisible(false)}>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
              <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setIsPickerVisible(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Heading level={2}>
                  {replacingTarget?.prescription?.name ? `Replace "${replacingTarget.prescription.name}"` : 'Select Exercise'}
                </Heading>
                <View style={{ width: 28 }} />
              </View>

              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Suitable Alternatives Section */}
                {replacingAlternatives.length > 0 && !pickerSearchQuery.trim() && (
                  <View style={{ marginBottom: 16 }}>
                    <Caption upper style={{ color: isDark ? colors.cyan : colors.primary, fontWeight: '800', marginBottom: 8 }}>
                      BIOMECHANICALLY MATCHED ALTERNATIVES
                    </Caption>
                    {replacingAlternatives.map((alt) => (
                      <TouchableOpacity
                        key={alt.id}
                        onPress={() => handleApplyReplacement(alt)}
                        style={[
                          styles.pickerAltCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: isDark ? colors.cyan : colors.primary,
                            borderRadius: borderRadius.md,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Heading level={3} style={{ fontSize: 15 }}>
                              {alt.name}
                            </Heading>
                            <Badge label="SUITABLE" variant="cyan" size="sm" />
                          </View>
                          <Caption style={{ color: colors.textSecondary }}>
                            Target: {alt.primaryMuscle} • {alt.equipment} • {alt.difficulty || 'INTERMEDIATE'}
                          </Caption>
                        </View>
                        <Ionicons name="swap-horizontal" size={18} color={isDark ? colors.cyan : colors.primary} />
                      </TouchableOpacity>
                    ))}
                    <Divider marginVertical={12} />
                    <Caption upper style={{ color: colors.textMuted, fontWeight: '800', marginBottom: 6 }}>
                      OR BROWSE ALL CATALOG MOVEMENTS
                    </Caption>
                  </View>
                )}

                <TextInput
                  style={[
                    styles.customInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: borderRadius.md,
                      marginBottom: 12,
                    },
                  ]}
                  placeholder="Search exercise by name, muscle, or equipment..."
                  placeholderTextColor={colors.textMuted}
                  value={pickerSearchQuery}
                  onChangeText={setPickerSearchQuery}
                />

                <View style={{ gap: 6 }}>
                  {filteredPickerExercises.map((ex) => (
                    <TouchableOpacity
                      key={ex.id}
                      onPress={() => handleApplyReplacement(ex)}
                      style={[
                        styles.pickerItem,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.borderSubtle,
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Heading level={3} style={{ fontSize: 14 }}>
                          {ex.name}
                        </Heading>
                        <Caption style={{ color: colors.textSecondary }}>
                          {ex.primaryMuscle} • {ex.equipment}
                        </Caption>
                      </View>
                      <Badge label={ex.movementPattern.replace(/_/g, ' ')} variant="neutral" size="sm" />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </Modal>
        )}

        {/* Exercise Detail Modal for inspections */}
        <ExerciseDetailModal
          visible={Boolean(selectedDetailExercise)}
          exercise={selectedDetailExercise}
          onClose={() => setSelectedDetailExercise(null)}
          onSelectAlternative={(newEx) => {
            handleApplyReplacement(newEx);
            setSelectedDetailExercise(null);
          }}
          isSwapMode={Boolean(replacingTarget)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 4,
  },
  headerCenterCol: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  stepTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  stepTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stepTabText: {
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeadingWrap: {
    marginBottom: 14,
  },
  sectionHeadingTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
    marginBottom: 4,
  },
  goalCardsGrid: {
    gap: 10,
  },
  goalCard: {
    padding: 14,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  expOptionsList: {
    gap: 8,
  },
  expOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 8,
  },
  numberBox: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  numberText: {
    fontSize: 14,
    fontWeight: '800',
  },
  wizardBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  customAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  customInput: {
    flex: 1,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    fontSize: 13,
  },
  customAddBtn: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 4,
  },
  strengthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  strengthCol: {
    width: '48%',
  },
  strengthInput: {
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  generatingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  reviewBannerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  planHeaderSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  planHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planTitleText: {
    fontSize: 18,
    fontWeight: '800',
  },
  addDayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  dayTabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayTabPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  dayTabText: {
    fontSize: 12,
  },
  reviewContent: {
    padding: 16,
    paddingBottom: 90,
  },
  dayFocusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dayTitleText: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
    marginBottom: 2,
  },
  removeDayBtn: {
    padding: 4,
  },
  prescriptionList: {
    gap: 10,
  },
  prescriptionCard: {
    padding: 12,
  },
  pCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pOrderBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pOrderText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pExerciseName: {
    fontSize: 15,
    fontWeight: '800',
  },
  pActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 4,
  },
  pActionText: {
    fontSize: 9,
    fontWeight: '800',
  },
  pSpecsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  pSpecsText: {
    fontSize: 12,
  },
  pSpecsRest: {
    fontSize: 11,
  },
  addMovementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 14,
    gap: 6,
  },
  addMovementText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reviewBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 380,
    padding: 18,
  },
  editRow: {
    flexDirection: 'row',
    gap: 6,
  },
  editPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  editModalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  pickerAltCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
  },
});
